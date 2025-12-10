
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../server/config.js';
import mammoth from 'mammoth';

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// Initialize Gemini (for embeddings)
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const DOCUMENTS_DIR = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.cwd(), 'documents/flowflow');
const AI_ID = 'flowflow';

// Helper: Read file content (text only - images served separately via lazy loading)
async function readFileContent(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    try {
        if (ext === '.md' || ext === '.txt') {
            return await fs.readFile(filePath, 'utf-8');
        } else if (ext === '.docx') {
            const buffer = await fs.readFile(filePath);
            // Use extractRawText for text (images loaded on-demand via /api/images)
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        }
        return null;
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return null;
    }
}

// Helper: Chunk text
function chunkText(text, chunkSize = 1000, overlap = 100) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.substring(start, end));
        start += chunkSize - overlap;
    }
    return chunks;
}

// Helper: Generate Embedding
async function generateEmbedding(text) {
    try {
        const result = await ai.models.embedContent({
            model: "text-embedding-004",
            contents: [{ parts: [{ text: text }] }]
        });
        return result.embeddings[0].values;
    } catch (error) {
        console.error('Error generating embedding:', error);
        return null;
    }
}

async function ingestDocuments() {
    console.log(`🚀 Starting ingestion for ${AI_ID}...`);
    console.log(`📂 Directory: ${DOCUMENTS_DIR}`);

    // 1. Get all files
    const files = await fs.readdir(DOCUMENTS_DIR);

    for (const file of files) {
        if (file.startsWith('.')) continue; // Skip hidden files

        const filePath = path.join(DOCUMENTS_DIR, file);
        console.log(`📄 Processing ${file}...`);

        const content = await readFileContent(filePath);
        if (!content) {
            console.warn(`⚠️ Skipping ${file} (empty or unsupported)`);
            continue;
        }

        // 2. Delete existing documents for this file (cleanup)
        // We try to delete by filename. If previous ingestion didn't have ai_id, we might need to be careful.
        // But since we are adding ai_id now, let's try to delete any doc with this filename.
        console.log(`   - Cleaning up old entries for ${file}...`);
        const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .contains('metadata', { filename: file }); // Delete matches by filename, regardless of ai_id for now to clean up legacy

        if (deleteError) {
            console.warn(`   ⚠️ Error deleting old entries:`, deleteError.message);
        }

        // 3. Chunk content
        const chunks = chunkText(content);
        console.log(`   - Split into ${chunks.length} chunks`);

        // 4. Process chunks in parallel batches
        const BATCH_SIZE = 10;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async (chunk, batchIndex) => {
                const globalIndex = i + batchIndex;

                // Generate Embedding
                const embedding = await generateEmbedding(chunk);
                if (!embedding) return;

                // Insert to Supabase
                const { error } = await supabase
                    .from('documents')
                    .insert({
                        content: chunk,
                        metadata: { filename: file, chunkIndex: globalIndex, ai_id: AI_ID },
                        embedding: embedding
                    });

                if (error) {
                    console.error(`   ❌ Error inserting chunk ${globalIndex}:`, error);
                }
            });

            await Promise.all(batchPromises);
            // Small delay between batches to be nice
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        console.log(`   ✅ Finished ${file}`);
    }
    console.log('🎉 Ingestion complete!');
}

ingestDocuments();
