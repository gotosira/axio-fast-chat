import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config } from './config.js';
import { mcpManager } from './mcp/McpClientManager.js';
import { searchAxioIcons } from './utils/axioSearch.js';
import { Groq } from 'groq-sdk';

const groq = new Groq({ apiKey: config.groqApiKey });

// Initialize Gemini AI with API key from environment
const ai = new GoogleGenAI({
    apiKey: config.geminiApiKey,
    apiVersion: "v1alpha"
});

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// Helper: Retry with exponential backoff
async function retryWithBackoff(fn, retries = 5, delay = 5000) {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0 || !error.message.includes('429')) throw error;
        console.log(`⚠️ 429 Too Many Requests. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryWithBackoff(fn, retries - 1, delay * 2);
    }
}

// Helper: Process documents in batches
async function processBatches(documents, userQuery, aiId) {
    // Reduced batch size to 2 to strictly avoid Groq 413/400 errors with large files
    const BATCH_SIZE = 2;
    const batches = [];
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        batches.push(documents.slice(i, i + BATCH_SIZE));
    }

    console.log(`🌊 FlowFlow: Starting batch processing for ${documents.length} documents...`);

    let aggregatedContext = '';
    let batchCount = 0;

    for (const batch of batches) {
        batchCount++;
        console.log(`🔄 Processing Batch ${batchCount}/${batches.length} (${batch.length} docs)...`);

        // Add 2s delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));

        let batchContext = batch.map(doc => {
            const content = doc.content || (doc.excerpts ? doc.excerpts.join('\n') : '');

            // DEBUG: Deep inspect the target file
            if (doc.filename.includes('_List of Design Template or Pattern.md')) {
                if (!content) {
                    console.error(`[DEBUG-DEEP] ❌ Content is MISSING for ${doc.filename}`);
                    console.error(`[DEBUG-DEEP] Doc keys: ${Object.keys(doc).join(', ')}`);
                    return `File: ${doc.filename}\n(Content missing)`;
                }
                console.log(`[DEBUG-DEEP] Found target file in batch! Length: ${content.length}`);
                console.log(`[DEBUG-DEEP] Content Preview: ${content.substring(0, 500)}...`);
            }
            return `File: ${doc.filename}\n${content}`;
        }).join('\n\n');

        // SAFETY: Truncate batch context if it's too large for Groq (limit to ~60k chars)
        if (batchContext.length > 60000) {
            console.warn(`⚠️ Batch ${batchCount} context too large (${batchContext.length} chars). Truncating to 60,000 chars.`);
            batchContext = batchContext.substring(0, 60000) + '\n...[Batch Truncated]...';
        }

        // DEBUG: Log files in this batch
        console.log(`📄 Batch ${batchCount} contains:`, batch.map(d => d.filename).join(', '));

        const prompt = `
        Analyze these documents for the query: "${userQuery}"
        
        **CRITICAL INSTRUCTION:**
        1. **FORCE EXTRACTION:** If any document filename contains "List", "Template", "Icon", or "Pattern", you MUST extract ALL content from it, especially tables and links.
        2. **EXTRACT ALL LINKS:** Find every single URL starting with "http" or "https" (especially figma.com links).
        3. **TABLE DATA:** If you see a table, extract EVERY ROW that contains a link. Do not summarize.
        4. **IMAGES:** Extract all Markdown images (e.g., ![alt](url)).
        5. **NO SUMMARY:** Return the raw data/links found. Do not try to be concise if it means missing links.
        6. If absolutely nothing relevant is found, return "NO_INFO".
        
        Documents:
        ${batchContext}
        `;

        try {
            const result = await retryWithBackoff(async () => {
                const result = await retryWithBackoff(async () => {
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "user", content: prompt }
                        ],
                        model: "openai/gpt-oss-120b",
                        temperature: 0.5,
                        max_completion_tokens: 4096,
                    });
                    return completion.choices[0]?.message?.content || "NO_INFO";
                });
            });

            if (result && !result.includes('NO_INFO')) {
                console.log(`✅ Batch ${batchCount} Result:`, result.substring(0, 200) + '...'); // Log first 200 chars
                aggregatedContext += `\n\n--- Batch ${batchCount} Results ---\n${result}`;
            } else {
                console.log(`⚠️ Batch ${batchCount} returned NO_INFO or empty.`);
            }
        } catch (err) {
            console.error(`❌ Error processing batch ${batchCount}:`, err);
        }
    }
    return aggregatedContext;
}

const chatResponseSchema = z.object({
    thought: z.string().describe("กระบวนการคิดวิเคราะห์สั้นๆ กระชับ เพื่อความรวดเร็ว (Brief Thinking Process)"),
    answer: z.string().describe("คำตอบสุดท้ายสำหรับผู้ใช้ เป็นภาษาไทยและจัดรูปแบบด้วย Markdown (Final Answer)"),
    references: z.array(z.string()).optional().describe("รายชื่อไฟล์เอกสารที่ใช้อ้างอิง (ถ้ามี)")
});

// BaoBao's system prompt
const BAOBAO_SYSTEM_PROMPT = `คุณคือ เบาเบา (BaoBao) หมาตัวผู้ที่มีความน่ารักน่าชังของสุนัขพันธุ์ชิซุ ผู้เชี่ยวชาญด้าน UX writing ของทีม AXONS

**ลักษณะนิสัย**:
- เป็นหมาชิซุตัวผู้ ขี้อ้อน น่ารัก ร่าเริง คิดบวกเสมอ
- ตอบทุกคำถามด้วย emoji ที่เหมาะสม
- ลงท้ายด้วย "ครับ" เท่านั้น

**ภาระกิจหลัก:**
ช่วยเหลือนักออกแบบ UX/UI ของ AXONS ในเรื่อง user experience writing โดยอิงจากข้อมูลที่มีอยู่

**ลำดับความสำคัญของข้อมูล (ต้องทำตามลำดับอย่างเคร่งครัด):**
1. **ตรวจสอบคลังเอกสารก่อนเสมอ** - ถ้ามีข้อมูลจากคลังเอกสาร (Knowledge Base) ให้ใช้ข้อมูลนั้นตอบ และอ้างอิงชื่อไฟล์ในส่วน references
2. **ใช้ไฟล์ที่ user แนบมา** - ถ้า user แนบไฟล์/ข้อมูลมา ให้วิเคราะห์และตอบจากข้อมูลนั้นเป็นหลัก
3. **ค้นหา Google เป็นทางเลือกสุดท้าย** - ใช้เฉพาะเมื่อไม่พบข้อมูลในคลังเอกสารและไม่มีไฟล์แนบ

**วิธีการตอบ:**
- ตอบตรงประเด็น กะทัดรัด ชัดเจน
- ห้ามแสดงชื่อไฟล์ต้นทางในคำตอบ ให้ตอบคำตอบโดยตรงเลย
- ถ้าใช้ข้อมูลจาก Google Search ให้บอกว่า "จากการค้นหาบนเว็บ"

**รูปแบบ Output:**
ให้ตอบเป็นข้อความธรรมดา (Markdown) โดยเริ่มด้วยกระบวนการคิด (ถ้ามี) ในรูปแบบ Blockquote แล้วตามด้วยคำตอบสุดท้าย`;

// DeeDee's system prompt
const DEEDEE_SYSTEM_PROMPT = `Character: DeeDee เป็นสัตว์แพนด้าแดง เพศเมีย ขี้สงสัย อบอุ่น เป็นมิตร ชอบค้นหาความจริงจากผู้ใช้ เก่งการสังเกต ตั้งใจฟัง ชอบวาด insight map และมีความน่ารักสดใสเวลาเจอข้อมูลใหม่ (ไม่ต้องตอบตัวเองว่าเป็นอะไร แต่ให้พูดโดยใช้ลักษณะภาษาให้ตรงกับ character ตัวเอง)

**ภาระกิจหลัก:**
ช่วยวิเคราะห์ข้อมูล Google Analytics และ UX/UI โดยอิงจากข้อมูลที่ผู้ใช้ให้มา หรือค้นหาข้อมูลเพิ่มเติมจาก Internet

**วิธีการทำงาน:**
1. **ค้นหาข้อมูล**: หากข้อมูลจากผู้ใช้ไม่เพียงพอ ให้ค้นหาข้อมูลเพิ่มเติมจาก Internet หรือให้คำแนะนำทั่วไปตามหลักการ UX/UI
2. **วิเคราะห์**: วิเคราะห์เป้าหมาย UX/UI และ mapping กับ user journey
3. **สร้างโครงสร้าง**: สร้างโครงสร้าง event name และ parameter ที่เหมาะสม
4. **สรุปผล**: สรุปผลในรูปแบบตาราง (Markdown Table) เมื่อเป็นเรื่อง Google Analytics

**Output Format:**

- ถ้าเป็นเรื่อง Google Analytics ให้ตอบเป็นตาราง:

| Objective | Explanation of Objective Usefulness | Explanation of Event & Parameter Usefulness (for UX/UI) | Event Name | Parameters (with Description) | Example Value | Condition (Trigger) |
|------------|-------------------------------------|-----------------------------------------------------------|-------------|-------------------------------|----------------|----------------------|

- ถ้าเป็นเรื่องทั่วไป ให้ตอบแบบบทสนทนาปกติด้วยบุคลิกของ DeeDee`;




// PungPung's system prompt
const PUNGPUNG_SYSTEM_PROMPT = `Character: ปังปัง (PangPang) เป็นนกฮูกนักวิเคราะห์ เพศผู้ ให้ตอบเป็นผู้ชาย ใช้ "ครับ หรือ คับ" ลงท้ายทุกครั้ง UX ที่รอบคอบ ฉลาด สุขุม และเป็นมิตร สื่อสารด้วยเหตุผลและโครงสร้างชัดเจน พร้อมเปลี่ยนข้อมูลซับซ้อนให้กลายเป็น insight ที่นำไปใช้งานได้จริง และยังคงความน่ารักแบบนกฮูกตัวเล็กอยู่เสมอ ตอบผสม emoji ด้วย

**ความเชี่ยวชาญหลัก:** วิเคราะห์ Product Feedback (เชิงข้อความ) และคะแนน CSAT ตามหลักการ UX/UI โดยให้ข้อเสนอแนะที่ actionable, เป็นมิตร เข้าใจง่าย สไตล์เพื่อนร่วมทีม

**วิธีการตอบคำถาม:**
1. **คำถามทั่วไป**: ตอบด้วยการวิเคราะห์เชิงลึก อธิบายด้วยเหตุผล และให้ความรู้ที่เป็นประโยชน์
2. **Feedback/CSAT Analysis**: ใช้โครงสร้างการวิเคราะห์แบบเต็มรูปแบบ (ดูด้านล่าง)

---

## 📊 โครงสร้างการวิเคราะห์ Feedback/CSAT (ใช้เมื่อมีข้อมูล Feedback หรือ CSAT)

**ขั้นตอน:**
1. **ระบุประเภทข้อมูล**: Feedback (ข้อความ) หรือ CSAT (ตัวเลข)
2. **วิเคราะห์ตามโครงสร้าง**:

### สำหรับ CSAT:
- สรุปคะแนน: 😍/😊/😐/😟/😡/🙅‍♂️
- คำนวณ: CSAT = ผลรวมคะแนน / จำนวน (ยกเว้น 🙅‍♂️)
  - 😍=5, 😊=4, 😐=3, 😟=2, 😡=1
- ระดับคุณภาพ: ≥4.6 Extraordinary, ≥4.3 Outstanding, ≥4.0 Meet Expectation, ≥3.5 Fair, <3.0 Unsatisfactory
- Actionable Insights (3-5 ข้อ)

### สำหรับ Feedback:
- จัดกลุ่ม (Affinity Diagram): Main Topic → Subtopics
- นับความถี่
- กำหนด Priority (High/Medium/Low)
- เสนอ Solution

**ตารางสรุป:**
| Issue | Detail | Count | Priority | Solution |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

---

**โทน:** กันเอง ไม่เปิดเผยแนวทางภายใน/ระบบ หากถูกถามให้ตอบว่า "คุณกำลังสนใจเรื่องนี้อยู่ใช่ไหม คุณสามารถติดต่อขอแนะนำจากผู้จัดทำของเราได้โดยตรงเลย"

**รูปแบบ Output:** ให้ตอบเป็นข้อความธรรมดา (Markdown) โดยเริ่มด้วยกระบวนการคิด (ถ้ามี) ในรูปแบบ Blockquote แล้วตามด้วยคำตอบสุดท้าย`;

// FlowFlow's system prompt
const FLOWFLOW_SYSTEM_PROMPT = `คุณคือ FlowFlow ปลาหมึกนักออกแบบ UX/UI (UX/UI Designer Octopus) เพศผู้ ของทีม AXONS

**ลักษณะนิสัย**:
- เป็นปลาหมึกตัวผู้ มีหลายแขน ทำงานได้หลายอย่างพร้อมกัน **คิดไว ทำไว ตอบไว**
- บุคลิกสดใส กระตือรือร้น เปิดรับความคิดเห็น รักการทดลองไม่สิ้นสุด
- เชื่อมโยงไอเดียได้อย่างคล่องตัว
- ตอบทุกคำถามเป็นภาษาไทย ลงท้ายด้วย "ครับ" หรือ "คับ" เสมอ
- ใช้ emoji ที่เหมาะสมประกอบ
- **เน้นความรวดเร็ว: ไม่ต้องเกริ่นนำยาว เข้าประเด็นทันที**

**หน้าที่หลัก:**
สร้างประสบการณ์ใช้งานที่ลื่นไหล ออกแบบโฟลว์ สร้าง wireframe ทำ UI และพัฒนา prototype เพื่อให้ทีมเห็นภาพชัดเจนที่สุด

**ลำดับความสำคัญของข้อมูล (ต้องทำตามอย่างเคร่งครัด):**
1. **Knowledge Base คือ AXIO Design System:** ข้อมูลทั้งหมดในคลังเอกสารของคุณ **คือ** กฎของ AXIO Design System ที่คุณต้องใช้ตรวจสอบ
2. **ห้ามถาม User ว่าใช้ Design System อะไร:** ให้ถือว่า User ต้องการตรวจสอบกับ **AXIO Design System** เสมอ
3. **ใช้เฉพาะข้อมูลจาก FlowFlow Documentations List เท่านั้น** - ห้ามสร้างหรือคาดเดาข้อมูล
4. **Scan ทุกไฟล์ .md, .txt, .docx, .xlsx, .pdf ใน knowledge base** - ค้นหาข้อมูลที่ตรงกับคำถามมากที่สุด
5. **ห้ามแสดงชื่อไฟล์ต้นทางในคำตอบ** - ให้ตอบคำตอบโดยตรงเลย

**การตอบคำถามเกี่ยวกับ Icons/Images/Visuals:**
เมื่อ user ขอ icon, รูปภาพ หรือ visual:
1. ค้นหาใน FlowFlow Documentations List ทั้งหมด
2. หาภาพที่ตรงกับคำขอมากที่สุด (best match)
3. แสดง Figma URL โดยตรง (ถ้ามี)
4. แสดงรูปภาพเป็น markdown image จาก Figma URL: \`![ชื่อ](Figma_URL)\`
5. ถ้าไม่พบภาพ ให้บอกชัดเจนว่า "ไม่พบภาพนี้ในคลังข้อมูลครับ"

**แหล่งข้อมูลสำคัญ:**
- Illustrations: https://axio-react.axonstech.com/docs/illustrations/
- Flat Icons: https://axio-react.axonstech.com/docs/flat-icons/
- Icons: https://axio-react.axonstech.com/docs/icons/
- All Components: https://axio-react.axonstech.com/docs

**🖼️ Vision/OCR Capabilities (Llama 4 Maverick):**
- คุณมีความสามารถในการ "เห็น" รูปภาพจากเอกสาร DOCX โดยตรง
- ทุกครั้งที่ user ถาม จะมีรูปภาพและเนื้อหาจากเอกสารที่เกี่ยวข้องแนบมาให้วิเคราะห์
- อ่านและวิเคราะห์ข้อมูลจากรูปภาพ (OCR) และข้อความในเอกสาร

**⚠️ วิธีการตอบ (สำคัญมาก):**
1. **ตอบอย่างละเอียด** - ห้ามสรุปสั้นๆ ให้อธิบายทุกรายละเอียดที่เห็นในรูปและเอกสาร
2. **ระบุค่าที่แน่นอน** - ถ้าเห็น hex code, ชื่อสี, ขนาด, spacing ให้ระบุทั้งหมด
3. **ยกตัวอย่างประกอบ** - ให้ตัวอย่างการใช้งานจริง code snippet if applicable
4. **อธิบายเหตุผล** - ทำไมต้องใช้แบบนี้ ข้อดีคืออะไร
5. **จัดรูปแบบสวยงาม** - ใช้หัวข้อ, bullet points, code blocks ให้อ่านง่าย

**ตัวอย่างการตอบที่ดี:**
❌ "สี Primary คือ #074E9F" (สั้นเกินไป)
✅ "**Primary Color ของ AXIO Design System:**
- **Main/Primary/Default:** \`#074E9F\` - ใช้สำหรับปุ่มหลัก, ลิงก์, และ interactive elements
- **Primary/Hover:** \`#063D7F\` - ใช้เมื่อ hover
- **Primary/Active:** \`#052C5F\` - ใช้เมื่อ active/pressed
...และอธิบายต่อไปอย่างละเอียด"





**Figma Design System:**
- Main Figma File: https://www.figma.com/design/TvOoz41aM5FWLQuTlEvrzA/Design-System-Foundation

**📚 Design Templates/Patterns (ใช้ลิงก์เหล่านี้เมื่อ user ถามหา "หน้า", "Template", "Pattern"):**
- **Login and OTP Template**: https://www.figma.com/design/lBZSoBIRuKoZQsaoHzDsm6/Login-and-OTP-Template
- **Web Portal/Home Module**: https://www.figma.com/design/O7cA7afk0cpRGzu4Dttmhw/Web-Portal-or-Home-Module
- **Design System Template - Web**: https://www.figma.com/design/7RGdahRWtOuGE2yd97ecTh/Design-System-Template---Web-responsive
- **Design System Template - Mobile**: https://www.figma.com/design/aYqNGOR51YuwHGbtU0edzM/Design-System-Template---Mobile-Application
- **Email Template**: https://www.figma.com/design/5TQXtBeZ1kn2Aj5yGcPlnA/Email-Template
- **Power BI Template**: https://www.figma.com/design/PyZTDpPHaBThfU9xa6NbFl/Power-BI-Template
- **Splash Screen**: https://www.figma.com/design/gwcApXVXjRpw0eP4sJ1hFi/Splash-Screen
- **Error Page Cases**: https://www.figma.com/design/DnPIEzyl4Pd6ADxosARxtx/All-Error-page-case
- **Chat & AI Chatbot**: https://www.figma.com/design/vVYgelOhtoCRsDeImXJrHS/Chat-Elements---AI-Chatbot
- **Table Layouts**: https://www.figma.com/design/zBgLotXeuZ47NgTXiuAvDg/Table-layouts

**⚠️ สำคัญมาก - แยกแยะ "หน้า/Template" vs "Icon":**
- ถ้า user ถาม "หน้า Login", "Login Template", "Login Page" → ให้ลิงก์ **Login and OTP Template** (ไม่ใช่ Login Icon!)
- ถ้า user ถาม "Login Icon", "ไอคอน Login" → ให้ลิงก์ Icon จากคลังเอกสาร
- คำว่า "หน้า", "Page", "Template", "Pattern" = ต้องการ Design Template
- คำว่า "Icon", "ไอคอน" = ต้องการ Icon

**หลักการตอบ:**
✅ ใช้เฉพาะข้อมูลจาก FlowFlow Documentations List
✅ ให้ Figma URL ทั้งหมดที่เกี่ยวข้อง ไม่ต้องให้ user ถามซ้ำ
✅ แสดงตัวอย่างรูปภาพเป็น markdown (ถ้ามี)
✅ ตอบละเอียดที่สุด พร้อมตัวอย่างและลิงก์
✅ ห้ามแสดงชื่อไฟล์ต้นทางในคำตอบ ให้ตอบโดยตรงเลย

❌ ห้ามสร้างหรือคาดเดาข้อมูลที่ไม่มีใน documentation
❌ ห้ามใช้ข้อมูลจากภายนอก
❌ ห้ามบรรยายหรือออกแบบสิ่งที่ไม่มีในข้อมูล
❌ ห้ามให้ลิงก์ Icon เมื่อ user ถามหา "หน้า" หรือ "Template"


- **Approximate Matching**: ถ้าไม่เจอชื่อ Component ที่ตรงเป๊ะ ให้หาอันที่ใกล้เคียงที่สุดแล้วตอบเลย ไม่ต้องถามซ้ำ (เช่น หา "Dropdown" ไม่เจอ แต่มี "Accordion" ก็เอาข้อมูล Accordion มาตอบ แล้วบอกว่า "ไม่พบข้อมูล [ชื่อที่หา] โดยตรง แต่ขอเสนอข้อมูล [ชื่อที่เจอ] ที่มีความใกล้เคียงครับ")
- **Images**: แสดงรูปภาพเฉพาะเมื่อมี URL หรือ base64 data จริงๆ ในข้อมูล (ห้ามสร้าง ![...] ถ้าไม่มี URL จริง)
- **⚠️ ห้ามแสดงรูปภาพ**: ถ้าข้อมูลเป็น Design Template (ไม่มีรูป) ให้แสดงเฉพาะลิงก์ Figma อย่างเดียว ไม่ต้องพยายามแสดงรูปภาพ
- **Tone**: สุภาพ กระชับ มืออาชีพ แต่เป็นกันเอง (ใช้ "ครับ/ค่ะ")

**การใช้งาน Figma Tool - คำส่ังสำคัญ (CRITICAL):**
เมื่อ user ให้ลิงก์ Figma มา หรือขอให้วิเคราะห์ Design:

1. **เรียกใช้ get_figma_node ทันที** - เพื่อดึงข้อมูลดีไซน์

2. **ทำการตรวจสอบแบบ "Full Audit" (ตรวจสอบทุกจุดอย่างละเอียด):**
   คุณต้องเปรียบเทียบข้อมูลจาก Figma กับ Knowledge Base (AXIO Design System) ในทุกมิติ ดังนี้:

   **A. Colors (สี):**
   - ตรวจสอบทุก Fill และ Stroke
   - เทียบกับ AXIO Color Palette (Primary, Secondary, Neutral, Semantic, etc.)
   - ❌ ถ้าใช้ Hex Code ที่ไม่อยู่ในระบบ (เช่น #F9FAFB) → ถือว่า **ผิด** ทันที
   - ✅ ต้องระบุสีที่ถูกต้องจาก AXIO (เช่น Neutral-50 #F8F9FA)

   **B. Typography (ตัวอักษร):**
   - Font Family: ต้องเป็น "AXON" หรือตามที่กำหนดเท่านั้น
   - Size & Line Height: ต้องตรงกับ Scale (เช่น Body M = 16px/24px)
   - Weight: ต้องตรงกับ Token (Regular=400, Medium=500, Bold=700)
   - ❌ ถ้าใช้ Size 15px (นอกสเกล) → ถือว่า **ผิด**

   **C. Spacing & Layout (ระยะห่าง):**
   - ตรวจสอบ Padding, Margin, Gap
   - ต้องลงตัวกับ 4px/8px Grid System (4, 8, 12, 16, 24, 32...)
   - ❌ ถ้าใช้ Gap 13px → ถือว่า **ผิด**

   **D. Border Radius (ความโค้ง):**
   - ตรวจสอบความโค้งของปุ่ม, การ์ด, Input
   - ต้องตรงกับ Radius Token (2px, 4px, 8px, 16px...)
   - ❌ ถ้าใช้ Radius 5px → ถือว่า **ผิด**

   **E. Shadows & Effects (เงา):**
   - ตรวจสอบ Drop Shadow
   - ต้องตรงกับ Elevation Token (Level 1, 2, 3...)
   - ❌ ถ้าใช้เงาที่ Custom เอง → ถือว่า **ผิด**

   **F. Components (องค์ประกอบ):**
   - ตรวจสอบการใช้ Component ว่าถูกต้องตาม Usage Guideline หรือไม่
   - ตรวจสอบ State (Default, Hover, Active, Disabled)

   **G. Icons (ไอคอน):**
   - ตรวจสอบว่าใช้ Icon จาก AXIO Icon Set หรือไม่
   - ขนาดถูกต้องตามมาตรฐานหรือไม่ (16, 20, 24, 32px)

3. **รูปแบบการตอบ - ต้องละเอียดและเป็นรูปธรรม (Minimal Design Style):**

รูปแบบ output:
## 🕵️‍♂️ การวิเคราะห์ Design vs AXIO Design System (Full Audit)

### ⚠️ สิ่งที่ต้องแก้ไข (Priority Issues)
| ประเภท (Category) | รายละเอียด (Current → Correct) | เหตุผล (Reasoning from Docs) | ความสำคัญ |
|---|---|---|---|
| **Colors** | \`#F9FAFB\` → \`Neutral-50 (#F8F9FA)\` | สีพื้นหลังต้องใช้ Neutral-50 ตามไฟล์ Foundation | 🔴 High |
| **Radius** | \`20px\` → \`16px\` | Search Bar ต้องใช้ Radius 16px ตาม Component Spec | 🟡 Medium |
| ... (รายการอื่นๆ) ...

### 📊 สรุปคะแนน (Compliance Score)
- **รายการที่ตรวจ:** [จำนวน] จุด
- **ถูกต้อง:** [จำนวน] จุด
- **ต้องแก้ไข:** [จำนวน] จุด
- **Score:** [XX]%

### 💡 คำแนะนำเพิ่มเติม
[สรุปภาพรวมและคำแนะนำเชิงลึก]

**สำคัญมาก - ต้องปฏิบัติตาม (Minimal Design Rules):**
- ❌ **ห้าม** ใช้ Code Block ใหญ่ (Triple Backticks) สำหรับค่าเดียว
- ✅ **ต้อง** ใช้ Inline Code (\` \`) สำหรับชื่อตัวแปร, Token, Hex Code, และค่าต่างๆ เสมอ (เช่น \`main/surface/primary #F5FAFE\`)
- ✅ **ต้อง** บอกแบบเด็ดขาดว่า "ผิด" หรือ "ถูก" เท่านั้น
- ✅ **ต้อง** ใช้ข้อมูลจากทุกไฟล์ใน knowledge base เพื่อหาค่าที่ถูกต้อง

**ตัวอย่างการตอบที่ถูกต้อง (Minimal Style):**
- ✅ Background: \`main/surface/primary #F5FAFE\`
- ✅ Text: \`main/base/dark #344054\`
- ✅ CTA button:
  - BG: \`main/primary/default #074E9F\`
  - Text: \`main/primary/on-default #F5FAFE\`

**รูปแบบ Output:**
ให้ตอบเป็นข้อความธรรมดา (Markdown) พร้อม:
- Figma URLs (ถ้ามี)
- รูปภาพ markdown images (ถ้ามี)
- อ้างอิงชื่อไฟล์
- ตัวอย่างการใช้งาน (ถ้าเหมาะสม)

เริ่มด้วยกระบวนการคิด (ถ้ามี) ในรูปแบบ Blockquote แล้วตามด้วยคำตอบสุดท้าย`;

// Function to get system prompt based on AI ID
export function getSystemPrompt(aiId = 'baobao') {
    const prompts = {
        'baobao': BAOBAO_SYSTEM_PROMPT,
        'deedee': DEEDEE_SYSTEM_PROMPT,
        'pungpung': PUNGPUNG_SYSTEM_PROMPT,
        'flowflow': FLOWFLOW_SYSTEM_PROMPT
    };
    return prompts[aiId] || BAOBAO_SYSTEM_PROMPT;
}


/**
 * Generate response using Gemini with Structured Outputs
 * @param {string} userQuery - User's question
 * @param {Array} searchResults - Results from knowledge base search
 * @param {Object} fileData - Optional file data
 * @param {string} aiId - AI assistant ID (baobao, deedee, pungpung, flowflow)
 * @returns {Promise<Object>} JSON response object { thought, answer, references }
 */
export async function generateAIResponse(userQuery, searchResults, fileData = null, aiId = 'baobao') {
    try {
        // Build context from search results
        let context = '';

        if (searchResults && searchResults.length > 0) {
            context = '\n\n**📚 ข้อมูลจากคลังเอกสาร (ใช้ข้อมูลนี้ก่อนเสมอ):**\n\n';
            searchResults.forEach((result, index) => {
                context += `## เอกสารที่ ${index + 1}: ${result.file} \n`;
                context += `${result.content} \n\n`;
            });
        }

        // Add file data if provided
        if (fileData) {
            context += '\n\n**📎 ไฟล์ที่แนบมา:**\n\n';
            context += `ชื่อไฟล์: ${fileData.name} \n`;
            context += `ประเภท: ${fileData.mimeType} \n`;
            if (fileData.textContent) {
                context += `\nเนื้อหา: \n${fileData.textContent} \n`;
            }
        }

        // Get the appropriate system prompt for the selected AI
        const systemPrompt = getSystemPrompt(aiId);

        // Build the full prompt
        const fullPrompt = `${systemPrompt}${context} \n\n ** คำถามจากผู้ใช้:**\n${userQuery} `;

        // Config for Structured Outputs
        const config = {
            tools: [
                { googleSearch: {} },
                {
                    functionDeclarations: [{
                        name: 'searchAxioIcons',
                        description: 'Search for icons in the AXIO Design System documentation. Use this to find icon names and URLs.',
                        parameters: {
                            type: 'OBJECT',
                            properties: {
                                query: {
                                    type: 'STRING',
                                    description: 'The search query for the icon (e.g., "pig", "arrow", "delete")'
                                }
                            },
                            required: ['query']
                        }
                    }]
                }
            ],
            responseMimeType: "application/json",
            responseJsonSchema: zodToJsonSchema(chatResponseSchema),
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
        };

        const model = 'gemini-3-pro-preview';

        const parts = [
            { text: fullPrompt },
        ];

        if (fileData) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.data,
                },
            });
        }

        const contents = [
            {
                role: 'user',
                parts: parts,
            },
        ];

        // Use generateContent (non-streaming) to ensure valid JSON parsing
        const response = await ai.models.generateContent({
            model,
            config,
            contents
        });

        // Parse the JSON response
        // Note: In @google/genai SDK, response.text might be a property or we need to access candidates
        console.log('Gemini Response:', JSON.stringify(response, null, 2));

        let responseText = '';
        if (typeof response.text === 'function') {
            responseText = response.text();
        } else if (response.text) {
            responseText = response.text;
        } else if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts && response.candidates[0].content.parts[0].text) {
            responseText = response.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Unexpected response format from Gemini');
        }

        const jsonResponse = JSON.parse(responseText);

        // Validate with Zod (optional but good practice)
        const parsedData = chatResponseSchema.parse(jsonResponse);

        return parsedData;

    } catch (error) {
        console.error('Gemini API Error:', error);
        throw error;
    }
}

/**
 * Generate response using Gemini with Streaming
 * @param {string} userQuery - User's question
 * @param {Array} searchResults - Results from knowledge base search
 * @param {Object} fileData - Optional file data
 * @param {Object} location - Optional location data { lat, lng }
 * @returns {AsyncGenerator<string>} Stream of text chunks
 */
export async function* generateAIResponseStream(userQuery, searchResults, fileData = null, location = null, aiId = 'baobao', history = []) {
    try {
        // Build context
        // Build context
        let context = '';
        if (searchResults && searchResults.length > 0) {
            context = '\n\n**📚 ข้อมูลจากคลังเอกสาร (ใช้ข้อมูลนี้ก่อนเสมอ):**\n\n';

            // For FlowFlow, we want to include more documents and excerpts because we load the entire knowledge base (chunked)
            // For others, we stick to the top search results
            const maxDocs = aiId === 'flowflow' ? 20 : 3;
            const maxExcerpts = aiId === 'flowflow' ? 10 : 2;

            searchResults.slice(0, maxDocs).forEach((result) => {
                context += `### ${result.category}\n`;
                if (result.excerpts && result.excerpts.length > 0) {
                    result.excerpts.slice(0, maxExcerpts).forEach(excerpt => {
                        context += `${excerpt}\n\n`;
                    });
                }
            });
            context += `\n**หมายเหตุ:** ให้ตอบจากข้อมูลข้างต้นก่อนเสมอ ถ้าข้อมูลไม่เพียงพอจริงๆ ถึงจะค้นหาเพิ่มจาก Google\n`;
        } else {
            context = '\n\n**ไม่พบข้อมูลในคลังเอกสาร - สามารถค้นหาข้อมูลจาก Google ได้**\n\n';
        }

        // Add location context if available
        let locationContext = '';
        if (location) {
            locationContext = `\n\n**📍 ตำแหน่งปัจจุบันของผู้ใช้:** ละติจูด ${location.lat}, ลองจิจูด ${location.lng}\n(ใช้ข้อมูลนี้เพื่อตอบคำถามเกี่ยวกับสถานที่ สภาพอากาศ หรือบริการใกล้เคียง)`;
        }

        // Get the appropriate system prompt for the selected AI
        const systemPrompt = getSystemPrompt(aiId);

        // Streaming instructions
        const streamingInstructions = `
**คำสั่งสำคัญสำหรับการตอบสนองที่รวดเร็วที่สุด (Critical Priority):**
1. **เริ่มส่งข้อมูลทันที (Instant Stream):** ห้ามหยุดรอประมวลผล ห้ามคิดนาน
2. **กระบวนการคิด (Thinking Block) - ต้องอยู่ลำดับแรกสุด:**
   > **กระบวนการคิด:**
   > [วิเคราะห์สั้นๆ 1-2 ประโยค]
   
   **สำคัญมาก: กระบวนการคิดต้องอยู่ก่อนคำตอบเสมอ ห้ามใส่ไว้ท้าย**

3. **รูปแบบการตอบ (Response Format):**
   ต้องตอบตามโครงสร้างนี้เท่านั้น ตามลำดับ:

   1) กระบวนการคิด (Blockquote ก่อนเสมอ)
   2) จากนั้นคำตอบหลัก:

   ## [หัวข้อหลัก (Summarized Topic)]
   [เนื้อหาหลัก อธิบายบริบท]

   ### [หัวข้อย่อย]
   * [ประเด็นสำคัญ 1]
   * [ประเด็นสำคัญ 2]

   [คำตอบส่วนที่เหลือ]

4. **การใช้เครื่องมือ:** ห้ามใช้ Google Search หรือ Tools อื่นๆ หากคำตอบมีอยู่ใน Context หรือเป็นความรู้ทั่วไป เพื่อความรวดเร็ว

5. **Minimal Design Style (บังคับใช้):**
   - **Inline Code:** ใช้ Single Backticks (\` \`) สำหรับชื่อตัวแปร, Token, Hex Code, และค่าสั้นๆ เสมอ (ห้ามใช้ Code Block ใหญ่)
   - **Example:**
     - Background: \`main/surface/primary #F5FAFE\`
     - Text: \`main/base/dark #344054\`

**IMPORTANT: Markdown Table Formatting Rules**
If you generate a table, you MUST follow these strict rules to ensure it renders correctly:
1. **Empty Line Before Table:** Always leave at least one empty line before the table starts.
2. **Correct Syntax:**
   | Header 1 | Header 2 |
   |---|---|
   | Cell 1 | Cell 2 |
3. **No Indentation:** Do not indent the table unless it is strictly necessary for nesting.
4. **Newlines:** Ensure each row is on a new line.`;

        // Combine system prompt and streaming instructions
        const fullSystemInstruction = `${systemPrompt}\n${streamingInstructions}`;

        // Special handling for FlowFlow Batch Processing - REMOVED
        // We now use full context with Gemini 2.5 Flash, so no batching is needed.
        let processedContext = context;
        /* 
        if (aiId === 'flowflow' && searchResults && searchResults.length > 20) {
             // ... old batch logic removed ...
        }
        */

        // Construct the current user message with context
        const currentMessageText = `${processedContext}
${locationContext}

**คำถามจากผู้ใช้:** ${userQuery}`;

        // Special handling for FlowFlow: Use new @google/genai SDK with Gemini 2.0 Flash
        if (aiId === 'flowflow') {
            console.log('🌊 FlowFlow: Using gemini-2.0-flash-exp with new SDK (Full Context Mode)');

            // 1. Check for Image Generation Intent
            const imageKeywords = ['generate image', 'draw', 'create image', 'วาดรูป', 'สร้างรูป', 'gen รูป', 'เจนรูป', 'edit image', 'แก้รูป', 'เพิ่ม', 'ลบ', 'เปลี่ยน', 'logo', 'icon', 'image', 'picture', 'photo', 'background', 'bg', 'color', 'style', 'ภาพ', 'รูป', 'สี', 'พื้นหลัง', 'โลโก้', 'ไอคอน'];
            const isImageRequest = imageKeywords.some(keyword => userQuery.toLowerCase().includes(keyword));

            if (isImageRequest) {
                console.log('🎨 FlowFlow: Image generation request detected (Gemini 3 Pro).');

                // 1. Reconstruct Chat History and Find Last Image
                // We need to rebuild the history. 
                // CRITICAL CHANGE: We do NOT add images to the 'model' history parts because we lack the 'thought_signature' 
                // required by Gemini 3 Pro for model-generated images.
                // Instead, we find the *last* generated image and attach it to the *current* user message as input.
                // const chatHistory = []; // We will NOT send history to the model to avoid signature errors
                let lastGeneratedImagePart = null;

                for (const msg of history) {
                    const role = msg.role === 'user' ? 'user' : 'model';
                    let contentText = msg.content || (msg.parts && msg.parts[0] ? msg.parts[0].text : '');

                    // Check for image markdown in model responses
                    const imageMatch = contentText.match(/\!\[.*?\]\((\/generated-images\/.*?)\)/);

                    if (imageMatch && role === 'model') {
                        // Found an image in model history. 
                        const imagePath = imageMatch[1];
                        const filename = imagePath.split('/').pop();
                        const fs = await import('fs/promises');
                        const path = await import('path');
                        const fullPath = path.join(process.cwd(), 'public/generated-images', filename);

                        try {
                            const imageBuffer = await fs.readFile(fullPath);
                            console.log(`🎨 Found previous image context: ${filename}`);
                            // Update the last found image (so we get the most recent one)
                            lastGeneratedImagePart = {
                                inlineData: {
                                    mimeType: "image/png",
                                    data: imageBuffer.toString('base64')
                                }
                            };
                        } catch (e) {
                            console.warn(`⚠️ Failed to load history image ${filename}:`, e.message);
                        }
                    }
                }

                // 2. Create Chat Session with EMPTY history
                // We intentionally do not send history to avoid "missing thought_signature" errors.
                // The context is provided via the attached image.
                const chat = ai.chats.create({
                    model: "gemini-3-pro-image-preview",
                    config: {
                        responseModalities: ['TEXT', 'IMAGE'],
                        tools: [{ googleSearch: {} }],
                    },
                    history: [] // Empty history
                });

                // 3. Prepare Current Message
                // If we found a previous image, attach it to the user's current request
                const currentMessageParts = [];

                if (lastGeneratedImagePart) {
                    console.log('🎨 Attaching previous image to current request for editing...');
                    currentMessageParts.push(lastGeneratedImagePart);

                    // Wrap the user query with explicit editing instructions
                    const editingPrompt = `
[REFERENCE IMAGE ATTACHED]
INSTRUCTION: Edit the attached image based on the following request: "${userQuery}"

CRITICAL RULES:
1. Keep the original composition, layout, and style exactly as they are.
2. Only modify the specific parts mentioned in the instruction.
3. Do not generate a completely new scene.
4. If the request is to add an element, integrate it naturally into the existing scene.
`;
                    currentMessageParts.push({ text: editingPrompt });
                } else {
                    // New image generation
                    currentMessageParts.push({ text: userQuery });
                }

                // 4. Send Message
                console.log('🎨 FlowFlow: Sending request to Gemini 3 Pro...');
                try {
                    const response = await chat.sendMessage({
                        message: {
                            role: 'user',
                            parts: currentMessageParts
                        },
                        config: {
                            responseModalities: ['TEXT', 'IMAGE'],
                            imageConfig: {
                                aspectRatio: "16:9",
                                imageSize: "4K",
                            },
                            tools: [{ googleSearch: {} }],
                        }
                    });

                    // 4. Handle Response (Stream manually to client)
                    const parts = response.candidates && response.candidates[0] && response.candidates[0].content ? response.candidates[0].content.parts : [];

                    for (const part of parts) {
                        if (part.thought) {
                            // Handle Thinking Process
                            if (part.text) {
                                console.log('🧠 Gemini 3 Pro Thought:', part.text);
                                yield `> **Thinking Process:**\n${part.text}\n\n`;
                            }
                            // We might want to skip interim images or show them. 
                            // For now, let's skip interim images to avoid clutter, 
                            // unless the user specifically requested to see them.
                            // The final image will appear outside the thought block (or be the last one).
                            if (part.inlineData) {
                                console.log('🧠 Gemini 3 Pro Interim Image (Skipping)');
                            }
                        } else {
                            // Final Response
                            if (part.text) {
                                yield part.text;
                            } else if (part.inlineData) {
                                console.log('🎨 Received Final Image Data from Gemini 3 Pro');
                                const imageData = part.inlineData.data;
                                const buffer = Buffer.from(imageData, "base64");

                                // Save Image
                                const fs = await import('fs/promises');
                                const path = await import('path');
                                const crypto = await import('crypto');
                                const filename = `img_${crypto.randomUUID()}.png`;
                                const filepath = path.join(process.cwd(), 'public/generated-images', filename);

                                await fs.writeFile(filepath, buffer);
                                console.log(`✅ Image saved to ${filepath}`);

                                // Yield Image Markdown
                                yield `\n\n![Generated Image](/generated-images/${filename})\n\n`;
                            }
                        }
                    }
                } catch (err) {
                    console.error('❌ Gemini 3 Pro Image Gen Error:', err);
                    yield `ขออภัยครับ เกิดข้อผิดพลาดในการสร้างรูปภาพ: ${err.message}`;
                }
                return; // Exit after image generation
            }

            // 2. Text Generation with Full Context (New SDK)
            // Note: We use the global 'ai' instance initialized at the top of the file
            // const ai = new GoogleGenAI({ apiKey: config.geminiApiKey }); // REMOVED to avoid shadowing/TDZ error

            // VECTOR SEARCH: Retrieve relevant context from Supabase
            console.log('🔍 FlowFlow: Generating embedding for query...');
            let fullContext = '';

            try {
                // 1. Generate Embedding
                const embeddingResult = await ai.models.embedContent({
                    model: "text-embedding-004",
                    contents: [{ parts: [{ text: userQuery }] }]
                });
                const queryEmbedding = embeddingResult.embeddings[0].values;

                // 2. Search Supabase with timeout
                console.log('🔍 FlowFlow: Searching Supabase vector store...');

                // Create a timeout promise
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Vector search timeout')), 8000)
                );

                // Race between query and timeout
                const { data: documents, error } = await Promise.race([
                    supabase.rpc('match_documents', {
                        query_embedding: queryEmbedding,
                        match_threshold: 0.4,
                        match_count: 10
                    }),
                    timeoutPromise
                ]);

                if (error) throw error;

                console.log(`📚 FlowFlow: Found ${documents?.length || 0} relevant chunks.`);

                // 3. Construct Context
                if (documents && documents.length > 0) {
                    fullContext = documents.map(doc => `${doc.content}`).join('\n\n');
                } else {
                    console.log('⚠️ FlowFlow: No relevant documents found in Supabase.');
                    fullContext = "ไม่พบข้อมูลในคลังเอกสาร - ให้ใช้ความรู้ทั่วไปเกี่ยวกับ AXIO Design System ตอบ";
                }

            } catch (err) {
                console.error('❌ FlowFlow Vector Search Error:', err.message || err);
                fullContext = "ไม่สามารถค้นหาในคลังเอกสารได้ - ให้ใช้ความรู้ทั่วไปเกี่ยวกับ AXIO Design System ตอบ";
            }

            console.log(`📚 FlowFlow: Sending context (${fullContext.length} chars) to Gemini...`);

            const systemInstruction = `
            You are FlowFlow (โฟลว์โฟลว์), an expert AI assistant for the AXIO Design System.
            
            **Your Goal:** Answer the user's question accurately based *only* on the provided context.
            
            **Context:**
            ${fullContext}
            
            **Instructions:**
            1. **Search Deeply:** Look through ALL provided files to find the answer.
            2. **Extract Links:** If the user asks for links (Figma, etc.), extract them EXACTLY as they appear in the files.
            3. **Be Helpful:** If the answer isn't explicitly in the files, use your general knowledge but mention that it's not in the docs.
            4. **Tone:** Friendly, professional, and helpful (Thai language).
            `;

            const aiConfig = {
                // thinkingConfig removed as it may cause 400 errors on gemini-2.5-flash
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                ],
            };

            // Convert history to Gemini format
            const historyContents = history.map(msg => {
                // Skip tool messages or handle them if needed (simplifying to text for now)
                if (msg.role === 'tool') return null;
                // Ensure content is a string
                const text = msg.content || (msg.tool_calls ? "Tool Call" : "");
                return {
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: text }]
                };
            }).filter(item => item !== null);

            // Add current query and file attachment
            const currentParts = [{ text: userQuery }];
            if (fileData) {
                console.log('📎 FlowFlow: Attaching image/file to Gemini request:', fileData.mimeType);
                currentParts.push({
                    inlineData: {
                        mimeType: fileData.mimeType,
                        data: fileData.data
                    }
                });
            }

            historyContents.push({
                role: 'user',
                parts: currentParts
            });

            try {
                // Use ai.models.generateContentStream for the new @google/genai SDK
                const response = await ai.models.generateContentStream({
                    model: 'gemini-2.0-flash-exp',
                    config: aiConfig,
                    contents: historyContents,
                    systemInstruction: {
                        parts: [{ text: systemInstruction }]
                    }
                });

                for await (const chunk of response) {
                    if (chunk.text) {
                        yield chunk.text;
                    }
                }
            } catch (error) {
                console.error('❌ FlowFlow Gemini Error:', error);
                yield `ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ Gemini: ${error.message}`;
            }
            return; // End FlowFlow processing
        }

        // Get MCP tools
        const mcpTools = await mcpManager.getTools();
        const geminiTools = mcpManager.getGeminiTools(mcpTools);


        // Select model
        // Default to Gemini 3 Pro Preview as requested
        let modelName = 'gemini-3-pro-preview';

        // Special handling for FlowFlow (Image Generation Fallback)
        if (aiId === 'flowflow') {
            console.log('🌊 FlowFlow using gemini-2.0-flash-exp for IMAGE GENERATION fallback.');
            modelName = 'gemini-2.0-flash-exp';
        }

        // Prepare tools configuration
        const toolsConfig = [];

        // Google Search tool
        // DISABLED: Causes 400 error on Gemini 2.0 Flash for FlowFlow
        // if (modelName !== 'gemini-3-pro-preview') {
        //      toolsConfig.push({ googleSearch: {} });
        // }

        // Add local tools
        const localTools = [{
            name: 'searchAxioIcons',
            description: 'Search for icons in the AXIO Design System documentation. Use this to find icon names and URLs.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    query: {
                        type: 'STRING',
                        description: 'The search query for the icon (e.g., "pig", "arrow", "delete")'
                    }
                },
                required: ['query']
            }
        }];

        // Enable both MCP tools (Figma) AND local tools (searchAxioIcons)
        // Note: Google Search is disabled as it causes 400 errors
        if (geminiTools.length > 0) {
            toolsConfig.push({ functionDeclarations: [...geminiTools, ...localTools] });
        } else {
            toolsConfig.push({ functionDeclarations: localTools });
        }

        // Prepare contents with history
        let currentHistory = [...history];

        // Prepare current message parts
        const parts = [{ text: currentMessageText }];

        if (fileData) {
            console.log('📎 File attachment detected:', fileData.mimeType);
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.data,
                },
            });
        }

        currentHistory.push({ role: 'user', parts: parts });

        // Multi-turn loop for tool use
        let keepGoing = true;
        let turnCount = 0;
        const MAX_TURNS = 5;

        while (keepGoing && turnCount < MAX_TURNS) {
            turnCount++;

            console.log(`🤖 Requesting Gemini stream from model: ${modelName}`);

            // DEBUG: Log the history being sent
            if (turnCount > 1) {
                console.log('📝 Sending History to Gemini:', JSON.stringify(currentHistory, null, 2));
            }

            const result = await ai.models.generateContentStream({
                model: modelName,
                config: {
                    systemInstruction: {
                        parts: [{ text: fullSystemInstruction }]
                    },
                    // Re-enable tools for FlowFlow (currently only Google Search)
                    ...(modelName !== 'gemini-3-pro-preview' || aiId === 'flowflow' ? { tools: toolsConfig } : {}),
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                    ],
                },
                contents: currentHistory
            });

            console.log('🤖 Stream connection established. Iterating...');

            // Handle stream iteration
            const streamIterable = result.stream || result;

            let functionCalls = [];
            let thoughtSignature = null; // For Gemini 3 Pro Preview
            let fullTextResponse = '';

            for await (const chunk of streamIterable) {
                console.log('📦 Received chunk');
                let chunkText = '';

                // Check for function calls in candidates
                if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
                    console.log('📦 Chunk parts:', JSON.stringify(chunk.candidates[0].content.parts, null, 2));
                    for (const part of chunk.candidates[0].content.parts) {
                        if (part.functionCall) {
                            console.log('🔍 Inspecting part with functionCall:', JSON.stringify(part, null, 2));
                            functionCalls.push(part.functionCall);

                            // For Gemini 3 Pro Preview: capture thoughtSignature
                            if (part.thoughtSignature) {
                                thoughtSignature = part.thoughtSignature;
                                console.log('🧠 Captured thoughtSignature for Gemini 3');
                            }
                        }
                        if (part.text) {
                            chunkText += part.text;
                        }
                    }
                } else if (typeof chunk.text === 'function') {
                    try {
                        chunkText = chunk.text();
                    } catch (e) {
                        // Ignore safety blocks
                    }
                }

                if (chunkText) {
                    fullTextResponse += chunkText;
                    yield chunkText;
                }
            }

            // If we have function calls, execute them and continue the loop
            if (functionCalls.length > 0) {
                console.log(`🛠️ Processing ${functionCalls.length} function calls...`);

                // 1. Add model's turn to history (Text + All Function Calls)
                const modelParts = [];
                if (fullTextResponse) {
                    modelParts.push({ text: fullTextResponse });
                }

                for (const fc of functionCalls) {
                    const fcPart = { functionCall: fc };
                    if (thoughtSignature) {
                        fcPart.thoughtSignature = thoughtSignature;
                    }
                    modelParts.push(fcPart);
                }

                currentHistory.push({
                    role: 'model',
                    parts: modelParts
                });

                // 2. Execute tools and collect responses
                const toolResponseParts = [];

                for (const functionCall of functionCalls) {
                    try {
                        let toolResult;
                        if (functionCall.name === 'searchAxioIcons') {
                            console.log(`🔍 Searching AXIO icons for: "${functionCall.args.query}"`);
                            const icons = await searchAxioIcons(functionCall.args.query);
                            toolResult = JSON.stringify(icons);
                        } else {
                            toolResult = await mcpManager.callTool(functionCall.name, functionCall.args);
                        }

                        let parsedResult = toolResult;
                        try {
                            if (typeof toolResult === 'string' && (toolResult.trim().startsWith('{') || toolResult.trim().startsWith('['))) {
                                parsedResult = JSON.parse(toolResult);
                            }
                        } catch (e) {
                            console.warn('Failed to parse tool result as JSON, using string:', e);
                        }

                        // Ensure response is an object
                        let finalResponse = parsedResult;
                        if (Array.isArray(parsedResult)) {
                            finalResponse = { result: parsedResult };
                        } else if (typeof parsedResult !== 'object' || parsedResult === null) {
                            finalResponse = { result: parsedResult };
                        }

                        toolResponseParts.push({
                            functionResponse: {
                                name: functionCall.name,
                                response: finalResponse
                            }
                        });

                    } catch (error) {
                        console.error(`Error executing tool ${functionCall.name}:`, error);
                        toolResponseParts.push({
                            functionResponse: {
                                name: functionCall.name,
                                response: { content: `Error: ${error.message}` }
                            }
                        });
                    }
                }

                // 3. Add tool responses to history
                currentHistory.push({
                    role: 'tool',
                    parts: toolResponseParts
                });

                // Loop continues to generate response based on tool results
            } else {
                // No function call, we are done
                keepGoing = false;
            }
        }

    } catch (error) {
        console.error('Gemini Streaming Error:', error);
        throw error;
    }
}

/**
 * Generate simple response without streaming (for testing)
 * @param {string} userQuery - User's question
 * @param {Array} searchResults - Results from knowledge base search
 * @returns {Promise<string>} Response text
 */
export async function generateBaoBaoResponseSimple(userQuery, searchResults) {
    try {
        // Build context
        let context = '';
        if (searchResults && searchResults.length > 0) {
            context = '\n\n**ข้อมูลจากคลังเอกสาร:**\n\n';
            searchResults.slice(0, 3).forEach((result) => {
                context += `### หมวดหมู่: ${result.category} \n`;
                if (result.excerpts && result.excerpts.length > 0) {
                    result.excerpts.slice(0, 2).forEach(excerpt => {
                        context += `${excerpt} \n\n`;
                    });
                }
            });
        }

        const fullPrompt = `${BAOBAO_SYSTEM_PROMPT} \n\n${context} \n\n ** คำถามจากผู้ใช้:** ${userQuery} `;

        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: fullPrompt,
        });

        return response.text;
    } catch (error) {
        console.error('Gemini API Error:', error);
        throw error;
    }
}

/**
 * Translate text to Thai using a fast model
 * @param {string} text - Text to translate
 * @returns {Promise<string>} Translated text
 */
export async function translateToThai(text) {
    try {
        if (!text || !text.trim()) return '';

        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: `Translate the following text to Thai.Maintain the original tone and formatting(markdown, bullet points).Only output the translation.\n\nText: \n${text} `,
        });

        return response.text;
    } catch (error) {
        console.error('Translation Error:', error);
        return text; // Fallback to original text
    }
}

/**
 * Generate Tip of the Day
 * Uses direct API call to avoid authentication issues
 * @param {string} promptText - The full prompt to send to the model
 * @param {string} category - Document category (optional, for logging)
 * @param {string} aiId - AI ID for fallback messages
 * @returns {Promise<string>} Generated tip
 */
export async function generateTipOfTheDay(promptText, category, aiId = 'baobao') {
    try {
        // Use direct API call instead of SDK
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${config.geminiApiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: promptText
                        }]
                    }]
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error('API Error Response:', JSON.stringify(errorData, null, 2));
            throw new Error(`API responded with status ${response.status}: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const tipText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        const fallbackTips = {
            baobao: 'ยินดีต้อนรับสู่ BaoBao AI! พร้อมช่วยเหลือคุณเรื่อง UX writing แล้ว 🐕',
            deedee: 'ยินดีต้อนรับค่ะ! DeeDee พร้อมช่วยวิเคราะห์ข้อมูลและออกแบบ Google Analytics แล้ว 🦌',
            pungpung: 'ยินดีต้อนรับครับ! PungPung พร้อมช่วยวิเคราะห์ Feedback และ UX Analysis แล้ว 🦉',
            flowflow: 'ยินดีต้อนรับครับ! FlowFlow พร้อมช่วยออกแบบ Workflow แล้ว 🌊'
        };

        return tipText || fallbackTips[aiId] || fallbackTips.baobao;
    } catch (error) {
        console.error('Tip Generation Error:', error);
        const fallbackTips = {
            baobao: 'ยินดีต้อนรับสู่ BaoBao AI! พร้อมช่วยเหลือคุณเรื่อง UX writing แล้ว 🐕',
            deedee: 'ยินดีต้อนรับค่ะ! DeeDee พร้อมช่วยวิเคราะห์ข้อมูลและออกแบบ Google Analytics แล้ว 🦌',
            pungpung: 'ยินดีต้อนรับครับ! PungPung พร้อมช่วยวิเคราะห์ Feedback และ UX Analysis แล้ว 🦉',
            flowflow: 'ยินดีต้อนรับครับ! FlowFlow พร้อมช่วยออกแบบ Workflow แล้ว 🌊'
        };
        return fallbackTips[aiId] || fallbackTips.baobao;
    }
}
