
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../server/config.js';
import mammoth from 'mammoth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// Initialize Gemini (for embeddings)
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const DOCUMENTS_DIR = path.join(process.cwd(), 'documents/baobao');
const AI_ID = 'baobao';

// Helper: Read file content
async function readFileContent(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    try {
        if (ext === '.md' || ext === '.txt') {
            return await fs.readFile(filePath, 'utf-8');
        } else if (ext === '.docx') {
            const buffer = await fs.readFile(filePath);
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        } else if (ext === '.pdf') {
            const buffer = await fs.readFile(filePath);
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
            return result.text;
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
    let files;
    try {
        files = await fs.readdir(DOCUMENTS_DIR);
    } catch (err) {
        console.error(`❌ Error reading directory: ${err.message}`);
        return;
    }

    for (const file of files) {
        if (file.startsWith('.')) continue; // Skip hidden files

        // Skip directories (simple check)
        const filePath = path.join(DOCUMENTS_DIR, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) continue;

        console.log(`📄 Processing ${file}...`);

        const content = await readFileContent(filePath);
        if (!content) {
            console.warn(`⚠️ Skipping ${file} (empty or unsupported)`);
            continue;
        }

        // 2. Delete existing documents for this file and AI ID to prevent duplicates
        // Note: This relies on the metadata column containing a JSON object with filename and ai_id
        // We need to cast metadata to jsonb to query it effectively if it's stored as text/json
        // Or we can just delete by filename if we assume filenames are unique enough or if we filter by ai_id if possible.
        // Since the schema definition for 'documents' table isn't fully visible (it was likely created via dashboard or previous migration not fully shown),
        // we will attempt to delete based on metadata filter.

        console.log(`   - Cleaning up old entries for ${file}...`);
        const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .contains('metadata', { filename: file, ai_id: AI_ID });

        if (deleteError) {
            console.warn(`   ⚠️ Error deleting old entries (might be fine if none exist):`, deleteError.message);
        }

        // 3. Chunk content
        const chunks = chunkText(content);
        console.log(`   - Split into ${chunks.length} chunks`);

        // 4. Process each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // Generate Embedding
            const embedding = await generateEmbedding(chunk);
            if (!embedding) continue;

            // Upsert to Supabase
            const { error } = await supabase
                .from('documents')
                .insert({
                    content: chunk,
                    metadata: { filename: file, chunkIndex: i, ai_id: AI_ID },
                    embedding: embedding
                });

            if (error) {
                console.error(`   ❌ Error inserting chunk ${i}:`, error);
            } else {
                // console.log(`   ✅ Chunk ${i} stored.`);
            }

            // Rate limit protection (simple delay)
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log(`   ✅ Finished ${file}`);
    }
    console.log('🎉 Ingestion complete!');
}

ingestDocuments();
