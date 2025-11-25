# 🐕 BaoBao - AXONS UX Writing Expert

BaoBao is an AI assistant specialized in UX writing for the AXONS team, powered by Google Gemini.

## Features

- 🧠 **Gemini AI Integration**: Real-time AI responses (no templates!)
- 📚 **Knowledge Base**: Searches through UX writing guidelines
- 🇹🇭 **Thai Language**: Responds entirely in Thai with BaoBao's personality
- ⚡ **Streaming Responses**: Fast, real-time streaming like ChatGPT
- 🎯 **UX Expertise**: Guidelines for empty states, error messages, inclusive language, and more

## Setup

### 1. Get Your Gemini API Key

Get a free API key from Google AI Studio:
👉 https://aistudio.google.com/app/apikey

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your API key
# GEMINI_API_KEY=your_actual_api_key_here
```

Or use the setup script:
```bash
chmod +x setup.sh
./setup.sh
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run BaoBao

```bash
# Start both frontend and backend
npm start
```

This will start:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Usage

Open http://localhost:5173 in your browser and start chatting with BaoBao!

**Example questions (in Thai):**
- "เขียน empty state ยังไงดี?"
- "ควรใช้คำว่าอะไรเรื่อง gender?"
- "loading state เขียนอย่างไร?"
- "error message ควรเป็นยังไง?"

## Knowledge Base

BaoBao searches through these categories:
- Empty States
- Error Pages
- Loading States
- Placeholders
- Tooltips
- Inclusive Language (Gender, Disability, Medical, Races)

All documents are located in `/documents/baobao/`

## API Endpoints

- `POST /api/chat` - Stream chat responses (SSE)
- `POST /api/search` - Search knowledge base
- `GET /api/documents` - List all documents
- `GET /health` - Health check

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Express.js + Node.js
- **AI**: Google Gemini 2.0 Flash
- **Language**: Thai (ภาษาไทย)

## Character

BaoBao (เบาเบา) is a cute Shih Tzu dog who:
- 🐕 Has a cheerful, friendly personality
- 😊 Always thinks positively
- ✨ Uses emojis naturally
- 🇹🇭 Speaks Thai and ends with "ครับ"
- 📝 Is an expert in UX writing

---

Made with ❤️ for AXONS team
