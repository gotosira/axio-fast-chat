import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    port: process.env.PORT || 3001,
    knowledgeBasePath: '/Users/sira/Documents/AXIO-FAST-CHAT/documents/baobao'
};
