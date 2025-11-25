import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class McpClientManager {
    constructor() {
        this.clients = new Map(); // Map<connectionId, Client>
        this.connections = new Map(); // Map<connectionId, config>
    }

    /**
     * Connect to an MCP server
     * @param {Object} config - { id, type: 'stdio'|'sse', command, args, url, env }
     */
    async connect(config) {
        if (this.clients.has(config.id)) {
            console.log(`MCP Client ${config.id} already connected.`);
            return;
        }

        console.log(`🔌 Connecting to MCP server: ${config.name} (${config.type})...`);

        let transport;
        if (config.type === 'stdio') {
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...(config.env || {}) }
            });
        } else if (config.type === 'sse') {
            transport = new SSEClientTransport({
                url: new URL(config.url),
                eventSourceInit: {
                    withCredentials: false,
                },
                requestInit: {
                    headers: config.headers || {}
                }
            });
        } else {
            throw new Error(`Unsupported transport type: ${config.type}`);
        }

        const client = new Client(
            {
                name: "axio-fast-chat",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {},
                },
            }
        );

        try {
            await client.connect(transport);
            this.clients.set(config.id, client);
            this.connections.set(config.id, config);
            console.log(`✅ Connected to MCP server: ${config.name}`);
        } catch (error) {
            console.error(`❌ Failed to connect to MCP server ${config.name}:`, error);
            throw error;
        }
    }

    /**
     * Disconnect from an MCP server
     */
    async disconnect(connectionId) {
        const client = this.clients.get(connectionId);
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.warn(`Error closing client ${connectionId}:`, e);
            }
            this.clients.delete(connectionId);
            this.connections.delete(connectionId);
            console.log(`Disconnected from ${connectionId}`);
        }
    }

    /**
     * Get all available tools from all connected servers
     * Returns an array of Gemini-compatible function declarations
     */
    async getTools() {
        const allTools = [];

        for (const [id, client] of this.clients.entries()) {
            try {
                const result = await client.listTools();
                const tools = result.tools.map(tool => ({
                    ...tool,
                    // Ensure name is unique across servers by prefixing if needed? 
                    // For now, let's trust names are unique or user handles it.
                    // We might want to store which client belongs to which tool.
                    _clientId: id
                }));
                allTools.push(...tools);
            } catch (error) {
                console.error(`Error listing tools for client ${id}:`, error);
            }
        }

        return allTools;
    }

    /**
     * Convert MCP tools to Gemini Function Declarations
     */
    getGeminiTools(mcpTools) {
        return mcpTools.map(tool => ({
            name: this._sanitizeToolName(tool.name),
            description: tool.description,
            parameters: tool.inputSchema
        }));
    }

    _sanitizeToolName(name) {
        // Gemini tool names must match ^[a-zA-Z0-9_-]+$
        return name.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    /**
     * Call a tool
     * @param {string} name - Tool name
     * @param {Object} args - Tool arguments
     */
    async callTool(name, args) {
        // Find which client has this tool
        // Since we don't have a direct map, we iterate. Optimization: cache this.
        for (const [id, client] of this.clients.entries()) {
            try {
                const result = await client.listTools();
                const tool = result.tools.find(t => this._sanitizeToolName(t.name) === name);

                if (tool) {
                    console.log(`🛠️ Calling MCP tool '${name}' on server '${this.connections.get(id).name}'`);
                    const response = await client.callTool({
                        name: tool.name, // Use original name
                        arguments: args
                    });

                    // MCP response format: { content: [{ type: 'text', text: '...' }] }
                    // We want to return a simple string or JSON for Gemini
                    if (response.content && response.content.length > 0) {
                        return response.content.map(c => c.text).join('\n');
                    }
                    return "Tool executed successfully with no output.";
                }
            } catch (error) {
                console.error(`Error checking tools on client ${id}:`, error);
            }
        }
        throw new Error(`Tool '${name}' not found on any connected MCP server.`);
    }
}

// Singleton instance
export const mcpManager = new McpClientManager();
