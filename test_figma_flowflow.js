
import { generateAIResponseStream } from './server/geminiService.js';
import { mcpManager } from './server/mcp/McpClientManager.js';
import fs from 'fs';
import path from 'path';

// Mock the AI ID and Query
const AI_ID = 'flowflow';
const QUERY = "Analyze this design: https://www.figma.com/design/c8hfXe7pvQI5gVWBX5DNcf/Login-and-OTP---Templates?node-id=11001-13690&t=R0U8Y8v9vd1138O8-4";

async function runTest() {
    console.log("🚀 Starting FlowFlow Figma Test...");

    try {
        // Initialize MCP (needed for the tool)
        const mcpConfigPath = path.join(process.cwd(), 'server', 'mcp_config.json');
        const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));

        console.log("🔌 Connecting to MCP servers...");
        console.log("🔌 Connecting to MCP servers...");
        // mcpConfig is an array of server configs
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

        console.log("🛠️ Checking available tools...");
        const tools = await mcpManager.getTools();
        console.log(`🛠️ Found ${tools.length} MCP tools:`, tools.map(t => t.name));

        console.log("🤖 Generating AI Response...");
        const stream = generateAIResponseStream(QUERY, [], null, null, AI_ID, []);

        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }

        console.log("\n\n✅ Test Complete!");

    } catch (error) {
        console.error("\n❌ Test Failed:", error);
    } finally {
        // Cleanup
        process.exit(0);
    }
}

runTest();
