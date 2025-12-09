import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth'; // Added for DOCX support
import TurndownService from 'turndown'; // Added for HTML to Markdown conversion
import { v4 as uuidv4 } from 'uuid';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse'); // Added for PDF support
import { generateAIResponse, generateAIResponseStream, generateTipOfTheDay, getSystemPrompt } from './geminiService.js';
import { generateGroqResponseStream, generateGroqTipOfTheDay } from './groqService.js';
import { generateCustomAgentResponseStream } from './customAgentService.js';


import { conversationDB, messageDB, fileDB, folderDB, supabase } from './supabaseDB.js';
import { mcpManager } from './mcp/McpClientManager.js';
import { parseAxioIcons } from './utils/axioDocsParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Serve generated images
app.use('/generated-images', express.static(path.join(process.cwd(), 'public/generated-images')));

// Root route for health check
app.get('/', (req, res) => {
    res.send('🤖 Generative AI API is running! Access the frontend app at http://localhost:5173');
});

// Serve static files from the 'documents' directory (optional, for debugging)
// app.use('/documents', express.static(path.join(__dirname, '../documents')));/AXIO-FAST-CHAT/documents/baobao';

// Path to knowledge base - Dynamic based on AI
const getKnowledgeBasePath = (aiId = 'baobao') => {
    const aiPaths = {
        'baobao': path.join(process.cwd(), 'documents/baobao'),
        'flowflow': path.join(process.cwd(), 'documents/flowflow'),
        'deedee': path.join(process.cwd(), 'documents/deedee'),
        'pungpung': path.join(process.cwd(), 'documents/pungpung')
    };
    return aiPaths[aiId] || aiPaths['baobao'];
};

// Global cache for FlowFlow images
const flowflowImageCache = new Map();
let isImageCacheInitialized = false;

// Initialize image cache from FlowFlow documents
async function initializeFlowFlowImageCache() {
    if (isImageCacheInitialized) return;

    console.log('🖼️ Initializing FlowFlow image cache...');
    const documents = await loadAllDocuments('flowflow');
    const regex = /^\[(.*?)\]:\s*<?(data:image\/([^;]+);base64,([^>\n\r]+))>?/gm;

    for (const doc of documents) {
        let match;
        // Reset lastIndex for each document content
        while ((match = regex.exec(doc.content)) !== null) {
            const imageId = match[1];
            const fullDataUrl = match[2];
            const mimeType = match[3];
            const base64Data = match[4];

            flowflowImageCache.set(imageId, {
                mimeType,
                data: Buffer.from(base64Data, 'base64')
            });
        }
    }
    isImageCacheInitialized = true;
    console.log(`✅ FlowFlow image cache initialized with ${flowflowImageCache.size} images`);
}

// Serve FlowFlow images
app.get('/api/images/:imageId', (req, res) => {
    const { imageId } = req.params;
    const image = flowflowImageCache.get(imageId);

    if (image) {
        res.setHeader('Content-Type', `image/${image.mimeType}`);
        res.send(image.data);
    } else {
        res.status(404).send('Image not found');
    }
});

// Initialize cache on server start
initializeFlowFlowImageCache();

/**
 * Read all documents from the knowledge base for specific AI
 */
async function loadAllDocuments(aiId = 'baobao') {
    const KNOWLEDGE_BASE_PATH = getKnowledgeBasePath(aiId);

    // FlowFlow uses Supabase Vector Store, so skip local file loading
    if (aiId === 'flowflow') {
        console.log('🌊 FlowFlow: Skipping local file loading (Using Supabase Vector Store)');
        return [];
    }

    // Helper to get all files recursively
    async function getFilesRecursively(dir) {
        let results = [];
        try {
            const list = await fs.readdir(dir);
            for (const file of list) {
                if (file.startsWith('~$') || file === '.DS_Store') continue; // Ignore temp files
                const filePath = path.join(dir, file);
                const stat = await fs.stat(filePath);
                if (stat && stat.isDirectory()) {
                    results = results.concat(await getFilesRecursively(filePath));
                } else {
                    results.push(filePath);
                }
            }
        } catch (e) {
            console.error(`Error reading directory ${dir}:`, e);
        }
        return results;
    }

    try {
        const filePaths = await getFilesRecursively(KNOWLEDGE_BASE_PATH);
        const documents = [];

        for (const filePath of filePaths) {
            const fileName = path.basename(filePath);

            try {
                let content = '';
                let shouldLoad = false;

                if (fileName.endsWith('.docx')) {
                    const buffer = await fs.readFile(filePath);

                    if (aiId === 'flowflow') {
                        console.log(`[DEBUG] Loading DOCX for FlowFlow (with images): ${fileName}`);
                        // Custom image handler to save images to cache and return local URL
                        const options = {
                            convertImage: mammoth.images.imgElement(async (image) => {
                                const buffer = await image.read();
                                const contentType = image.contentType;
                                const imageId = `img_${uuidv4()}`; // Generate unique ID

                                // Store in global cache
                                flowflowImageCache.set(imageId, {
                                    mimeType: contentType.split('/')[1], // e.g. 'png' from 'image/png'
                                    data: buffer
                                });

                                console.log(`[DEBUG] Extracted image from DOCX: ${imageId} (${contentType})`);

                                // Return attributes for the <img> tag
                                return {
                                    src: `http://localhost:3001/api/images/${imageId}`,
                                    alt: `Image from ${fileName}`
                                };
                            })
                        };

                        const result = await mammoth.convertToHtml({ buffer }, options);
                        const html = result.value;

                        // Convert HTML to Markdown
                        const turndownService = new TurndownService();
                        content = turndownService.turndown(html);
                    } else {
                        // For other AIs, just extract raw text
                        console.log(`[DEBUG] Loading DOCX for ${aiId} (text only): ${fileName}`);
                        const result = await mammoth.extractRawText({ buffer });
                        content = result.value;
                    }
                    shouldLoad = true;

                } else if (fileName.endsWith('.pdf')) {
                    console.log(`[DEBUG] Loading PDF for ${aiId}: ${fileName}`);
                    const buffer = await fs.readFile(filePath);
                    const data = await pdf(buffer);
                    content = data.text;
                    shouldLoad = true;

                } else if (fileName.endsWith('.md') || fileName.endsWith('.txt')) {
                    content = await fs.readFile(filePath, 'utf-8');
                    shouldLoad = true;
                }

                if (shouldLoad && content) {
                    documents.push({
                        filename: fileName, // Keep just filename for display/reference
                        filepath: filePath, // Store full path if needed
                        content: content,
                        category: categorizeFile(fileName)
                    });
                }
            } catch (err) {
                console.error(`[ERROR] Failed to parse file ${fileName}:`, err);
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
    if (lower.includes('component')) return 'Components';

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
    // console.log(`[DEBUG] searchDocuments called with query: "${query}"`);
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
            console.log(`[DEBUG] Document "${doc.filename}" matched with score ${score}. Extracting excerpts...`);
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
 * Also injects image definitions if referenced in the excerpt
 */
function extractRelevantExcerpts(content, queryWords, queryTrigrams = [], maxExcerpts = 3) {
    // console.log(`[DEBUG] extractRelevantExcerpts called`); // Commented out to reduce noise
    const lines = content.split('\n');
    const excerpts = [];

    // Helper to find image definition
    const findImageDefinition = (imageId) => {
        // Look for [imageId]: data:image... at the end of content usually, but we search all lines
        // Format: [image1]: <data:image/png;base64,...> or [image1]: data:image...
        // Escape imageId for regex
        const escapedImageId = imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^\\[${escapedImageId}\\]:\\s*<?(data:image/[^>\\n\\r]+)>?`, 'm');
        const match = content.match(regex);
        if (match) {
            // console.log(`[DEBUG] Found definition for ${imageId}`);
            return match[0];
        } else {
            // console.log(`[DEBUG] Definition NOT found for ${imageId}`);
            return null;
        }
    };

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
            // Get context: 3 lines before and 5 lines after (expanded context)
            const start = Math.max(0, i - 3);
            const end = Math.min(lines.length, i + 6);
            let excerptText = lines.slice(start, end).join('\n');

            // Check for image references in this excerpt: ![][image1] or ![alt][image1]
            const imageRefRegex = /!\[.*?\]\[(.*?)\]/g;
            let imageMatch;
            const imageDefinitions = [];

            while ((imageMatch = imageRefRegex.exec(excerptText)) !== null) {
                const imageId = imageMatch[1];
                console.log(`[DEBUG] Found image ref: ${imageId} in excerpt`);
                const definition = findImageDefinition(imageId);
                if (definition) {
                    imageDefinitions.push(definition);
                }
            }

            // Append definitions if found
            if (imageDefinitions.length > 0) {
                excerptText += '\n\n' + imageDefinitions.join('\n');
                console.log(`[DEBUG] Appended ${imageDefinitions.length} image definitions to excerpt`);
            }

            excerpts.push(excerptText.trim());

            // Skip ahead to avoid overlapping excerpts
            i += 6;
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
        const { query, ai_id } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const documents = await loadAllDocuments(ai_id);
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
        const { ai_id } = req.query;
        const documents = await loadAllDocuments(ai_id);
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
        const { title, folder_id } = req.body;
        await conversationDB.update(id, { title, folder_id });
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

// Delete a conversation or all conversations for an AI
app.delete('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ai_id } = req.query;

        if (id === 'all') {
            if (!ai_id) {
                return res.status(400).json({ error: 'ai_id is required to clear history' });
            }
            await conversationDB.deleteAll(ai_id);
            return res.json({ success: true });
        }
        await conversationDB.delete(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting conversation:', error);
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});

// ============ FOLDER MANAGEMENT ============

// Get all folders
app.get('/api/folders', async (req, res) => {
    try {
        const folders = await folderDB.getAll();
        res.json(folders);
    } catch (error) {
        console.error('Error getting folders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create folder
app.post('/api/folders', async (req, res) => {
    // TODO: Add proper auth middleware to get user_id
    // For now, we'll proceed without it, but in production this needs auth
    try {
        const folder = req.body;
        // folder.user_id = req.user.id; // Uncomment when auth middleware is added
        await folderDB.create(folder);
        res.json({ success: true });
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update folder
app.put('/api/folders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        await folderDB.update(id, updates);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating folder:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete folder
app.delete('/api/folders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await folderDB.delete(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting folder:', error);
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});

// --- Asset Library Endpoints ---

// Upload a file
app.post('/api/upload', async (req, res) => {
    try {
        const { file, conversation_id, source = 'user_upload', prompt, ai_id } = req.body;

        if (!file || !file.name || !file.data) {
            return res.status(400).json({ error: 'Invalid file data' });
        }

        // Extract file metadata
        const category = file.mimeType ? file.mimeType.split('/')[0] : 'unknown';

        const asset = {
            id: uuidv4(), // Use uuidv4 for consistency
            filename: file.name,
            mime_type: file.mimeType || 'application/octet-stream',
            storage_url: file.data, // Storing base64
            conversation_id: conversation_id || null,
            source: source,
            file_type: category,
            prompt: prompt || null,
            file_size: file.size || (file.data ? file.data.length : 0),
            created_at: Date.now()
        };

        await fileDB.create(asset);
        console.log(`💾 Asset saved: ${asset.filename} (source: ${source}, type: ${category})`);

        // Check if this is an AXIO documentation HTML file to index
        if (file.name.endsWith('.html') || file.mimeType === 'text/html') {
            console.log('📄 Detected HTML file upload. Attempting to parse for AXIO icons...');
            try {
                const htmlContent = Buffer.from(file.data, 'base64').toString('utf-8');
                const icons = parseAxioIcons(htmlContent);

                if (icons.length > 0) {
                    const iconPath = path.join(process.cwd(), 'documents/flowflow/axio_icons.json');
                    // Ensure directory exists
                    await fs.mkdir(path.dirname(iconPath), { recursive: true });

                    // Merge with existing if any? For now, overwrite or append?
                    // Let's overwrite to keep it clean based on latest upload
                    await fs.writeFile(iconPath, JSON.stringify(icons, null, 2));
                    console.log(`📚 Indexed ${icons.length} icons from uploaded documentation to ${iconPath}`);
                } else {
                    console.log('⚠️ No icons found in uploaded HTML.');
                }
            } catch (parseError) {
                console.error('❌ Failed to parse uploaded docs:', parseError);
            }
        }

        res.json(asset);
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
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

// Update/Rename an asset
app.put('/api/assets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { filename } = req.body;

        console.log('📝 Rename request received:', { id, filename });

        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }

        const result = await fileDB.update(id, { filename });
        console.log('✅ Rename successful:', result);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Error updating asset:', error);
        res.status(500).json({ error: 'Failed to update asset', details: error.message });
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
        const documents = await loadAllDocuments(ai_id);
        console.error(`[DEBUG] /api/chat: Loaded ${documents.length} documents`);

        // For FlowFlow: load ALL documents for comprehensive design analysis
        // But chunk content to keep more of each doc without blowing up tokens
        // For other AIs: use search results
        let searchResults;

        if (ai_id === 'flowflow') {
            // Ensure cache is initialized
            if (!isImageCacheInitialized) {
                await initializeFlowFlowImageCache();
            }

            // Prepare query for search
            const queryLower = message.toLowerCase();
            const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);
            const queryTrigrams = generateNGrams(queryLower, 3);

            // Process full document content with image URL injection
            const processFullDocument = (text) => {
                let processedText = text;
                const imageRefRegex = /!\[.*?\]\[(.*?)\]/g;
                let imageMatch;
                const usedDefinitions = new Set();
                const definitionsToAppend = [];

                while ((imageMatch = imageRefRegex.exec(text)) !== null) {
                    const imageId = imageMatch[1];
                    if (!usedDefinitions.has(imageId) && flowflowImageCache.has(imageId)) {
                        const urlDefinition = `[${imageId}]: http://localhost:${PORT}/api/images/${imageId}`;
                        definitionsToAppend.push(urlDefinition);
                        usedDefinitions.add(imageId);
                    }
                }

                if (definitionsToAppend.length > 0) {
                    processedText += '\n\n' + definitionsToAppend.join('\n');
                }
                return processedText;
            };

            // Load ALL documents fully for FlowFlow to enable "real-time scan" by the AI
            // We rely on Gemini's large context window to handle the full content of all DOCX files.

            // 1. Score documents based on query relevance
            // Bypass scoring and filtering. Use ALL documents.
            const docsToProcess = documents;

            searchResults = docsToProcess.map(doc => {
                let fullContent = processFullDocument(doc.content);

                // Safety truncation: Limit to 300,000 characters (~60k tokens) per doc to allow multiple docs
                if (fullContent.length > 300000) {
                    console.warn(`[WARNING] Document ${doc.filename} is too large (${fullContent.length} chars). Truncating to 300k chars.`);
                    fullContent = fullContent.slice(0, 300000) + '\n...[Content Truncated]...';
                }

                console.log(`[DEBUG] FlowFlow Context: Using ${doc.filename} (${fullContent.length} chars)`);

                return {
                    filename: doc.filename,
                    category: doc.category,
                    excerpts: [fullContent] // Pass full content as a single "excerpt"
                };
            });
            console.log(`💬 [${ai_id}] Query: "${message || '[File Upload]'}" - Loaded ALL ${searchResults.length} documents with hybrid retrieval`);
        } else if (ai_id === 'baobao') {
            // For BaoBao, ALWAYS load ALL documents fully (no search/filtering)
            searchResults = documents.map(doc => {
                return {
                    filename: doc.filename,
                    category: doc.category,
                    excerpts: [doc.content] // Pass full content
                };
            });
            console.log(`💬 [${ai_id}] Query: "${message || '[File Upload]'}" - Loaded ALL ${searchResults.length} documents for Deep Reasoning`);
        } else {
            searchResults = message ? searchDocuments(documents, message) : [];
            console.log(`💬 [${ai_id || 'baobao'}] Query: "${message || '[File Upload]'}" - Found ${searchResults.length} results`);
        }

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

            // Generate response using Gemini or Groq with Streaming
            let stream;

            // Check if there is an image file attached
            const isImage = fileData && fileData.mimeType && fileData.mimeType.startsWith('image/');

            if (['baobao', 'flowflow', 'pungpung', 'deedee'].includes(ai_id) && !isImage) {

                // Special check for FlowFlow Image Generation Intent
                const imageKeywords = ['generate image', 'draw', 'create image', 'วาดรูป', 'สร้างรูป', 'gen รูป', 'เจนรูป', 'edit image', 'แก้รูป', 'เพิ่ม', 'ลบ', 'เปลี่ยน', 'logo', 'icon', 'image', 'picture', 'photo', 'background', 'bg', 'color', 'style', 'ภาพ', 'รูป', 'สี', 'พื้นหลัง', 'โลโก้', 'ไอคอน'];
                const isFlowFlowImageRequest = ai_id === 'flowflow' && imageKeywords.some(keyword => query.toLowerCase().includes(keyword));

                if (isFlowFlowImageRequest) {
                    console.log(`🎨 FlowFlow Image Request detected via routing. Switching to Gemini...`);
                    stream = generateAIResponseStream(query, results, fileData, location, ai_id, history);
                } else {
                    console.log(`🚀 Using Groq for ${ai_id}`);

                    // Get MCP Tools
                    const mcpTools = await mcpManager.getTools();
                    const groqTools = mcpTools.map(t => ({
                        type: "function",
                        function: {
                            name: mcpManager._sanitizeToolName(t.name),
                            description: t.description,
                            parameters: t.inputSchema
                        }
                    }));

                    const toolExecutor = async (name, args) => {
                        return await mcpManager.callTool(name, args);
                    };

                    stream = generateGroqResponseStream(query, results, fileData, location, ai_id, history, groqTools, toolExecutor);
                }
            } else if (ai_id === 'flowflowgpt5' || ai_id === 'baobaogpt5') {
                console.log(`🚀 Using Custom Agent for ${ai_id}`);
                const systemPrompt = getSystemPrompt(ai_id);
                stream = generateCustomAgentResponseStream(query, results, fileData, location, ai_id, history, systemPrompt);
            } else {
                stream = generateAIResponseStream(query, results, fileData, location, ai_id || 'baobao', history);
            }

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
            // Fallback response if Gemini fails
            const aiGreetings = {
                baobao: { name: 'เบาเบา', emoji: '🐕' },
                deedee: { name: 'ดีดี', emoji: '🦌' },
                pungpung: { name: 'ปังปัง', emoji: '🦉' },
                flowflow: { name: 'โฟลว์โฟลว์', emoji: '🐙' }
            };
            const currentAI = aiGreetings[ai_id] || aiGreetings.baobao;

            const fallbackText = `สวัสดีครับ! ${currentAI.emoji} ขออภัยครับ ตอนนี้${currentAI.name}มีปัญหาในการเชื่อมต่อกับระบบ AI นิดหน่อย 😅 (Error: ${geminiError.message})\n\nแต่${currentAI.name}เจอข้อมูลที่เกี่ยวข้องในคลังเอกสารแล้วนะครับ!\n\n${searchResults.length > 0 ? `พบข้อมูล ${searchResults.length} รายการในหมวดหมู่: ${searchResults.slice(0, 3).map(r => r.category).join(', ')}` : 'ไม่พบข้อมูลที่เกี่ยวข้อง'}\n\nลองถามใหม่อีกครั้งนะครับ! ✨`;

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
        const { ai_id } = req.query;
        let randomChunk = '';
        let filename = 'Unknown File';
        let category = 'General';

        // Special handling for FlowFlow (Supabase Vector Store)
        if (ai_id === 'flowflow') {
            console.log('🌊 FlowFlow: Fetching random tip from Supabase...');

            // 1. Get total count
            const { count, error: countError } = await supabase
                .from('documents')
                .select('*', { count: 'exact', head: true })
                .contains('metadata', { ai_id: 'flowflow' });

            if (countError || !count) {
                console.warn('⚠️ FlowFlow: No documents in Supabase for tip.');
                return res.json({ tip: 'ยินดีต้อนรับสู่ FlowFlow! พร้อมช่วยคุณค้นหาข้อมูล Design System แล้วครับ 🐙' });
            }

            // 2. Get random row
            const randomOffset = Math.floor(Math.random() * count);
            const { data, error } = await supabase
                .from('documents')
                .select('content, metadata')
                .contains('metadata', { ai_id: 'flowflow' })
                .range(randomOffset, randomOffset)
                .maybeSingle();

            if (error || !data) {
                console.error('❌ FlowFlow: Error fetching random tip:', error);
                return res.json({ tip: 'ยินดีต้อนรับสู่ FlowFlow! พร้อมช่วยคุณค้นหาข้อมูล Design System แล้วครับ 🐙' });
            }

            randomChunk = data.content;
            filename = data.metadata?.filename || 'Unknown';
            category = 'Design System'; // Default category
            console.log(`📄 Selected Supabase doc: ${filename}`);

        } else {
            // Legacy handling for other AIs (Local Files)
            console.log(`📚 Loaded ${await loadAllDocuments(ai_id).then(d => d.length)} documents for tip`);
            const documents = await loadAllDocuments(ai_id);

            if (documents.length === 0) {
                return res.json({ tip: 'ยินดีต้อนรับสู่ BaoBao AI! พร้อมช่วยเหลือคุณเรื่อง UX writing แล้ว 🐕' });
            }

            // Get a random document
            const randomDoc = documents[Math.floor(Math.random() * documents.length)];
            console.log(`📄 Selected document: ${randomDoc.filename} (${randomDoc.category})`);
            filename = randomDoc.filename;
            category = randomDoc.category;

            // Get a random chunk from the content (max 2000 chars)
            const content = randomDoc.content;
            console.log(`[DEBUG] Selected doc content length: ${content.length}`);

            const maxChunkSize = 2000;
            let attempts = 0;
            const maxAttempts = 5;

            // Try to find a chunk that isn't just base64 data
            while (attempts < maxAttempts) {
                if (content.length > maxChunkSize) {
                    const maxStart = content.length - maxChunkSize;
                    const randomStart = Math.floor(Math.random() * maxStart);
                    randomChunk = content.substring(randomStart, randomStart + maxChunkSize);
                } else {
                    randomChunk = content;
                    break; // Content is small enough, just use it
                }

                // Check if chunk looks like base64 (long continuous strings without spaces)
                const longestWord = randomChunk.split(/\s+/).reduce((a, b) => {
                    if (b.startsWith('http')) return a;
                    return a.length > b.length ? a : b;
                }, '');

                if (longestWord.length < 100) {
                    break; // Found a good chunk
                }

                console.log(`[DEBUG] Attempt ${attempts + 1}: Chunk rejected`);
                attempts++;
            }
        }

        console.log(`[DEBUG] Random chunk length: ${randomChunk.length}`);
        console.log(`[DEBUG] Random chunk preview: ${randomChunk.substring(0, 100)}...`);

        // Get AI ID from query parameter
        const aiId = req.query.ai_id || 'baobao';

        // AI-specific tip prompts
        const tipPrompts = {
            baobao: `จากเนื้อหานี้ (ตัดตอนมา): "...${randomChunk}..."

สร้าง UX Writing tip ที่กระชับ น่าสนใจ และเป็นประโยชน์ (2-4 ประโยค) เป็นภาษาไทย โดยอ้างอิงจากข้อมูลด้านบน ถ้าข้อมูลไม่พอให้สร้าง tip ทั่วไปเกี่ยวกับ UX Writing แทน`,

            deedee: `จากเนื้อหานี้ (ตัดตอนมา): "...${randomChunk}..."

สร้าง Data/Analytics tip ที่กระชับและเป็นประโยชน์ (2-4 ประโยค) เป็นภาษาไทย โดยอ้างอิงจากข้อมูลด้านบน ถ้าข้อมูลไม่พอให้สร้าง tip ทั่วไปเกี่ยวกับ Google Analytics แทน`,

            pungpung: `จากเนื้อหานี้ (ตัดตอนมา): "...${randomChunk}..."

สร้าง Creative/Feedback tip ที่กระชับและเป็นประโยชน์ (2-4 ประโยค) เป็นภาษาไทย โดยอ้างอิงจากข้อมูลด้านบน ถ้าข้อมูลไม่พอให้สร้าง tip ทั่วไปเกี่ยวกับการจัดการ Feedback แทน`,

            flowflow: `จากเนื้อหานี้ (ตัดตอนมา): "...${randomChunk}..."
            
คำสั่ง: สร้าง Design System/Workflow tip ที่กระชับและเป็นประโยชน์ (2-4 ประโยค) เป็นภาษาไทย โดยอ้างอิงจากข้อมูลด้านบน
- ถ้าเป็นเรื่อง Component ให้แนะนำวิธีใช้
- ถ้าเป็นเรื่อง Foundation ให้แนะนำหลักการ
- เน้นความ "เฉียบคม" และ "มืออาชีพ"

ข้อควรระวัง: ห้ามถามหาข้อมูลเพิ่ม ถ้าข้อมูลในเนื้อหาไม่เพียงพอ หรือเป็นเพียง Code/Base64 ให้สร้าง Tip ทั่วไปเกี่ยวกับ ${category || 'Design System'} แทนทันที`,

            flowflowgpt5: `จากเนื้อหานี้ (ตัดตอนมา): "...${randomChunk}..."
            
คำสั่ง: สร้าง Design System/Workflow tip ที่กระชับและเป็นประโยชน์ (2-4 ประโยค) เป็นภาษาไทย โดยอ้างอิงจากข้อมูลด้านบน
- ถ้าเป็นเรื่อง Component ให้แนะนำวิธีใช้
- ถ้าเป็นเรื่อง Foundation ให้แนะนำหลักการ
- เน้นความ "เฉียบคม" และ "มืออาชีพ"

ข้อควรระวัง: ห้ามถามหาข้อมูลเพิ่ม ถ้าข้อมูลในเนื้อหาไม่เพียงพอ หรือเป็นเพียง Code/Base64 ให้สร้าง Tip ทั่วไปเกี่ยวกับ ${category || 'Design System'} แทนทันที`,

            baobaogpt5: `จากเนื้อหานี้ (ตัดตอนมา): "...${randomChunk}..."

คำสั่ง: สร้าง UX Writing tip ที่กระชับและเป็นประโยชน์ (2-4 ประโยค) เป็นภาษาไทย โดยอ้างอิงจากข้อมูลด้านบน
- ถ้าเป็นเรื่อง Tone of Voice ให้แนะนำการใช้
- ถ้าเป็นเรื่อง Grammar ให้แนะนำสิ่งที่ถูกต้อง
- เน้นความ "เป็นกันเอง" และ "เข้าใจง่าย"

ข้อควรระวัง: ห้ามถามหาข้อมูลเพิ่ม ถ้าข้อมูลในเนื้อหาไม่เพียงพอ หรือเป็นเพียง Code/Base64 ให้สร้าง Tip ทั่วไปเกี่ยวกับ ${category || 'UX Writing'} แทนทันที`
        };

        // Use Groq to generate a meaningful tip
        const tipPrompt = tipPrompts[aiId] || tipPrompts.baobao;
        const tipContent = await generateGroqTipOfTheDay(tipPrompt, category, aiId);
        console.log(`✨ Generated tip for ${aiId}: ${tipContent.substring(0, 100)}...`);

        res.json({
            tip: tipContent.trim(),
            category: category,
            source: filename,
            ai_id: aiId
        });
    } catch (error) {
        console.error('Error getting tip:', error);
        const aiId = req.query.ai_id || 'baobao';
        const fallbackTips = {
            baobao: 'ยินดีต้อนรับสู่ BaoBao AI! พร้อมช่วยเหลือคุณเรื่อง UX writing แล้ว 🐕',
            deedee: 'ยินดีต้อนรับค่ะ! DeeDee พร้อมช่วยวิเคราะห์ข้อมูลและออกแบบ Google Analytics แล้ว 🦌',
            pungpung: 'ยินดีต้อนรับค่ะ! PungPung พร้อมช่วยเขียน Creative Content แล้ว 🐝',
            flowflow: 'ยินดีต้อนรับสู่ FlowFlow AI! พร้อมช่วยเหลือคุณเรื่อง Design System แล้ว 🐙',
            flowflowgpt5: 'ยินดีต้อนรับสู่ FlowFlow (AI-Team)! พร้อมช่วยเหลือคุณเรื่อง Design System แล้ว 🐙',
            baobaogpt5: 'ยินดีต้อนรับสู่ BaoBao (AI-Team)! พร้อมช่วยเหลือคุณเรื่อง UX writing แล้ว 🐕'
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

// Image Generation endpoint
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt, ai_id } = req.body;
        console.log('🎨 Image generation request:', { prompt, ai_id });

        // Load FlowFlow documents for context
        const documents = await loadAllDocuments('flowflow');

        // Summarize documents into concise design context
        const designContext = documents
            .map(doc => `${doc.category}: ${doc.content.substring(0, 500)}`)
            .join('\n\n')
            .substring(0, 8000); // Limit to 8K chars for reasonable context

        console.log(`📚 Loaded ${documents.length} FlowFlow documents for image context`);

        const { generateDesignImage } = await import('./imageGenerator.js');
        const result = await generateDesignImage(prompt, designContext);

        res.json({
            success: true,
            imageUrl: result.imageUrl,
            filename: result.filename
        });
    } catch (error) {
        console.error('Image generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Only listen if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    app.listen(PORT, () => {
        console.log(`🤖 Generative AI API running on http://localhost:${PORT}`);
        console.log(`📚 Knowledge bases:`);
        console.log(`   - BaoBao: ${getKnowledgeBasePath('baobao')}`);
        console.log(`   - FlowFlow: ${getKnowledgeBasePath('flowflow')}`);
        console.log(`   - DeeDee: ${getKnowledgeBasePath('deedee')}`);
        console.log(`   - PungPung: ${getKnowledgeBasePath('pungpung')}`);
        ensureSchema();
        initMcpServers();
    });
}

export default app;
