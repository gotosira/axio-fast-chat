import { Groq } from 'groq-sdk';
import { config } from './config.js';
import { getSystemPrompt } from './geminiService.js';
import { supabase } from './supabaseDB.js';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// Initialize Groq client
const groq = new Groq({
    apiKey: config.groqApiKey
});

// FlowFlow documents directory
const FLOWFLOW_DOCS_DIR = path.join(process.cwd(), 'documents/flowflow');

/**
 * Load images directly from DOCX files based on query keywords
 * Uses JSZip to extract images in real-time
 * @param {string} query - User query
 * @param {number} maxImages - Maximum images to return
 * @returns {Promise<Array>} Array of {id, base64, mimeType, source}
 */
async function loadDocxImagesForQuery(query, maxImages = 3) {
    try {
        const JSZip = (await import('jszip')).default;
        const mammoth = (await import('mammoth')).default;
        const queryLower = query.toLowerCase();

        // Map keywords to relevant document files and image ranges
        const docMappings = [
            {
                keywords: ['logo', 'โลโก้', 'axons', 'brand', 'branding'],
                file: '_AXIO Design System - Foundation.docx',
                imageRange: [10, 15] // Logo section
            },
            {
                keywords: ['color', 'สี', 'palette', 'primary'],
                file: '_AXIO Design System - Foundation.docx',
                imageRange: [20, 30] // Color section
            },
            {
                keywords: ['grid', 'layout', 'spacing', 'ระยะห่าง', 'column', 'คอลัมน์'],
                file: '_AXIO Design System - Foundation.docx',
                imageRange: [30, 45] // Grid/Layout section
            },
            {
                keywords: ['typography', 'font', 'ฟอนต์', 'ตัวอักษร', 'heading'],
                file: '_AXIO Design System - Foundation.docx',
                imageRange: [15, 25] // Typography section
            },
            {
                keywords: ['component', 'button', 'ปุ่ม', 'input', 'card', 'modal', 'dialog', 'table', 'form'],
                file: '_Component List.docx',
                imageRange: [1, 20]
            },
            {
                keywords: ['icon', 'ไอคอน', 'symbol'],
                file: '_List of System Icon.docx',
                imageRange: [1, 40]
            },
            {
                keywords: ['template', 'pattern', 'หน้า', 'page'],
                file: '_List of Design Template or Pattern.docx',
                imageRange: [1, 15]
            }
        ];

        // Find matching document
        let targetDoc = null;
        for (const mapping of docMappings) {
            if (mapping.keywords.some(kw => queryLower.includes(kw))) {
                targetDoc = mapping;
                break;
            }
        }

        // Default to Foundation document
        if (!targetDoc) {
            targetDoc = docMappings[0];
        }

        const docPath = path.join(FLOWFLOW_DOCS_DIR, targetDoc.file);
        if (!fs.existsSync(docPath)) {
            console.log(`📄 FlowFlow: Document not found: ${targetDoc.file}`);
            return { images: [], text: '' };
        }

        console.log(`📄 FlowFlow: Reading ${targetDoc.file} for query "${query}"...`);

        // Read DOCX
        const buffer = fs.readFileSync(docPath);
        const zip = await JSZip.loadAsync(buffer);

        // Extract text content using mammoth
        let textContent = '';
        try {
            const textResult = await mammoth.extractRawText({ buffer });
            // Take relevant portion of text (first 2000 chars)
            textContent = textResult.value.substring(0, 2000);
        } catch (e) {
            console.warn('Failed to extract text:', e.message);
        }

        // Get media files from DOCX
        const mediaFiles = Object.keys(zip.files)
            .filter(f => f.startsWith('word/media/'))
            .sort();

        const [startRange, endRange] = targetDoc.imageRange;
        const images = [];
        const imageUrls = [];

        // Create temp images directory if not exists
        const tempImagesDir = path.join(process.cwd(), 'public/temp-images');
        if (!fs.existsSync(tempImagesDir)) {
            fs.mkdirSync(tempImagesDir, { recursive: true });
        }

        for (let i = startRange - 1; i < Math.min(endRange, mediaFiles.length) && images.length < maxImages; i++) {
            const file = mediaFiles[i];
            if (!file) continue;

            const content = await zip.files[file].async('base64');
            const ext = file.split('.').pop();
            const mimeType = ext === 'png' ? 'image/png' :
                ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                    'image/' + ext;

            // Save image to temp folder for serving
            const safeDocName = targetDoc.file.replace(/[^a-zA-Z0-9]/g, '_');
            const imageName = `${safeDocName}_${i + 1}.${ext}`;
            const imagePath = path.join(tempImagesDir, imageName);
            fs.writeFileSync(imagePath, Buffer.from(content, 'base64'));

            const imageUrl = `http://localhost:3001/temp-images/${imageName}`;
            imageUrls.push(imageUrl);

            images.push({
                id: `${targetDoc.file}_img_${i + 1}`,
                base64: content,
                mimeType,
                source: targetDoc.file,
                url: imageUrl
            });
        }

        console.log(`🖼️ FlowFlow: Extracted ${images.length} images + ${textContent.length} chars text`);
        return { images, text: textContent, imageUrls };
    } catch (error) {
        console.error('Error loading DOCX:', error);
        return { images: [], text: '' };
    }
}

/**
 * Generate response using Groq with Streaming
 * @param {string} userQuery - User's question
 * @param {Array} searchResults - Results from knowledge base search
 * @param {Object} fileData - Optional file data (Note: Groq might not support image/file inputs directly like Gemini, handling text only for now)
 * @param {Object} location - Optional location data
 * @param {string} aiId - AI assistant ID
 * @param {Array} history - Conversation history
 * @returns {AsyncGenerator<string>} Stream of text chunks
 */
export async function* generateGroqResponseStream(userQuery, searchResults, fileData = null, location = null, aiId = 'baobao', history = [], tools = [], toolExecutor = null) {
    try {
        // Build context from Supabase Vector Search for all AIs (except FlowFlow which uses direct DOCX reading)
        let context = '';

        // Skip vector search for casual greetings and simple messages
        const casualPatterns = [
            /^(สวัสดี|หวัดดี|ดีจ้า|ดีครับ|ดีค่ะ|hello|hi|hey)/i,
            /^(ขอบคุณ|thank|thanks)/i,
            /^(ช่วยได้ไหม|ช่วยอะไรได้)/i,
            /^(เป็นใคร|คุณคือใคร|แนะนำตัว)/i,
            /^.{0,15}$/  // Very short messages (under 15 chars)
        ];

        const isCasualMessage = casualPatterns.some(pattern => pattern.test(userQuery.trim()));

        // FlowFlow: Skip vector search entirely - use direct DOCX reading with vision
        if (aiId === 'flowflow') {
            console.log(`📄 FlowFlow: Using direct DOCX reading (no vector database)`);
            context = ''; // Will be handled by vision with images
        } else if (isCasualMessage) {
            console.log(`💬 ${aiId}: Casual message detected, skipping vector search`);
            context = '';
        } else {
            console.log(`🔍 ${aiId}: Searching Supabase vector store...`);
            const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

            try {
                // Check if Supabase is available
                if (!supabase) {
                    console.warn('⚠️ Supabase not initialized, skipping vector search');
                    context = '';
                } else {
                    // 1. Generate Embedding
                    const embeddingResult = await ai.models.embedContent({
                        model: "text-embedding-004",
                        contents: [{ parts: [{ text: userQuery }] }]
                    });
                    const queryEmbedding = embeddingResult.embeddings[0].values;

                    // 2. Search Supabase with timeout (15s for larger datasets)
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Vector search timeout')), 15000)
                    );

                    // Race between query and timeout
                    const { data: documents, error } = await Promise.race([
                        supabase.rpc('match_documents', {
                            query_embedding: queryEmbedding,
                            match_threshold: 0.4,
                            match_count: 20  // Get more results to filter from
                        }),
                        timeoutPromise
                    ]);

                    if (error) throw error;

                    // Filter results by ai_id in metadata
                    const filteredDocs = documents?.filter(doc =>
                        doc.metadata?.ai_id === aiId
                    ).slice(0, 3) || [];  // Take top 3 after filtering (reduced for Llama 4)

                    console.log(`📚 ${aiId}: Found ${filteredDocs.length} relevant chunks (from ${documents?.length || 0} total).`);

                    if (filteredDocs.length > 0) {
                        context = '\n\n**📚 ข้อมูลจากคลังความรู้:**\n\n';
                        // Truncate each chunk for FlowFlow (Llama 4 has smaller context)
                        const maxChunkLen = aiId === 'flowflow' ? 500 : 1500;
                        context += filteredDocs.map(doc =>
                            doc.content.substring(0, maxChunkLen) + (doc.content.length > maxChunkLen ? '...' : '')
                        ).join('\n\n');

                        // For FlowFlow: Extract relevant image IDs from metadata
                        if (aiId === 'flowflow') {
                            const imageIds = [];
                            for (const doc of filteredDocs) {
                                if (doc.metadata?.images && Array.isArray(doc.metadata.images)) {
                                    imageIds.push(...doc.metadata.images);
                                }
                            }
                            if (imageIds.length > 0) {
                                // Limit to 3 images
                                const uniqueImages = [...new Set(imageIds)].slice(0, 3);
                                context += '\n\n**🖼️ รูปภาพประกอบที่เกี่ยวข้อง:**\n';
                                uniqueImages.forEach(imgId => {
                                    const ext = 'png';
                                    context += `- http://localhost:3001/flowflow-images/${imgId}.${ext}\n`;
                                });
                            }
                        }
                    } else {
                        context = '';
                    }
                }
            } catch (err) {
                console.error(`❌ ${aiId} Vector Search Error:`, err.message || err);
                context = '';
            }
        }

        // Add location context if available
        let locationContext = '';
        if (location) {
            locationContext = `\n\n**📍 ตำแหน่งปัจจุบันของผู้ใช้:** ละติจูด ${location.lat}, ลองจิจูด ${location.lng}\n(ใช้ข้อมูลนี้เพื่อตอบคำถามเกี่ยวกับสถานที่ สภาพอากาศ หรือบริการใกล้เคียง)`;
        }

        // Get the appropriate system prompt
        const systemPrompt = getSystemPrompt(aiId);

        // Streaming instructions - think first, then answer
        const streamingInstructions = `
**คำสั่งสำคัญ - คิดก่อนตอบ:**

1. **กระบวนการคิด (ต้องมีเสมอ):**
   > **วิเคราะห์:** [วิเคราะห์ว่า user ต้องการอะไร - Template/หน้า หรือ Icon? Component หรือ Foundation?]
   
   แล้วค่อยตอบ

2. **ตัวอย่างการวิเคราะห์:**
   - "หน้า Login" → ต้องการ **Template** (ไม่ใช่ Icon!)
   - "Login Icon" → ต้องการ **Icon**
   - "สี Primary" → ต้องการ **Foundation**
   - "Button" → ต้องการ **Component**

3. **Minimal Design:** ใช้ \`inline code\` สำหรับชื่อตัวแปร/Token/Hex Code
`;

        const fullSystemInstruction = `${systemPrompt}\n${streamingInstructions}`;

        // Add file content if available
        let fileContext = '';
        if (fileData && fileData.data) {
            try {
                // Check if it's a text-based file
                const mimeType = fileData.mimeType || '';
                if (mimeType.startsWith('text/') || mimeType.includes('csv') || mimeType.includes('json') || mimeType.includes('xml')) {
                    const content = Buffer.from(fileData.data, 'base64').toString('utf-8');
                    fileContext = `\n\n**📎 ไฟล์ที่แนบมา (${fileData.name}):**\n\`\`\`\n${content}\n\`\`\`\n`;
                    console.log(`📎 Added file content for ${fileData.name} (${content.length} chars)`);
                } else {
                    console.warn(`⚠️ Skipping file content for non-text file: ${fileData.name} (${mimeType})`);
                    fileContext = `\n\n**📎 ไฟล์ที่แนบมา (${fileData.name}):**\n(ไฟล์ประเภท ${mimeType} - ไม่สามารถอ่านเนื้อหาได้โดยตรง)\n`;
                }
            } catch (e) {
                console.error('Error decoding file data:', e);
            }
        }

        // Construct the current user message with context
        const currentMessageText = `${context}
${locationContext}
${fileContext}

**คำถามจากผู้ใช้:** ${userQuery}`;

        // Select model based on AI ID
        let modelName = "llama-3.3-70b-versatile"; // Default

        // FlowFlow uses Llama 4 Maverick with vision capabilities
        if (aiId === 'flowflow') {
            modelName = "meta-llama/llama-4-maverick-17b-128e-instruct";
            console.log(`🦙 FlowFlow: Using Llama 4 Maverick with vision`);
        } else if (['pungpung', 'deedee'].includes(aiId)) {
            modelName = "llama-3.3-70b-versatile";
        }

        // Prepare messages array with history
        // Limit history for FlowFlow (Llama 4 has smaller context)
        const maxHistory = aiId === 'flowflow' ? 4 : history.length;
        const trimmedHistory = history.slice(-maxHistory);
        console.log(`📜 ${aiId}: Using ${trimmedHistory.length} messages from history (max: ${maxHistory})`);

        let currentMessages = [
            { role: 'system', content: fullSystemInstruction },
            ...trimmedHistory.map(msg => {
                // Truncate long messages for FlowFlow
                let text = msg.parts[0].text;
                if (aiId === 'flowflow' && text.length > 1000) {
                    text = text.substring(0, 1000) + '...';
                }
                return {
                    role: msg.role === 'model' ? 'assistant' : 'user',
                    content: text
                };
            })
        ];

        // For FlowFlow: Always load content from DOCX files with vision/OCR
        if (aiId === 'flowflow') {
            // Load images + text directly from DOCX files
            const docContent = await loadDocxImagesForQuery(userQuery, 3);
            const { images, text, imageUrls } = docContent;

            // Build message with text context from document
            let messageWithContext = currentMessageText;
            if (text) {
                messageWithContext = `**📚 เนื้อหาจากเอกสาร:**\n${text}\n\n${currentMessageText}`;
            }

            // Add image URLs to context so AI can reference them
            if (imageUrls && imageUrls.length > 0) {
                messageWithContext += `\n\n**🖼️ รูปภาพที่แนบมา (ใช้ลิงก์เหล่านี้แสดงผล):**\n${imageUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}`;
            }

            if (images.length > 0) {
                // Build multimodal content for Llama 4 vision
                const userContent = [
                    { type: 'text', text: messageWithContext + '\n\nวิเคราะห์รูปภาพที่แนบมาและตอบคำถามจากข้อมูลในรูปและเอกสาร' }
                ];

                // Add images
                for (const img of images) {
                    userContent.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${img.mimeType};base64,${img.base64}`
                        }
                    });
                }

                currentMessages.push({ role: 'user', content: userContent });
                console.log(`🖼️ FlowFlow: Added ${images.length} images from ${images[0]?.source || 'DOCX'}`);
            } else if (text) {
                // No images but has text content
                currentMessages.push({ role: 'user', content: messageWithContext });
                console.log(`📝 FlowFlow: Using text content from DOCX`);
            } else {
                currentMessages.push({ role: 'user', content: currentMessageText });
                console.log(`💬 FlowFlow: No document content found`);
            }
        } else {
            currentMessages.push({ role: 'user', content: currentMessageText });
        }

        console.log(`🤖 Requesting Groq stream for ${aiId}...`);

        // Only use valid function-type tools if provided
        // Note: Llama 4 Maverick with vision doesn't work well with tools, so disable for FlowFlow
        const validTools = (aiId === 'flowflow') ? undefined : (tools && tools.length > 0 ? tools : undefined);

        // Main Loop for Tool Calling
        while (true) {
            const chatCompletion = await groq.chat.completions.create({
                messages: currentMessages,
                model: modelName,
                temperature: 1,
                max_completion_tokens: 8192,
                top_p: 1,
                stream: true,
                stop: null,
                ...(validTools && { tools: validTools })
            });

            let toolCalls = {};
            let finalContent = '';

            for await (const chunk of chatCompletion) {
                const delta = chunk.choices[0]?.delta;

                if (delta?.tool_calls) {
                    for (const toolCall of delta.tool_calls) {
                        const index = toolCall.index;
                        if (!toolCalls[index]) {
                            toolCalls[index] = {
                                id: toolCall.id,
                                type: toolCall.type,
                                function: { name: '', arguments: '' }
                            };
                        }
                        if (toolCall.id) toolCalls[index].id = toolCall.id;
                        if (toolCall.function?.name) toolCalls[index].function.name += toolCall.function.name;
                        if (toolCall.function?.arguments) toolCalls[index].function.arguments += toolCall.function.arguments;
                    }
                }

                if (delta?.content) {
                    finalContent += delta.content;
                    yield delta.content;
                }
            }

            // Check if we have tool calls
            const toolCallValues = Object.values(toolCalls);
            if (toolCallValues.length > 0) {
                console.log(`🛠️ Received ${toolCallValues.length} tool calls from Groq.`);

                // Add assistant message with tool calls to history
                currentMessages.push({
                    role: 'assistant',
                    content: finalContent || null,
                    tool_calls: toolCallValues
                });

                // Execute tools
                for (const toolCall of toolCallValues) {
                    const functionName = toolCall.function.name;
                    let functionArgs = {};
                    try {
                        functionArgs = JSON.parse(toolCall.function.arguments);
                    } catch (e) {
                        console.error(`Error parsing args for ${functionName}:`, e);
                    }

                    console.log(`🛠️ Executing tool ${functionName}...`);
                    let functionResponse = '';

                    if (toolExecutor) {
                        try {
                            functionResponse = await toolExecutor(functionName, functionArgs);
                        } catch (e) {
                            functionResponse = `Error: ${e.message}`;
                        }
                    } else {
                        functionResponse = "Tool execution not supported.";
                    }

                    // Add tool result to history
                    currentMessages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: functionName,
                        content: typeof functionResponse === 'string' ? functionResponse : JSON.stringify(functionResponse)
                    });
                }
                // Loop continues to send tool results back to model
            } else {
                // No tool calls, we are done
                break;
            }
        }

    } catch (error) {
        console.error('Groq Streaming Error:', error);
        throw error;
    }
}

/**
 * Generate Tip of the Day using Groq
 * @param {string} promptText - The full prompt to send to the model
 * @param {string} category - Document category (optional, for logging)
 * @param {string} aiId - AI ID for fallback messages
 * @returns {Promise<string>} Generated tip
 */
export async function generateGroqTipOfTheDay(promptText, category, aiId = 'baobao') {
    try {
        // AI-specific system prompts for tip generation
        const tipSystemPrompts = {
            baobao: 'คุณคือ BaoBao หมาชิซุตัวผู้ ขี้อ้อน น่ารัก ร่าเริง เชี่ยวชาญ UX Writing ตอบด้วยความเป็นมิตร ลงท้ายด้วย "ครับ" และใช้ emoji 🐕',
            deedee: 'คุณคือ DeeDee แพนด้าแดงตัวเมีย อบอุ่น เป็นมิตร ชอบวิเคราะห์ข้อมูล เชี่ยวชาญ Google Analytics และ Data ตอบด้วยความอบอุ่น ลงท้ายด้วย "ค่ะ" และใช้ emoji 🦊✨',
            pungpung: 'คุณคือ PungPung นกฮูกนักวิเคราะห์ตัวผู้ รอบคอบ ฉลาด สุขุม เชี่ยวชาญ UX Analysis และ Product Feedback ตอบด้วยเหตุผลชัดเจน ลงท้ายด้วย "ครับ" และใช้ emoji 🦉',
            flowflow: 'คุณคือ FlowFlow หมึกยักษ์ตัวผู้ เฉียบคม มืออาชีพ เชี่ยวชาญ Design System และ AXIO ตอบด้วยความมั่นใจ ลงท้ายด้วย "ครับ" และใช้ emoji 🐙',
            flowflowgpt5: 'คุณคือ FlowFlow (AI-Team) หมึกยักษ์ เฉียบคม มืออาชีพ เชี่ยวชาญ Design System ลงท้ายด้วย "ครับ" 🐙',
            baobaogpt5: 'คุณคือ BaoBao (AI-Team) หมาชิซุ น่ารัก เชี่ยวชาญ UX Writing ลงท้ายด้วย "ครับ" 🐕'
        };

        const systemPrompt = tipSystemPrompts[aiId] || tipSystemPrompts.baobao;

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: promptText
                }
            ],
            model: "openai/gpt-oss-120b",
            temperature: 0.7,
            max_completion_tokens: 2048,
            top_p: 1,
            stream: false,
            stop: null,
            service_tier: "auto"
        });

        return completion.choices[0]?.message?.content || "ไม่สามารถสร้าง Tip ได้ในขณะนี้";
    } catch (error) {
        console.error('Groq Tip Generation Error:', error);
        return `ขออภัย ไม่สามารถสร้าง Tip ได้ในขณะนี้ (${error.message})`;
    }
}
