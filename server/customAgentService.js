import fetch from 'node-fetch';

/**
 * Generate response from a custom agent endpoint (Streaming)
 * @param {string} userQuery - User's question
 * @param {Array} searchResults - Context from documents
 * @param {Object} fileData - Uploaded file data
 * @param {string} location - User location
 * @param {string} aiId - AI ID
 * @param {Array} history - Conversation history
 * @returns {AsyncGenerator<string>} Stream of text chunks
 */
export async function* generateCustomAgentResponseStream(userQuery, searchResults, fileData, location, aiId, history, systemPrompt) {
    const AGENT_CONFIG = {
        flowflowgpt5: {
            endpoint: 'https://flowflow-custom-agent-gpt5-1098129219905.asia-southeast1.run.app/v1/chat/completions',
            type: 'openai'
        },
        baobaogpt5: {
            endpoint: 'https://baobao-gpt5-1098129219905.asia-southeast1.run.app/v1/chat/completions',
            type: 'openai'
        }
    };

    const config = AGENT_CONFIG[aiId];
    if (!config) {
        yield `Error: Configuration not found for agent ${aiId}`;
        return;
    }

    try {
        console.log(`🚀 Requesting Custom Agent stream from ${config.endpoint} (${config.type})...`);

        // Prepare context from search results
        let context = '';
        if (searchResults && searchResults.length > 0) {
            context = 'Context from documents:\n';
            searchResults.forEach(doc => {
                context += `Filename: ${doc.filename}\nContent: ${doc.excerpts.join('\n')}\n\n`;
            });
        }

        // Truncate context if it exceeds limit (FlowFlow has a 3000 char limit on query)
        const MAX_CONTEXT_LENGTH = 2500;
        if (context.length > MAX_CONTEXT_LENGTH) {
            console.log(`⚠️ Context too long (${context.length} chars), truncating to ${MAX_CONTEXT_LENGTH}...`);
            context = context.substring(0, MAX_CONTEXT_LENGTH) + '...[truncated]';
        }

        let body;
        let headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sk-ImmqKz14vj5se4RVjenUBA'
        };

        // Prepare file context
        let fileContext = '';
        if (fileData && fileData.data) {
            try {
                // Check if it's a text-based file
                const mimeType = fileData.mimeType || '';
                if (mimeType.startsWith('text/') || mimeType.includes('csv') || mimeType.includes('json') || mimeType.includes('xml')) {
                    const content = Buffer.from(fileData.data, 'base64').toString('utf-8');
                    fileContext = `\n\n**📎 Attached File (${fileData.name}):**\n\`\`\`\n${content}\n\`\`\`\n`;
                } else {
                    fileContext = `\n\n**📎 Attached File (${fileData.name}):**\n(File type ${mimeType} - Content not directly readable)\n`;
                }
            } catch (e) {
                console.error('Error decoding file data for custom agent:', e);
            }
        }

        if (config.type === 'openai') {
            // OpenAI Compatible Payload
            const messages = [
                { role: "system", content: systemPrompt || "You are a helpful assistant." },
                ...history.map(msg => ({
                    role: msg.role === 'model' ? 'assistant' : 'user',
                    content: msg.parts[0].text
                })),
                {
                    role: "user",
                    content: `${context}${fileContext}\n\n${userQuery}`
                }
            ];

            body = JSON.stringify({
                model: "gpt-4o", // Or whatever model the endpoint expects
                messages: messages,
                stream: true
            });
        } else {
            // Custom Payload (FlowFlow style) - Kept for fallback if needed
            body = JSON.stringify({
                message: userQuery,
                context: context,
                history: history,
                file: fileData,
                location: location
            });
        }

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: headers,
            body: body
        });

        console.log(`📡 Response Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error Body: ${errorText}`);
            throw new Error(`Custom Agent API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        console.log(`📡 Response Headers: ${JSON.stringify(Array.from(response.headers.entries()))}`);
        const contentType = response.headers.get('content-type');
        console.log(`📡 Content-Type: ${contentType}`);

        const responseBody = response.body;
        if (!responseBody) throw new Error('No response body');

        // Handle OpenAI Stream Format (data: {...}) vs Raw Text Stream vs Standard JSON
        if (config.type === 'openai') {
            if (contentType && contentType.includes('application/json')) {
                // Handle non-streaming JSON response
                const text = await response.text();
                try {
                    const parsed = JSON.parse(text);
                    const content = parsed.choices?.[0]?.message?.content;
                    if (content) {
                        yield content;
                    } else {
                        console.warn('⚠️ No content in JSON response:', text);
                    }
                } catch (e) {
                    console.error('❌ Error parsing JSON response:', e);
                    yield `Error parsing response: ${e.message}`;
                }
            } else {
                // Basic SSE parser for OpenAI format (text/event-stream)
                const decoder = new TextDecoder();
                for await (const chunk of responseBody) {
                    const text = decoder.decode(chunk);
                    // console.log(`📦 Raw Chunk: ${text.substring(0, 100)}...`); // Debug raw chunk

                    const lines = text.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data.trim() === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content;
                                if (content) {
                                    // console.log(`✨ Content: ${content}`);
                                    yield content;
                                }
                            } catch (e) {
                                // Ignore parse errors for partial chunks
                                // console.warn(`⚠️ Parse Error for data: ${data.substring(0, 50)}...`, e.message);
                            }
                        }
                    }
                }
            }
        } else {
            // Raw Stream (FlowFlow style)
            for await (const chunk of responseBody) {
                yield chunk.toString();
            }
        }

    } catch (error) {
        console.error('Custom Agent Error:', error);
        yield `Error connecting to ${aiId}: ${error.message}`;
    }
}
