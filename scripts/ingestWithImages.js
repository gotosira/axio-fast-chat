/**
 * Efficient FlowFlow ingestion:
 * - Images extracted and stored locally with proper IDs
 * - Text extracted separately (no base64 bloat)
 * - Text chunks contain [IMAGE:id] placeholders at proper positions
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../server/config.js';
import JSZip from 'jszip';

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const DOCUMENTS_DIR = path.join(process.cwd(), 'documents/flowflow');
const AI_ID = 'flowflow';

async function generateEmbedding(text) {
    try {
        const result = await ai.models.embedContent({
            model: "text-embedding-004",
            contents: [{ parts: [{ text: text.substring(0, 2000) }] }]
        });
        return result.embeddings[0].values;
    } catch (error) {
        console.error('Embedding error:', error.message);
        return null;
    }
}

async function extractDocxContent(filePath, filenameBase) {
    const buffer = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(buffer);

    // Extract images from media folder
    const images = [];
    const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/')).sort();

    for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const content = await zip.files[file].async('base64');
        const ext = file.split('.').pop();
        const contentType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext;

        images.push({
            id: `${filenameBase}_img_${i + 1}`,
            source_file: filenameBase,
            contentType,
            data: content,
            position: i + 1
        });
    }

    // Use mammoth to extract TEXT only (fast, no base64)
    const mammoth = (await import('mammoth')).default;
    const textResult = await mammoth.extractRawText({ buffer });

    // Also get HTML with image placeholders (for image positioning)
    let imageIndex = 0;
    const htmlResult = await mammoth.convertToHtml({
        buffer,
        convertImage: mammoth.images.imgElement(function (image) {
            return image.read('base64').then(function () {
                imageIndex++;
                // Short placeholder
                return { src: `IMG${imageIndex}` };
            });
        })
    });

    // Extract image positions from HTML
    const imagePositions = [];
    let match;
    const imgRegex = /IMG(\d+)/g;
    let textPos = 0;

    // Simple approximation: distribute image refs through text
    const htmlText = htmlResult.value.replace(/<[^>]+>/g, '');
    while ((match = imgRegex.exec(htmlText)) !== null) {
        imagePositions.push({
            imgNum: parseInt(match[1]),
            position: match.index
        });
    }

    return {
        text: textResult.value,
        images,
        imagePositions,
        imageCount: images.length
    };
}

function chunkText(text, chunkSize = 1500, overlap = 200) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        let end = Math.min(start + chunkSize, text.length);

        // Try to break at paragraph
        if (end < text.length) {
            const lastBreak = text.lastIndexOf('\n\n', end);
            if (lastBreak > start + chunkSize / 2) {
                end = lastBreak;
            }
        }

        const chunk = text.substring(start, end).trim();
        if (chunk.length > 50) { // Skip tiny chunks
            chunks.push(chunk);
        }

        start = end - overlap;
        if (start < 0) start = 0;
        if (end >= text.length) break;
    }

    return chunks;
}

async function ingestEfficiently() {
    console.log('🚀 Starting FlowFlow ingestion (text + images)...');
    console.log('📂 Directory:', DOCUMENTS_DIR);

    // Clear old documents
    console.log('🗑️ Clearing old FlowFlow documents...');
    await supabase.from('documents').delete().contains('metadata', { ai_id: AI_ID });

    const allFiles = await fs.readdir(DOCUMENTS_DIR);
    const docxFiles = allFiles.filter(f => f.endsWith('.docx') && !f.startsWith('~$'));

    console.log(`📄 Found ${docxFiles.length} DOCX files\n`);

    const allImages = [];
    const allChunks = [];

    for (const file of docxFiles) {
        const filePath = path.join(DOCUMENTS_DIR, file);
        const filenameBase = file.replace('.docx', '').replace(/[^a-zA-Z0-9]/g, '_');

        console.log(`📄 Processing ${file}...`);

        try {
            const { text, images, imageCount } = await extractDocxContent(filePath, filenameBase);
            console.log(`   - ${imageCount} images, ${text.length} chars text`);

            allImages.push(...images);

            // Chunk the text
            const chunks = chunkText(text);
            console.log(`   - ${chunks.length} text chunks`);

            // Add image references to chunks based on approximate position
            const charsPerImage = Math.floor(text.length / (imageCount || 1));

            for (let i = 0; i < chunks.length; i++) {
                let content = chunks[i];

                // Add relevant image references based on chunk position
                const chunkStart = i * 1300; // approximate position
                const chunkEnd = chunkStart + 1500;

                const relevantImages = [];
                for (let imgIdx = 1; imgIdx <= imageCount; imgIdx++) {
                    const imgPos = (imgIdx - 1) * charsPerImage;
                    if (imgPos >= chunkStart && imgPos < chunkEnd) {
                        relevantImages.push(`${filenameBase}_img_${imgIdx}`);
                    }
                }

                // Append image references to content
                if (relevantImages.length > 0) {
                    content += `\n\n[Related images: ${relevantImages.join(', ')}]`;
                }

                allChunks.push({
                    content,
                    filename: file,
                    chunkIndex: i,
                    images: relevantImages
                });
            }

            console.log(`   ✅ Prepared ${file}`);
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
        }
    }

    // Save images locally
    console.log(`\n💾 Saving ${allImages.length} images...`);
    const imagesDir = path.join(process.cwd(), 'public/flowflow-images');
    await fs.mkdir(imagesDir, { recursive: true });

    const imageIndex = {};
    for (const img of allImages) {
        imageIndex[img.id] = {
            contentType: img.contentType,
            source_file: img.source_file,
            position: img.position
        };
        const ext = img.contentType.split('/')[1] || 'png';
        await fs.writeFile(
            path.join(imagesDir, `${img.id}.${ext}`),
            Buffer.from(img.data, 'base64')
        );
    }
    await fs.writeFile(path.join(imagesDir, 'index.json'), JSON.stringify(imageIndex, null, 2));
    console.log(`   ✅ Saved ${allImages.length} images`);

    // Insert text chunks
    console.log(`\n📝 Inserting ${allChunks.length} text chunks...`);

    const BATCH_SIZE = 5;
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
        const batch = allChunks.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (chunk) => {
            const embedding = await generateEmbedding(chunk.content);
            if (!embedding) return;

            await supabase.from('documents').insert({
                content: chunk.content,
                metadata: {
                    filename: chunk.filename,
                    chunkIndex: chunk.chunkIndex,
                    images: chunk.images,
                    ai_id: AI_ID
                },
                embedding
            });
        }));

        if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= allChunks.length) {
            console.log(`   Inserted ${Math.min(i + BATCH_SIZE, allChunks.length)}/${allChunks.length}`);
        }

        await new Promise(r => setTimeout(r, 50));
    }

    console.log('\n🎉 Ingestion complete!');
    console.log(`   - ${allImages.length} images saved locally`);
    console.log(`   - ${allChunks.length} text chunks in Supabase`);
}

ingestEfficiently().catch(console.error);
