import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
    apiKey: 'AIzaSyBLuhcHD_bU99Ddash2roEnJrKYoOBB1Gw'
});

async function test() {
    try {
        console.log('Testing Gemini API - Full text extraction...\n');

        const response = await ai.models.generateContentStream({
            model: "gemini-3-pro-preview",
            contents: "Say hello in Thai with emojis",
        });

        for await (const chunk of response) {
            if (chunk.candidates && chunk.candidates[0]) {
                const content = chunk.candidates[0].content;
                console.log('Content:', JSON.stringify(content, null, 2));

                if (content.parts && content.parts[0]) {
                    const text = content.parts[0].text;
                    console.log('Text chunk:', text);
                    console.log('---');
                }
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
