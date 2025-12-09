#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fetch from "node-fetch";

const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;

if (!FIGMA_ACCESS_TOKEN) {
    console.error("Error: FIGMA_ACCESS_TOKEN environment variable is required.");
    process.exit(1);
}

const server = new Server(
    {
        name: "figma-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Fetch a node from Figma API
 */
async function getFigmaNode(fileKey, nodeId) {
    const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`;

    try {
        const response = await fetch(url, {
            headers: {
                "X-Figma-Token": FIGMA_ACCESS_TOKEN
            }
        });

        if (!response.ok) {
            throw new Error(`Figma API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.nodes[nodeId.replace('-', ':')] || data.nodes[nodeId];
    } catch (error) {
        throw new Error(`Failed to fetch Figma node: ${error.message}`);
    }
}

/**
 * Parse Figma URL to extract file key and node ID
 */
function parseFigmaUrl(url) {
    try {
        const urlObj = new URL(url);
        // Example: https://www.figma.com/design/lkj345/File-Name?node-id=123-456
        // Path: /design/FILE_KEY/File-Name
        // Query: node-id=NODE_ID

        const pathParts = urlObj.pathname.split('/');
        // Find the part that looks like a file key (usually after 'file' or 'design')
        let fileKey = null;
        for (let i = 0; i < pathParts.length; i++) {
            if ((pathParts[i] === 'file' || pathParts[i] === 'design') && pathParts[i + 1]) {
                fileKey = pathParts[i + 1];
                break;
            }
        }

        const nodeId = urlObj.searchParams.get('node-id');

        if (!fileKey || !nodeId) {
            throw new Error("Could not extract file key or node ID from URL");
        }

        return { fileKey, nodeId };
    } catch (error) {
        throw new Error(`Invalid Figma URL: ${error.message}`);
    }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_figma_node",
                description: "Fetch details of a specific node from a Figma file using its URL. Use this to inspect designs.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The full URL of the Figma node (e.g., https://www.figma.com/design/KEY/Name?node-id=1-2)"
                        }
                    },
                    required: ["url"]
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Helper function to get image URL from Figma
    async function getFigmaImage(fileKey, nodeId) {
        const url = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png&scale=2`;
        try {
            const response = await fetch(url, {
                headers: {
                    'X-Figma-Token': FIGMA_ACCESS_TOKEN
                }
            });

            if (!response.ok) {
                console.warn('Failed to fetch Figma image:', response.statusText);
                return null;
            }

            const data = await response.json();
            return data.images?.[nodeId] || null;
        } catch (e) {
            console.warn('Error fetching image:', e);
            return null;
        }
    }

    if (request.params.name === "get_figma_node") {
        const { url } = request.params.arguments;

        try {
            const { fileKey, nodeId } = parseFigmaUrl(url);
            const nodeData = await getFigmaNode(fileKey, nodeId);

            // Helper to extract comprehensive design data
            function simplifyNode(node, depth = 0) {
                if (!node) return null;
                // Limit depth to avoid huge payloads
                if (depth > 5) return { id: node.id, name: node.name, type: node.type };

                const simple = {
                    id: node.id,
                    name: node.name,
                    type: node.type,
                    visible: node.visible !== false,
                };

                // Layout & Sizing
                if (node.absoluteBoundingBox) {
                    simple.width = Math.round(node.absoluteBoundingBox.width);
                    simple.height = Math.round(node.absoluteBoundingBox.height);
                    simple.x = Math.round(node.absoluteBoundingBox.x);
                    simple.y = Math.round(node.absoluteBoundingBox.y);
                }

                // Auto Layout
                if (node.layoutMode) {
                    simple.layout = {
                        mode: node.layoutMode,
                        padding: node.paddingLeft ? {
                            top: node.paddingTop,
                            right: node.paddingRight,
                            bottom: node.paddingBottom,
                            left: node.paddingLeft
                        } : undefined,
                        itemSpacing: node.itemSpacing,
                        primaryAxisAlignItems: node.primaryAxisAlignItems,
                        counterAxisAlignItems: node.counterAxisAlignItems,
                    };
                }

                // Text content
                if (node.type === 'TEXT' && node.characters) {
                    simple.text = node.characters.slice(0, 2000);
                }

                // Colors & Fills
                if (node.fills && node.fills.length > 0) {
                    simple.fills = node.fills.slice(0, 3).map(f => {
                        if (f.type === 'SOLID' && f.color) {
                            return {
                                type: 'SOLID',
                                color: rgbToHex(f.color),
                                opacity: f.opacity
                            };
                        } else if (f.type === 'GRADIENT_LINEAR') {
                            return { type: 'GRADIENT' };
                        } else if (f.type === 'IMAGE') {
                            return { type: 'IMAGE' };
                        }
                        return { type: f.type };
                    });
                }

                // Strokes
                if (node.strokes && node.strokes.length > 0) {
                    simple.strokes = node.strokes.slice(0, 2).map(s => ({
                        type: s.type,
                        color: s.color ? rgbToHex(s.color) : undefined,
                        weight: node.strokeWeight
                    }));
                }

                // Corner Radius
                if (node.cornerRadius !== undefined) {
                    simple.cornerRadius = node.cornerRadius;
                }

                // Effects
                if (node.effects && node.effects.length > 0) {
                    simple.effects = node.effects.filter(e => e.visible !== false).map(e => ({
                        type: e.type,
                        radius: e.radius,
                        color: e.color ? rgbToHex(e.color) : undefined
                    }));
                }

                // Typography
                if (node.style) {
                    simple.textStyle = {
                        fontFamily: node.style.fontFamily,
                        fontWeight: node.style.fontWeight,
                        fontSize: node.style.fontSize,
                        lineHeight: node.style.lineHeightPx,
                        letterSpacing: node.style.letterSpacing,
                        textAlign: node.style.textAlignHorizontal,
                    };
                }

                // Component Info
                if (node.componentId || node.componentPropertyReferences) {
                    simple.isComponent = true;
                }

                // Children (recursive)
                if (node.children && depth < 5) {
                    simple.children = node.children.slice(0, 50).map(child => simplifyNode(child, depth + 1));
                    if (node.children.length > 50) {
                        simple.childrenNote = `${node.children.length - 50} more children not shown`;
                    }
                }

                return simple;
            }

            function rgbToHex(color) {
                if (!color) return null;
                const r = Math.round(color.r * 255);
                const g = Math.round(color.g * 255);
                const b = Math.round(color.b * 255);
                return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
            }

            const simplified = simplifyNode(nodeData.document);

            // Fetch image preview
            const imageUrl = await getFigmaImage(fileKey, nodeId);

            const result = {
                name: simplified.name,
                type: simplified.type,
                imageUrl: imageUrl || null,
                design: simplified
            };

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error fetching Figma node: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    }

    throw new Error(`Tool not found: ${request.params.name}`);
});

// Helper for Zod schema conversion (since we might not have zod-to-json-schema available in this script context easily without build step, 
// let's manually define the schema or import it if we are sure it's available. 
// Actually, let's just use the JSON schema directly to avoid dependency issues in this standalone script if possible, 
// OR ensure we run it with node where node_modules are available. 
// Given the environment, node_modules are available in the root.
// So imports should work if we run it from root.)

// We need to import zodToJsonSchema.


async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
