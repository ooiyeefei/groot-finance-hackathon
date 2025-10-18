#!/bin/bash

# Setup Python virtual environment for Trigger.dev
# This script ensures consistent Python environment setup

set -e  # Exit on any error

echo "🐍 Setting up Python virtual environment for Trigger.dev..."

# Check if Python3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed. Please install Python 3.7+ first."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "📁 Creating virtual environment..."
    python3 -m venv .venv
else
    echo "✅ Virtual environment already exists"
fi

# Activate virtual environment and install/update packages
echo "📦 Installing Python dependencies..."
source .venv/bin/activate

# Upgrade pip to latest version
pip install --upgrade pip

# Install requirements
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
    echo "✅ Python dependencies installed successfully"
else
    echo "⚠️  Warning: requirements.txt not found"
fi

# Verify key packages
echo "🔍 Verifying key packages..."
python -c "import numpy, requests, PIL; print('✅ Core packages verified')" || echo "⚠️  Some packages may be missing"

echo "🎉 Python setup complete!"