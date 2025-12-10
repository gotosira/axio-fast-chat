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

// FlowFlow document images directory
const FLOWFLOW_IMAGES_DIR = path.join(process.cwd(), 'public/flowflow-images');

/**
 * Load relevant images for FlowFlow based on query keywords
 * @param {string} query - User query
 * @param {number} maxImages - Maximum images to return
 * @returns {Array} Array of {id, base64, mimeType}
 */
function loadFlowFlowImages(query, maxImages = 3) {
    try {
        const indexPath = path.join(FLOWFLOW_IMAGES_DIR, 'index.json');
        if (!fs.existsSync(indexPath)) return [];

        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const queryLower = query.toLowerCase();

        // Keywords to image mapping
        const keywordMappings = [
            { keywords: ['logo', 'โลโก้', 'axons', 'brand', 'branding'], source: '_AXIO_Design_System___Foundation', range: [10, 15] },
            { keywords: ['color', 'สี', 'palette', 'primary', 'secondary'], source: '_AXIO_Design_System___Foundation', range: [20, 35] },
            { keywords: ['typography', 'font', 'ฟอนต์', 'ตัวอักษร'], source: '_AXIO_Design_System___Foundation', range: [11, 11] },
            { keywords: ['icon', 'ไอคอน'], source: '_List_of_System_Icon', range: [1, 50] },
            { keywords: ['button', 'ปุ่ม'], source: '_Component_List', range: [1, 30] },
            { keywords: ['input', 'text field', 'ช่องกรอก'], source: '_Component_List', range: [30, 60] },
            { keywords: ['card', 'การ์ด'], source: '_Component_List', range: [100, 130] },
            { keywords: ['modal', 'dialog', 'popup'], source: '_Component_List', range: [150, 180] },
        ];

        let targetImages = [];

        // Find matching keywords
        for (const mapping of keywordMappings) {
            if (mapping.keywords.some(kw => queryLower.includes(kw))) {
                const [start, end] = mapping.range;
                for (let i = start; i <= end && targetImages.length < maxImages; i++) {
                    const imgId = `${mapping.source}_img_${i}`;
                    if (index[imgId]) {
                        targetImages.push(imgId);
                    }
                }
                break; // Use first matching keyword group
            }
        }

        // If no specific match, return first few foundation images
        if (targetImages.length === 0) {
            targetImages = Object.keys(index).slice(0, maxImages);
        }

        // Load actual images
        const images = [];
        for (const imgId of targetImages.slice(0, maxImages)) {
            const info = index[imgId];
            if (!info) continue;

            const ext = info.contentType?.split('/')[1] || 'png';
            const imgPath = path.join(FLOWFLOW_IMAGES_DIR, `${imgId}.${ext}`);

            if (fs.existsSync(imgPath)) {
                const base64 = fs.readFileSync(imgPath).toString('base64');
                images.push({
                    id: imgId,
                    base64,
                    mimeType: info.contentType || 'image/png'
                });
            }
        }

        console.log(`🖼️ FlowFlow: Loaded ${images.length} relevant images for query`);
        return images;
    } catch (error) {
        console.error('Error loading FlowFlow images:', error);
        return [];
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
        // Build context from Supabase Vector Search for all AIs
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

        if (isCasualMessage) {
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

                    // 2. Search Supabase with timeout (short timeout for speed)
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Vector search timeout')), 5000)
                    );

                    // Race between query and timeout - filter by ai_id using RPC with filter
                    const { data: documents, error } = await Promise.race([
                        supabase.rpc('match_documents', {
                            query_embedding: queryEmbedding,
                            match_threshold: 0.4,
                            match_count: 8
                        }),
                        timeoutPromise
                    ]);

                    if (error) throw error;

                    // Filter results by ai_id in metadata
                    const filteredDocs = documents?.filter(doc =>
                        doc.metadata?.ai_id === aiId
                    ) || [];

                    console.log(`📚 ${aiId}: Found ${filteredDocs.length} relevant chunks.`);

                    if (filteredDocs.length > 0) {
                        context = '\n\n**📚 ข้อมูลจากคลังความรู้:**\n\n';
                        context += filteredDocs.map(doc => `${doc.content}`).join('\n\n');
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

        // Prepare messages array
        let currentMessages = [
            { role: 'system', content: fullSystemInstruction },
            ...history.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content: msg.parts[0].text // Adapt from Gemini history format
            }))
        ];

        // For FlowFlow with vision, load relevant images and add to user message
        if (aiId === 'flowflow') {
            const relevantImages = loadFlowFlowImages(userQuery, 3);

            if (relevantImages.length > 0) {
                // Build multimodal content for Llama 4 vision
                const userContent = [
                    { type: 'text', text: currentMessageText }
                ];

                // Add images
                for (const img of relevantImages) {
                    userContent.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${img.mimeType};base64,${img.base64}`
                        }
                    });
                }

                currentMessages.push({ role: 'user', content: userContent });
                console.log(`🖼️ FlowFlow: Added ${relevantImages.length} images to vision request`);
            } else {
                currentMessages.push({ role: 'user', content: currentMessageText });
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
