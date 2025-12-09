
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
};

if (!config.supabaseUrl || !config.supabaseAnonKey || !config.geminiApiKey) {
    console.error('Missing environment variables. Please check .env file.');
    process.exit(1);
}

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

async function verifyRetrieval() {
    const query = "What are the if-then rules for pronouns?";
    console.log(`Querying: "${query}"`);

    try {
        // 1. Generate embedding
        const embeddingResult = await ai.models.embedContent({
            model: "text-embedding-004",
            contents: [{ parts: [{ text: query }] }]
        });
        const embedding = embeddingResult.embeddings[0].values;

        // 2. Search in Supabase
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: 0.1,
            match_count: 5
        });

        if (error) {
            console.error('Error searching documents:', error);
            return;
        }

        console.log(`Found ${documents.length} documents.`);
        documents.forEach((doc, index) => {
            console.log(`\n[${index + 1}] Score: ${doc.similarity}`);
            console.log(`Metadata:`, doc.metadata);
            console.log(`Content Preview: ${doc.content.substring(0, 150)}...`);
        });

    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verifyRetrieval();
