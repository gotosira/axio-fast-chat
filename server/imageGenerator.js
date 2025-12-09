import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import mime from 'mime-types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔑 Image Generator - API Key Status:', config.geminiApiKey ? `Loaded (${config.geminiApiKey.substring(0, 10)}...)` : 'NOT LOADED');

const ai = new GoogleGenAI({
    apiKey: config.geminiApiKey,
});

/**
 * Generate design image using Gemini 3 Pro Image Preview
 * Based on official TypeScript example from Google
 */
export async function generateDesignImage(userPrompt, designSystemContext = '') {
    try {
        console.log('🎨 Generating design image with Gemini 3 Pro Image Preview...');

        const systemGuidelines = designSystemContext ? designSystemContext.substring(0, 3000) : 'Modern, clean, and professional UI design with good contrast and accessibility.';

        const fullPrompt = `Create a professional UI/UX design image for: ${userPrompt}

Follow these AXIO Design System guidelines:
${systemGuidelines}

IMPORTANT: Generate an actual IMAGE visualization showing the component design with all states and variations.`;

        const tools = [
            {
                googleSearch: {}
            }
        ];

        const generationConfig = {
            responseModalities: [
                'IMAGE',
                'TEXT',
            ],
            imageConfig: {
                aspectRatio: '16:9',
                imageSize: '4K',
            },
            tools,
        };

        const model = 'gemini-3-pro-image-preview';

        const contents = [
            {
                role: 'user',
                parts: [
                    {
                        text: fullPrompt,
                    },
                ],
            },
        ];

        const response = await ai.models.generateContentStream({
            model,
            config: generationConfig,
            contents,
        });

        let fileIndex = 0;
        let savedFilename = null;
        const publicDir = path.join(__dirname, '../public/generated-images');

        // Create directory if it doesn't exist
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }

        for await (const chunk of response) {
            if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
                continue;
            }

            if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
                const inlineData = chunk.candidates[0].content.parts[0].inlineData;
                const fileExtension = mime.extension(inlineData.mimeType || 'image/png');
                const buffer = Buffer.from(inlineData.data || '', 'base64');

                savedFilename = `flowflow_${Date.now()}_${fileIndex++}.${fileExtension}`;
                const filepath = path.join(publicDir, savedFilename);

                fs.writeFileSync(filepath, buffer);
                console.log('✅ Image saved:', filepath);
            } else if (chunk.text) {
                console.log('📝 Text response:', chunk.text);
            }
        }

        if (!savedFilename) {
            throw new Error('No image data found in response - API returned only text');
        }

        return {
            success: true,
            imageUrl: `/generated-images/${savedFilename}`,
            filename: savedFilename
        };

    } catch (error) {
        console.error('❌ Image generation error:', error);
        return {
            success: false,
            error: error.message || 'Failed to generate image'
        };
    }
}
