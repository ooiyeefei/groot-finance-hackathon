#!/bin/bash

# Activate Python virtual environment for Trigger.dev development
# Usage: source ./activate-python.sh

if [ -d ".venv" ]; then
    echo "🐍 Activating Python virtual environment..."
    source .venv/bin/activate
    echo "✅ Python virtual environment activated!"
    echo "   Python version: $(python --version)"
    echo "   Virtual environment path: $(which python)"
    echo ""
    echo "📦 Available packages:"
    echo "   - numpy, requests, Pillow"
    echo "   - pdf2image (for PDF processing)"
    echo "   - dspy-ai (for structured LLM programming)"
    echo "   - google-generativeai (for Gemini integration)"
    echo ""
    echo "🚀 You can now run Trigger.dev tasks that use Python scripts!"
    echo "   To deactivate: deactivate"
else
    echo "❌ Virtual environment not found. Please run:"
    echo "   python3 -m venv .venv"
    echo "   source .venv/bin/activate"
    echo "   pip install -r requirements.txt"
fi