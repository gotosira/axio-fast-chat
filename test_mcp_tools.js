import { mcpManager } from './server/mcp/McpClientManager.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_CONFIG_PATH = path.join(__dirname, 'server/mcp_config.json');

async function loadMcpConfig() {
    try {
        const data = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function testMcp() {
    console.log("Testing MCP Manager...");

    // Mock initMcpServers logic
    const servers = await loadMcpConfig();
    console.log(`Found ${servers.length} servers in config.`);

    for (const server of servers) {
        try {
            await mcpManager.connect(server);
        } catch (error) {
            console.error(`Failed to connect to ${server.name}:`, error.message);
        }
    }

    const tools = await mcpManager.getTools();
    console.log("Available Tools:", JSON.stringify(tools, null, 2));

    const geminiTools = mcpManager.getGeminiTools(tools);
    console.log("Gemini Tools:", JSON.stringify(geminiTools, null, 2));

    // Clean up
    for (const server of servers) {
        await mcpManager.disconnect(server.id);
    }
}

testMcp();
