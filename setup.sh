#!/bin/bash

# BaoBao Setup Script
echo "🐕 Setting up BaoBao..."

# Check if .env file exists
if [ -f .env ]; then
    echo "✅ .env file already exists"
else
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and add your Gemini API key!"
    echo "   Get your key from: https://aistudio.google.com/app/apikey"
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file and add your GEMINI_API_KEY"
echo "2. Run 'npm start' to launch BaoBao"
echo ""
echo "🐕 เบาเบาพร้อมช่วยแล้วครับ!"
