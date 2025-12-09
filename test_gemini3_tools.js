import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config } from './server/config.js';

const ai = new GoogleGenAI({
    apiKey: config.geminiApiKey
});

const matchSchema = z.object({
    winner: z.string().describe("The name of the winner."),
    final_match_score: z.string().describe("The final score."),
    scorers: z.array(z.string()).describe("The name of the scorer.")
});

async function run() {
    try {
        console.log("Testing Gemini 3 Pro Preview with Google Search...");
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: {
                role: 'user',
                parts: [{ text: "Search for all details for the latest Euro 2024 final match." }]
            },
            config: {
                tools: [
                    { googleSearch: {} }
                ],
                responseMimeType: "application/json",
                responseJsonSchema: zodToJsonSchema(matchSchema),
            },
        });

        console.log("Response received. Parsing...");
        console.log("Raw text:", response.text());

        if (response.text()) {
            const match = matchSchema.parse(JSON.parse(response.text()));
            console.log("Parsed Match Data:", match);
        } else {
            console.log("No text in response");
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

run();
