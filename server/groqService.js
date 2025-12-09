import { Groq } from 'groq-sdk';
import { config } from './config.js';
import { getSystemPrompt } from './geminiService.js';
import { supabase } from './supabaseDB.js';
import { GoogleGenAI } from '@google/genai';

// Initialize Groq client
const groq = new Groq({
    apiKey: config.groqApiKey
});

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
        // Build context
        let context = '';

        // Special handling for FlowFlow (Supabase Vector Search)
        if (aiId === 'flowflow') {
            console.log('🌊 FlowFlow (Groq): Generating embedding for query...');
            const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

            try {
                // Check if Supabase is available
                if (!supabase) {
                    console.warn('⚠️ Supabase not initialized, skipping vector search');
                    context = '\n\n**ไม่สามารถเชื่อมต่อ Supabase ได้**\n\n';
                } else {
                    // 1. Generate Embedding
                    const embeddingResult = await ai.models.embedContent({
                        model: "text-embedding-004",
                        contents: [{ parts: [{ text: userQuery }] }]
                    });
                    const queryEmbedding = embeddingResult.embeddings[0].values;

                    // 2. Search Supabase
                    console.log('🔍 FlowFlow (Groq): Searching Supabase vector store...');
                    const { data: documents, error } = await supabase.rpc('match_documents', {
                        query_embedding: queryEmbedding,
                        match_threshold: 0.3,
                        match_count: 20
                    });

                    if (error) throw error;

                    console.log(`📚 FlowFlow (Groq): Found ${documents?.length || 0} relevant chunks.`);

                    if (documents && documents.length > 0) {
                        context = '\n\n**📚 ข้อมูลจากคลังเอกสาร (Supabase Vector Store):**\n\n';
                        context += documents.map(doc => `File: ${doc.metadata.filename}\n${doc.content}`).join('\n\n');
                        context += `\n**หมายเหตุ:** ให้ตอบจากข้อมูลข้างต้นก่อนเสมอ ถ้าข้อมูลไม่เพียงพอจริงๆ ถึงจะค้นหาเพิ่มจาก Google\n`;
                    } else {
                        context = '\n\n**ไม่พบข้อมูลในคลังเอกสาร**\n\n';
                    }
                }
            } catch (err) {
                console.error('❌ FlowFlow (Groq) Vector Search Error:', err);
                context = "Error retrieving context from knowledge base.";
            }
        }
        // Standard local file search for other AIs
        else if (searchResults && searchResults.length > 0) {
            context = '\n\n**📚 ข้อมูลจากคลังเอกสาร (ใช้ข้อมูลนี้ก่อนเสมอ):**\n\n';
            searchResults.slice(0, 3).forEach((result) => {
                context += `### ${result.category}\n`;
                if (result.excerpts && result.excerpts.length > 0) {
                    result.excerpts.slice(0, 2).forEach(excerpt => {
                        context += `${excerpt}\n\n`;
                    });
                }
            });
            context += `\n**หมายเหตุ:** ให้ตอบจากข้อมูลข้างต้นก่อนเสมอ ถ้าข้อมูลไม่เพียงพอจริงๆ ถึงจะค้นหาเพิ่มจาก Google\n`;
        } else {
            context = '\n\n**ไม่พบข้อมูลในคลังเอกสาร - สามารถค้นหาข้อมูลจาก Google ได้**\n\n';
        }

        // Add location context if available
        let locationContext = '';
        if (location) {
            locationContext = `\n\n**📍 ตำแหน่งปัจจุบันของผู้ใช้:** ละติจูด ${location.lat}, ลองจิจูด ${location.lng}\n(ใช้ข้อมูลนี้เพื่อตอบคำถามเกี่ยวกับสถานที่ สภาพอากาศ หรือบริการใกล้เคียง)`;
        }

        // Get the appropriate system prompt
        const systemPrompt = getSystemPrompt(aiId);

        // Streaming instructions
        const streamingInstructions = `
**คำสั่งสำคัญสำหรับการตอบสนองที่รวดเร็วที่สุด (Critical Priority):**
1. **เริ่มส่งข้อมูลทันที (Instant Stream):** ห้ามหยุดรอประมวลผล ห้ามคิดนาน
2. **กระบวนการคิด (Thinking Block) - ต้องอยู่ลำดับแรกสุด:**
   > **กระบวนการคิด:**
   > [วิเคราะห์สั้นๆ 1-2 ประโยค]
   
   **สำคัญมาก: กระบวนการคิดต้องอยู่ก่อนคำตอบเสมอ ห้ามใส่ไว้ท้าย**

3. **รูปแบบการตอบ (Response Format):**
   ต้องตอบตามโครงสร้างนี้เท่านั้น ตามลำดับ:

   1) กระบวนการคิด (Blockquote ก่อนเสมอ)
   2) จากนั้นคำตอบหลัก:

   ## [หัวข้อหลัก (Summarized Topic)]
   [เนื้อหาหลัก อธิบายบริบท]

   ### [หัวข้อย่อย]
   * [ประเด็นสำคัญ 1]
   * [ประเด็นสำคัญ 2]

   [คำตอบส่วนที่เหลือ]

   **การใช้เครื่องมือ:** ห้ามใช้ Google Search หรือ Tools อื่นๆ หากคำตอบมีอยู่ใน Context หรือเป็นความรู้ทั่วไป เพื่อความรวดเร็ว

   **Minimal Design Style (บังคับใช้):**
   - **Inline Code:** ใช้ Single Backticks (\` \`) สำหรับชื่อตัวแปร, Token, Hex Code, และค่าสั้นๆ เสมอ (ห้ามใช้ Code Block ใหญ่)
   - **Example:**
     - Background: \`main/surface/primary #F5FAFE\`
     - Text: \`main/base/dark #344054\`
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

        // Prepare messages array
        let currentMessages = [
            { role: 'system', content: fullSystemInstruction },
            ...history.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content: msg.parts[0].text // Adapt from Gemini history format
            })),
            { role: 'user', content: currentMessageText }
        ];

        console.log(`🤖 Requesting Groq stream for ${aiId}...`);

        // Select model based on AI ID
        let modelName = "llama-3.3-70b-versatile"; // Default
        if (['flowflow', 'pungpung', 'deedee'].includes(aiId)) {
            modelName = "openai/gpt-oss-120b"; // As requested
        }

        // Only use valid function-type tools if provided
        // Note: Groq only supports type: "function" or "mcp", NOT browser_search/code_interpreter
        const validTools = tools && tools.length > 0 ? tools : undefined;

        // Main Loop for Tool Calling
        while (true) {
            const chatCompletion = await groq.chat.completions.create({
                messages: currentMessages,
                model: modelName,
                temperature: 1,
                max_completion_tokens: 65536,
                top_p: 1,
                stream: true,
                reasoning_effort: "high",
                stop: null,
                ...(validTools && { tools: validTools }),
                service_tier: "auto"
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
