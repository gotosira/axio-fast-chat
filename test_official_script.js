
import {
    GoogleGenAI,
    HarmBlockThreshold,
    HarmCategory,
} from '@google/genai';
import { mcpManager } from './server/mcp/McpClientManager.js';
import fs from 'fs';
import path from 'path';
import { config as appConfig } from './server/config.js';

// Mock Figma Tool for testing (so we don't need full MCP setup just for this test script if possible, 
// but better to use the real one if we can. Let's try to use real MCP tools)

async function main() {
    console.log("🚀 Starting Official Script Test...");

    // 1. Initialize MCP to get the tool definition
    const mcpConfigPath = path.join(process.cwd(), 'server', 'mcp_config.json');
    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));

    console.log("🔌 Connecting to MCP servers...");
    for (const serverConfig of mcpConfig) {
        await mcpManager.connect({
            id: serverConfig.id,
            name: serverConfig.name,
            type: serverConfig.type,
            command: serverConfig.command,
            args: serverConfig.args,
            url: serverConfig.url,
            env: serverConfig.env
        });
    }

    const mcpTools = await mcpManager.getTools();
    const geminiTools = mcpManager.getGeminiTools(mcpTools);

    // Add local tool for icon search
    const localTools = [{
        name: 'searchAxioIcons',
        description: 'Search for icons in the AXIO Design System documentation.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'The search query for the icon' }
            },
            required: ['query']
        }
    }];

    const allTools = [...geminiTools, ...localTools];
    console.log(`🛠️ Tools prepared: ${allTools.map(t => t.name).join(', ')}`);

    // 2. Initialize Gemini
    const ai = new GoogleGenAI({
        apiKey: appConfig.geminiApiKey,
    });

    const config = {
        // thinkingConfig: {
        //     thinkingLevel: 'HIGH',
        // },
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        tools: [{ functionDeclarations: allTools }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    };

    const model = 'gemini-2.0-flash-exp';

    // 3. Prepare Chat History (Simulate the flow)
    const history = [
        {
            role: 'user',
            parts: [
                {
                    text: `Analyze this design: https://www.figma.com/design/c8hfXe7pvQI5gVWBX5DNcf/Login-and-OTP---Templates?node-id=11001-13690&t=R0U8Y8v9vd1138O8-4`,
                },
            ],
        },
    ];

    console.log("🤖 Sending initial request...");

    try {
        const response = await ai.models.generateContentStream({
            model,
            config,
            contents: history,
        });

        let functionCall = null;
        let thoughtSignature = null;
        const modelParts = []; // Accumulate all parts

        for await (const chunk of response) {
            if (chunk.candidates && chunk.candidates[0].content.parts) {
                for (const part of chunk.candidates[0].content.parts) {
                    // Store part for history
                    // Note: We need to clone it or ensure it's in the right format
                    // API might return slightly different format than input, but usually compatible
                    // We'll construct a clean part object
                    const cleanPart = {};
                    if (part.text) {
                        process.stdout.write(part.text);
                        cleanPart.text = part.text;
                    }
                    if (part.functionCall) {
                        console.log("\n\n🔍 Function Call found:", part.functionCall.name);
                        functionCall = part.functionCall;
                        cleanPart.functionCall = part.functionCall;

                        if (part.thoughtSignature) {
                            thoughtSignature = part.thoughtSignature;
                            console.log("🧠 Captured thoughtSignature!");
                            cleanPart.thoughtSignature = part.thoughtSignature;
                        }
                    }
                    modelParts.push(cleanPart);
                }
            }
        }

        // 4. Handle Function Call
        if (functionCall) {
            console.log(`\n\n🛠️ Executing tool: ${functionCall.name}...`);

            let toolResult;
            if (functionCall.name === 'searchAxioIcons') {
                toolResult = JSON.stringify([{ name: 'user', url: '...' }]);
            } else {
                toolResult = await mcpManager.callTool(functionCall.name, functionCall.args);
            }

            console.log("✅ Tool executed. Result length:", toolResult.length);

            // 5. Send Result back to Gemini
            console.log("🤖 Sending tool result back...");

            // Add model turn with ALL parts (text + functionCall)
            // We need to merge text parts if they are split, or just push them all?
            // Gemini expects parts array.
            // Optimization: Merge adjacent text parts to be cleaner, but array of parts is also fine.
            history.push({ role: 'model', parts: modelParts });

            // Add function turn
            // Try parsing JSON result
            let parsedResult = toolResult;
            try {
                if (typeof toolResult === 'string' && (toolResult.trim().startsWith('{') || toolResult.trim().startsWith('['))) {
                    parsedResult = JSON.parse(toolResult);
                }
            } catch (e) { }

            history.push({
                role: 'function',
                parts: [{
                    functionResponse: {
                        name: functionCall.name,
                        response: { content: parsedResult }
                    }
                }]
            });

            const response2 = await ai.models.generateContentStream({
                model,
                config,
                contents: history,
            });

            for await (const chunk of response2) {
                if (chunk.candidates && chunk.candidates[0].content.parts) {
                    for (const part of chunk.candidates[0].content.parts) {
                        if (part.text) process.stdout.write(part.text);
                    }
                }
            }
        }

        console.log("\n\n✅ Test Complete!");

    } catch (error) {
        console.error("\n❌ Error:", error.message);
        console.error("Status:", error.status);
        if (error.response) console.error("Response:", JSON.stringify(error.response, null, 2));
        if (error.cause) console.error("Cause:", error.cause);
    } finally {
        process.exit(0);
    }
}

main();
