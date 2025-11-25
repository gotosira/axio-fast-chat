import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { generateAIResponse, generateAIResponseStream, generateTipOfTheDay } from './geminiService.js';
import { conversationDB, messageDB, fileDB, supabase } from './supabaseDB.js';
import { mcpManager } from './mcp/McpClientManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Root route for health check
app.get('/', (req, res) => {
    res.send('🤖 Generative AI API is running! Access the frontend app at http://localhost:5173');
});

// Serve static files from the 'documents' directory (optional, for debugging)
// app.use('/documents', express.static(path.join(__dirname, '../documents')));/AXIO-FAST-CHAT/documents/baobao';

// Path to knowledge base - Relative for Vercel/Production
const KNOWLEDGE_BASE_PATH = path.join(process.cwd(), 'documents/baobao');

/**
 * Read all files from the knowledge base
 */
async function loadAllDocuments() {
    try {
        const files = await fs.readdir(KNOWLEDGE_BASE_PATH);
        const documents = [];

        for (const file of files) {
            // Only process .txt files (skip .docx and directories for now)
            if (file.endsWith('.txt')) {
                const filePath = path.join(KNOWLEDGE_BASE_PATH, file);
                const stats = await fs.stat(filePath);

                if (stats.isFile()) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    documents.push({
                        filename: file,
                        content: content,
                        category: categorizeFile(file)
                    });
                }
            }
        }

        return documents;
    } catch (error) {
        console.error('Error loading documents:', error);
        return [];
    }
}

/**
 * Categorize file based on filename
 */
function categorizeFile(filename) {
    const lower = filename.toLowerCase();

    if (lower.includes('empty state')) return 'Empty States';
    if (lower.includes('error')) return 'Error Pages';
    if (lower.includes('loading')) return 'Loading States';
    if (lower.includes('placeholder')) return 'Placeholders';
    if (lower.includes('tooltip')) return 'Tooltips';
    if (lower.includes('gender')) return 'Inclusive Language - Gender';
    if (lower.includes('disability')) return 'Inclusive Language - Disability';
    if (lower.includes('medical')) return 'Inclusive Language - Medical';
    if (lower.includes('races')) return 'Inclusive Language - Races';

    return 'General';
}

/**
 * Search documents based on query
 */
/**
 * Search documents based on query
 * Uses N-gram matching to support languages without spaces like Thai
 */
function searchDocuments(documents, query) {
    const queryLower = query.toLowerCase();
    // Split query into words for flexible matching (good for English)
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

    // Generate trigrams for the query (good for Thai/continuous text)
    const queryTrigrams = generateNGrams(queryLower, 3);

    const results = [];

    for (const doc of documents) {
        const contentLower = doc.content.toLowerCase();
        const filenameLower = doc.filename.toLowerCase();

        // Simple relevance scoring
        let score = 0;

        // 1. Exact matches (High priority)
        if (filenameLower.includes(queryLower)) score += 20;
        if (contentLower.includes(queryLower)) score += 10;

        // 2. Word-based matching (English/Spaced languages)
        let wordMatches = 0;
        for (const word of queryWords) {
            if (contentLower.includes(word)) {
                wordMatches++;
            }
        }
        if (wordMatches > 0) {
            score += (wordMatches / queryWords.length) * 5;
        }

        // 3. N-gram matching (Thai/Continuous languages)
        // Only apply if we have trigrams
        if (queryTrigrams.length > 0) {
            let trigramMatches = 0;
            for (const gram of queryTrigrams) {
                if (contentLower.includes(gram)) {
                    trigramMatches++;
                }
            }
            // Calculate overlap ratio
            const matchRatio = trigramMatches / queryTrigrams.length;

            // If significant overlap found (e.g. > 10% of query parts found)
            if (matchRatio > 0.1) {
                score += matchRatio * 20;
            }
        }

        // 4. Category match
        if (doc.category.toLowerCase().includes(queryLower)) score += 5;

        if (score > 1) { // Threshold to filter noise
            // Extract relevant excerpts
            const excerpts = extractRelevantExcerpts(doc.content, queryWords, queryTrigrams);
            results.push({
                ...doc,
                score,
                excerpts
            });
        }
    }

    // Sort by relevance score
    return results.sort((a, b) => b.score - a.score);
}

/**
 * Generate N-grams from text
 */
function generateNGrams(text, n) {
    if (!text || text.length < n) return [];
    const ngrams = [];
    for (let i = 0; i <= text.length - n; i++) {
        ngrams.push(text.substring(i, i + n));
    }
    return ngrams;
}

/**
 * Extract relevant excerpts from content
 */
function extractRelevantExcerpts(content, queryWords, queryTrigrams = [], maxExcerpts = 3) {
    const lines = content.split('\n');
    const excerpts = [];

    for (let i = 0; i < lines.length && excerpts.length < maxExcerpts; i++) {
        const lineLower = lines[i].toLowerCase();
        let hasMatch = false;

        // Check word matches
        if (queryWords.some(word => lineLower.includes(word))) {
            hasMatch = true;
        }

        // Check trigram matches (if no word match found yet)
        if (!hasMatch && queryTrigrams.length > 0) {
            // Require at least 2 trigrams to match to consider it a relevant line (reduce noise)
            let matchCount = 0;
            for (const gram of queryTrigrams) {
                if (lineLower.includes(gram)) {
                    matchCount++;
                    if (matchCount >= 2) {
                        hasMatch = true;
                        break;
                    }
                }
            }
        }

        if (hasMatch) {
            // Get context: 2 lines before and after
            const start = Math.max(0, i - 2);
            const end = Math.min(lines.length, i + 3);
            const excerpt = lines.slice(start, end).join('\n');
            excerpts.push(excerpt.trim());

            // Skip ahead to avoid overlapping excerpts
            i += 4;
        }
    }

    return excerpts;
}

// API Endpoints

/**
 * Search endpoint
 */
app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const documents = await loadAllDocuments();
        const results = searchDocuments(documents, query);

        res.json({
            success: true,
            query,
            resultsCount: results.length,
            results: results.slice(0, 10) // Return top 10 results
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get all documents
 */
app.get('/api/documents', async (req, res) => {
    try {
        const documents = await loadAllDocuments();
        res.json({
            success: true,
            count: documents.length,
            documents: documents.map(doc => ({
                filename: doc.filename,
                category: doc.category,
                size: doc.content.length
            }))
        });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get specific document
 */
app.get('/api/documents/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(KNOWLEDGE_BASE_PATH, filename);

        const content = await fs.readFile(filePath, 'utf-8');

        res.json({
            success: true,
            filename,
            category: categorizeFile(filename),
            content
        });
    } catch (error) {
        console.error('Error loading document:', error);
        res.status(404).json({ error: 'Document not found' });
    }
});

// ============ CONVERSATION MANAGEMENT ============

// Get all conversations
app.get('/api/conversations', async (req, res) => {
    try {
        const { ai_id } = req.query;
        const conversations = await conversationDB.getAll(ai_id);
        res.json(conversations);
    } catch (error) {
        console.error('Error getting conversations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single conversation with messages
app.get('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const conversation = await conversationDB.get(id);

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const messages = await messageDB.getByConversation(id);
        console.log(`Found ${messages.length} messages for conversation ${id}`);

        // Helper for safe JSON parsing
        const safeParse = (str) => {
            try {
                if (!str) return null;
                // If it's already an object (shouldn't happen with text column but good safety), return it
                if (typeof str === 'object') return str;
                return JSON.parse(str);
            } catch (e) {
                console.warn('Failed to parse JSON:', str, e.message);
                return str; // Return original string as fallback
            }
        };

        // Parse file_data and reference_data back to objects
        const parsedMessages = messages.map(msg => ({
            ...msg,
            file: safeParse(msg.file_data),
            references: safeParse(msg.reference_data),
            created_at: msg.created_at, // Include timestamp
            file_data: undefined, // Remove raw field
            reference_data: undefined // Remove raw field
        }));

        res.json({
            ...conversation,
            messages: parsedMessages
        });
    } catch (error) {
        console.error('Error getting conversation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new conversation
app.post('/api/conversations', async (req, res) => {
    try {
        const conversation = req.body;
        console.log('📝 Creating conversation:', conversation.id, 'Title:', conversation.title, 'AI ID:', conversation.ai_id);
        await conversationDB.create(conversation);
        res.json({ success: true });
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update conversation
app.put('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        await conversationDB.update(id, { title });
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating conversation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Touch conversation (update timestamp)
app.patch('/api/conversations/:id/touch', async (req, res) => {
    try {
        const { id } = req.params;
        await conversationDB.touch(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error touching conversation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a conversation
app.delete('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await conversationDB.delete(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting conversation:', error);
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});

// --- Asset Library Endpoints ---

// Upload a file
app.post('/api/upload', async (req, res) => {
    try {
        const { file, conversation_id } = req.body;
        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const fileId = uuidv4();
        const newFile = {
            id: fileId,
            conversation_id: conversation_id || null,
            filename: file.name,
            file_type: file.type.split('/')[0], // 'image', 'application', etc.
            mime_type: file.type,
            file_size: file.size,
            storage_url: file.data, // Storing base64 for now
        };

        const savedFile = await fileDB.create(newFile);
        res.json(savedFile);
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// Get all assets
app.get('/api/assets', async (req, res) => {
    try {
        const assets = await fileDB.getAll();
        res.json(assets);
    } catch (error) {
        console.error('Error fetching assets:', error);
        res.status(500).json({ error: 'Failed to fetch assets' });
    }
});

// Delete an asset
app.delete('/api/assets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await fileDB.delete(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting asset:', error);
        res.status(500).json({ error: 'Failed to delete asset' });
    }
});

// --- User Preferences Endpoints ---

// Get user preferences
app.get('/api/preferences', async (req, res) => {
    try {
        const userId = req.query.user_id || 'default_user';

        const { data, error } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        // If no preferences found, create default ones
        if (!data) {
            const defaultPrefs = {
                user_id: userId,
                pinned_ais: ['baobao', 'deedee'],
                ai_order: ['baobao', 'deedee', 'pungpung', 'flowflow']
            };

            const { data: newData, error: insertError } = await supabase
                .from('user_preferences')
                .insert([defaultPrefs])
                .select()
                .single();

            if (insertError) throw insertError;

            return res.json(newData);
        }

        res.json(data);
    } catch (error) {
        console.error('Error fetching preferences:', error);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
});

// Update user preferences
app.put('/api/preferences', async (req, res) => {
    try {
        const { user_id = 'default_user', pinned_ais, ai_order } = req.body;

        const updates = {
            updated_at: new Date().toISOString()
        };

        if (pinned_ais !== undefined) updates.pinned_ais = pinned_ais;
        if (ai_order !== undefined) updates.ai_order = ai_order;

        const { data, error } = await supabase
            .from('user_preferences')
            .update(updates)
            .eq('user_id', user_id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

// --- Gemini AI Integration ---
// Create message
app.post('/api/messages', async (req, res) => {
    try {
        const message = req.body;

        // If message has file data, save it to uploaded_files table
        if (message.file_data) {
            try {
                const fileData = JSON.parse(message.file_data);
                const fileId = crypto.randomUUID(); // Generate ID for file record

                await fileDB.create({
                    id: fileId,
                    conversation_id: message.conversation_id,
                    filename: fileData.name || 'unknown',
                    file_type: fileData.mimeType.startsWith('image/') ? 'image' : 'document',
                    mime_type: fileData.mimeType,
                    file_size: fileData.data.length * 0.75, // Approx size from base64
                    storage_url: message.file_data // Storing full JSON for now as per current logic
                });

                // Link file to message
                message.file_id = fileId;

            } catch (fileError) {
                console.error('Error saving file record:', fileError);
                // Continue saving message even if file record fails
            }
        }

        await messageDB.create(message);
        res.json({ success: true });
    } catch (error) {
        console.error('Error creating message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Chat endpoint with Gemini integration
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { message, file, location, ai_id, conversation_id } = req.body;

        if (!message && !file) {
            return res.status(400).json({ error: 'Message or file is required' });
        }

        // Search knowledge base
        const documents = await loadAllDocuments();
        const searchResults = message ? searchDocuments(documents, message) : [];

        console.log(`💬 [${ai_id || 'baobao'}] Query: "${message || '[File Upload]'}" - Found ${searchResults.length} results`);

        // Fetch conversation history
        let history = [];
        if (conversation_id) {
            try {
                const recentMessages = await messageDB.getByConversation(conversation_id);
                // Sort by created_at asc (oldest first) and take last 10
                history = recentMessages
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                    .slice(-10)
                    .map(msg => ({
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: [{ text: msg.content }]
                    }));
                console.log(`📜 Loaded ${history.length} previous messages for context`);
            } catch (histError) {
                console.warn('Failed to load history:', histError);
            }
        }

        // Set up SSE (Server-Sent Events) for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        try {
            const query = message || 'Analyze this file';
            const results = searchResults;
            const fileData = file;

            // Generate response using Gemini with Streaming
            const stream = generateAIResponseStream(query, results, fileData, location, ai_id || 'baobao', history);

            // Stream chunks as they arrive
            let buffer = '';
            let isThinking = false;

            for await (const chunk of stream) {
                buffer += chunk;

                // Check for start of thinking block
                if (!isThinking && buffer.includes('> **กระบวนการคิด:**')) {
                    isThinking = true;
                    // Remove the marker from buffer to avoid sending it as text
                    buffer = buffer.replace('> **กระบวนการคิด:**', '');
                }

                if (isThinking) {
                    // Check for end of thinking block (double newline usually signals end of blockquote)
                    const endMatch = buffer.match(/\n\s*\n/);
                    if (endMatch) {
                        const endIdx = endMatch.index;
                        const thoughtContent = buffer.substring(0, endIdx);
                        const remaining = buffer.substring(endIdx + endMatch[0].length);

                        // Send the last part of thought
                        if (thoughtContent.trim()) {
                            res.write(`data: ${JSON.stringify({
                                type: 'thinking',
                                text: thoughtContent.replace(/^>\s*/gm, '') // Clean up > markers
                            })}\n\n`);
                        }

                        // Switch to normal text
                        isThinking = false;
                        buffer = remaining;

                        // Send any remaining text immediately
                        if (buffer) {
                            res.write(`data: ${JSON.stringify({
                                type: 'text',
                                text: buffer
                            })}\n\n`);
                            buffer = '';
                        }
                    } else {
                        // Still in thinking block, send accumulated buffer as thought
                        // We need to be careful not to break markers, so maybe send line by line?
                        // For simplicity, let's send what we have if it ends with newline
                        if (buffer.includes('\n')) {
                            const lines = buffer.split('\n');
                            // Keep the last line in buffer in case it's incomplete
                            const lastLine = lines.pop();
                            const textToSend = lines.join('\n');

                            if (textToSend.trim()) {
                                res.write(`data: ${JSON.stringify({
                                    type: 'thinking',
                                    text: textToSend.replace(/^>\s*/gm, '')
                                })}\n\n`);
                            }
                            buffer = lastLine + (lastLine ? '' : ''); // Add back last line
                        }
                    }
                } else {
                    // Normal text mode
                    if (buffer) {
                        res.write(`data: ${JSON.stringify({
                            type: 'text',
                            text: buffer
                        })}\n\n`);
                        buffer = '';
                    }
                }
            }

            // Flush remaining buffer
            if (buffer) {
                if (isThinking) {
                    res.write(`data: ${JSON.stringify({
                        type: 'thinking',
                        text: buffer.replace(/^>\s*/gm, '')
                    })}\n\n`);
                } else {
                    res.write(`data: ${JSON.stringify({
                        type: 'text',
                        text: buffer
                    })}\n\n`);
                }
            }

            // Send References (from search results)
            if (searchResults && searchResults.length > 0) {
                const fileList = [...new Set(searchResults.map(r => r.filename))];
                const references = fileList.map(f => f.replace('.txt', '')).join(', ');
                res.write(`data: ${JSON.stringify({
                    type: 'references',
                    files: references
                })}\n\n`);
            }

            // Send end signal
            res.write('data: [DONE]\n\n');
            res.end();

        } catch (geminiError) {
            console.error('Gemini error:', geminiError);

            // Fallback response if Gemini fails
            const fallbackText = `สวัสดีครับ! 🐕 ขออภัยครับ ตอนนี้เบาเบามีปัญหาในการเชื่อมต่อกับระบบ AI นิดหน่อย 😅 (Error: ${geminiError.message})\n\nแต่เบาเบาเจอข้อมูลที่เกี่ยวข้องในคลังเอกสารแล้วนะครับ!\n\n${searchResults.length > 0 ? `พบข้อมูล ${searchResults.length} รายการในหมวดหมู่: ${searchResults.slice(0, 3).map(r => r.category).join(', ')}` : 'ไม่พบข้อมูลที่เกี่ยวข้อง'}\n\nลองถามใหม่อีกครั้งนะครับ! ✨`;

            res.write(`data: ${JSON.stringify({ text: fallbackText })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    } catch (error) {
        console.error('Chat error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'Generative AI API' });
});

// Ensure database schema exists
async function ensureSchema() {
    try {
        // Check if uploaded_files exists
        const { error } = await supabase.from('uploaded_files').select('id').limit(1);

        if (error && error.code === '42P01') { // Undefined table
            console.log('Creating uploaded_files table...');
            // We can't run raw SQL via supabase-js client easily without RPC or specific setup.
            // But we can log a warning or try to use a workaround if possible.
            // For now, let's just log that migrations might be needed.
            console.warn('⚠️ Table uploaded_files might be missing. Please run the migrations.');
        }
    } catch (e) {
        console.error('Schema check error:', e);
    }
}

// API: Get random tip of the day from knowledge base
app.get('/api/tip-of-the-day', async (req, res) => {
    try {
        const documents = await loadAllDocuments();
        console.log(`📚 Loaded ${documents.length} documents for tip`);

        if (documents.length === 0) {
            return res.json({ tip: 'ยินดีต้อนรับสู่ BaoBao AI! พร้อมช่วยเหลือคุณเรื่อง UX writing แล้ว 🐕' });
        }

        // Get a random document
        const randomDoc = documents[Math.floor(Math.random() * documents.length)];
        console.log(`📄 Selected document: ${randomDoc.filename} (${randomDoc.category})`);

        // Get AI ID from query parameter
        const aiId = req.query.ai_id || 'baobao';
        console.log(`🤖 Generating tip for AI: ${aiId}`);

        // AI-specific tip prompts
        const tipPrompts = {
            baobao: `จากเนื้อหานี้: "${randomDoc.content.substring(0, 2000)}"

สร้าง UX Writing tip ที่กระชับ น่าสนใจ และเป็นประโยชน์ (2-4 ประโยค) เป็นภาษาไทย โดยอ้างอิงจากข้อมูลด้านบน`,

            deedee: `สร้าง tip เกี่ยวกับ Google Analytics และการติดตาม Custom Events (2-4 ประโยค) เป็นภาษาไทย
ให้เน้นเรื่อง:
- การออกแบบ event tracking ที่ดี
- หลักการ naming convention
- การเลือก parameters ที่เหมาะสม
- การ mapping กับ user journey`,

            pungpung: `สร้าง tip เกี่ยวกับการวิเคราะห์ Feedback และ CSAT (2-4 ประโยค) เป็นภาษาไทย
ให้เน้นเรื่อง:
- การเปลี่ยน Feedback เป็น Actionable Insight
- การวิเคราะห์ Root Cause ของปัญหา
- การจัดลำดับความสำคัญของปัญหา UX`,

            flowflow: `สร้าง tip เกี่ยวกับ Workflow Optimization และ Process Design (2-4 ประโยค) เป็นภาษาไทย
ให้เน้นเรื่อง:
- การออกแบบ workflow ที่มีประสิทธิภาพ
- การลดขั้นตอนที่ไม่จำเป็น
- การปรับปรุงกระบวนการทำงาน`
        };

        // Use Gemini to generate a meaningful tip
        const tipPrompt = tipPrompts[aiId] || tipPrompts.baobao;
        const tipContent = await generateTipOfTheDay(tipPrompt, randomDoc.category, aiId);
        console.log(`✨ Generated tip for ${aiId}: ${tipContent.substring(0, 100)}...`);

        res.json({
            tip: tipContent.trim(),
            category: randomDoc.category,
            source: randomDoc.filename,
            ai_id: aiId
        });
    } catch (error) {
        console.error('Error getting tip:', error);
        const aiId = req.query.ai_id || 'baobao';
        const fallbackTips = {
            baobao: 'ยินดีต้อนรับสู่ BaoBao AI! พร้อมช่วยเหลือคุณเรื่อง UX writing แล้ว 🐕',
            deedee: 'ยินดีต้อนรับค่ะ! DeeDee พร้อมช่วยวิเคราะห์ข้อมูลและออกแบบ Google Analytics แล้ว 🦌',
            pungpung: 'ยินดีต้อนรับค่ะ! PungPung พร้อมช่วยเขียน Creative Content แล้ว 🐝',
            flowflow: 'ยินดีต้อนรับครับ! FlowFlow พร้อมช่วยออกแบบ Workflow แล้ว 🌊'
        };
        res.json({ tip: fallbackTips[aiId] || fallbackTips.baobao });
    }

});

// --- MCP Server Management ---

const MCP_CONFIG_PATH = path.join(__dirname, 'mcp_config.json');

async function loadMcpConfig() {
    try {
        const data = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return []; // Default to empty array
    }
}

async function saveMcpConfig(servers) {
    await fs.writeFile(MCP_CONFIG_PATH, JSON.stringify(servers, null, 2));
}

// Initialize MCP servers
async function initMcpServers() {
    const servers = await loadMcpConfig();
    console.log(`🔌 Initializing ${servers.length} MCP servers...`);
    for (const server of servers) {
        try {
            await mcpManager.connect(server);
        } catch (error) {
            console.error(`Failed to connect to saved MCP server ${server.name}:`, error.message);
        }
    }
}

// Get connected servers
app.get('/api/mcp/servers', async (req, res) => {
    const config = await loadMcpConfig();
    // Merge with connection status
    const servers = config.map(s => ({
        ...s,
        status: mcpManager.clients.has(s.id) ? 'connected' : 'disconnected'
    }));
    res.json(servers);
});

// Connect to a new server
app.post('/api/mcp/connect', async (req, res) => {
    try {
        const config = req.body;
        if (!config.id) config.id = uuidv4(); // Ensure ID

        await mcpManager.connect(config);

        // Save to config
        const servers = await loadMcpConfig();
        // Update or add
        const index = servers.findIndex(s => s.id === config.id);
        if (index !== -1) {
            servers[index] = config;
        } else {
            servers.push(config);
        }
        await saveMcpConfig(servers);

        res.json({ success: true, server: config });
    } catch (error) {
        console.error('MCP Connect Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Disconnect/Remove server
app.post('/api/mcp/disconnect', async (req, res) => {
    try {
        const { id } = req.body;
        await mcpManager.disconnect(id);

        // Remove from config
        const servers = await loadMcpConfig();
        const newServers = servers.filter(s => s.id !== id);
        await saveMcpConfig(newServers);

        res.json({ success: true });
    } catch (error) {
        console.error('MCP Disconnect Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Only listen if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    app.listen(PORT, () => {
        console.log(`🤖 Generative AI API running on http://localhost:${PORT}`);
        console.log(`📚 Knowledge base: ${KNOWLEDGE_BASE_PATH}`);
        ensureSchema();
        initMcpServers();
    });
}

export default app;
