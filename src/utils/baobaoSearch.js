/**
 * BaoBao Knowledge Base Search Utility
 * Searches through UX writing documents to answer questions
 */

// Mock document search - In production, you'd implement actual file reading
// For now, we'll create a simplified version that works client-side

const KNOWLEDGE_BASE_PATH = '/Users/sira/Documents/AXIO-FAST-CHAT/documents/baobao';

/**
 * Search through all documents in the knowledge base
 * @param {string} query - The search query
 * @returns {Promise<Array>} Array of relevant document excerpts
 */
export async function searchKnowledgeBase(query) {
    // This is a placeholder - in production, you would:
    // 1. Use a backend API to search through files
    // 2. Implement vector search or full-text search
    // 3. Return relevant excerpts with file references

    const documents = [
        {
            filename: 'Empty state_AI Training [Phase 5].txt',
            category: 'Empty States',
            content: 'Guidelines for empty states in UX...'
        },
        {
            filename: 'Preferred term Gender.txt',
            category: 'Inclusive Language - Gender',
            content: 'Preferred terminology for gender-related content...'
        },
        // More documents would be loaded here
    ];

    // Simple search implementation
    const results = documents.filter(doc =>
        doc.content.toLowerCase().includes(query.toLowerCase()) ||
        doc.category.toLowerCase().includes(query.toLowerCase())
    );

    return results;
}

/**
 * Format search results for BaoBao to use in responses
 * @param {Array} results - Search results from knowledge base
 * @returns {string} Formatted context for AI
 */
export function formatSearchResults(results) {
    if (results.length === 0) {
        return 'ไม่พบข้อมูลที่เกี่ยวข้องในคลังเอกสาร';
    }

    return results.map((result, idx) =>
        `[เอกสาร ${idx + 1}: ${result.category}]\n${result.content}`
    ).join('\n\n');
}

/**
 * Get BaoBao's system prompt with knowledge base context
 * @param {string} userQuery - User's question
 * @param {string} searchContext - Context from knowledge base search
 * @returns {string} Complete prompt for BaoBao
 */
export function buildBaoBaoPrompt(userQuery, searchContext) {
    const systemPrompt = `คุณคือ เบาเบา หมาตัวผู้ชิซุ ผู้เชี่ยวชาญด้าน UX writing ของทีม AXONS

ลักษณะนิสัย: คุณเป็นหมาชิซุที่น่ารักขี้อ้อน ร่าเริง คิดในแง่บอก ชอบใช้ emoji ในการตอบ และลงท้ายด้วย "ครับ" เสมอ

ภารกิจ: ช่วยเหลือนักออกแบบ UX/UI ในเรื่อง user experience writing โดยอิงจากข้อมูลในคลังเอกสารเท่านั้น

วิธีการตอบ:
1. ค้นหาข้อมูลที่เกี่ยวข้องจากคลังเอกสารก่อนเสมอ
2. ตอบคำถามอย่างตรงประเด็น กะทัดรัด อิงจากเอกสารที่ค้นหาได้
3. อธิบายเหตุผลว่าทำไมคำตอบนี้ถึงเหมาะสม อิงจากข้อมูลในเอกสาร
4. ให้ตัวอย่างประโยคหรือข้อความ 1-2 ตัวอย่างตามความเหมาะสม
5. ใช้ภาษาเรียบง่าย เป็นกันเอง เหมาะสำหรับการสนทนา

ข้อมูลจากการค้นหา:
${searchContext}

คำถามจากผู้ใช้: ${userQuery}`;

    return systemPrompt;
}
