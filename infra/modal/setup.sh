#!/bin/bash
# Modal.com Qwen3 Setup Script for Groot Finance
#
# Prerequisites:
# - Modal account with $220 credits
# - Python 3.11+

set -e

echo "🚀 Groot Finance Modal.com Setup"
echo "============================"

# Check if modal is installed
if ! command -v modal &> /dev/null; then
    echo "📦 Installing Modal CLI..."
    pip install modal
fi

# Check if logged in
if ! modal token show &> /dev/null; then
    echo "🔐 Please login to Modal..."
    modal setup
fi

echo "✅ Modal CLI ready"

# Create volume for model cache
echo "📁 Creating model cache volume..."
modal volume create finanseal-model-cache 2>/dev/null || echo "   Volume already exists"

# Deploy the service
echo "🚀 Deploying Qwen3 service..."
modal deploy infra/modal/qwen3_service.py

# Get the endpoint URL
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Get your endpoint URL:"
echo "   modal app list"
echo ""
echo "2. Update your .env.local:"
echo "   CHAT_MODEL_ENDPOINT_URL=https://YOUR_USERNAME--finanseal-qwen3-openai-api.modal.run/v1"
echo "   CHAT_MODEL_MODEL_ID=qwen3-30b"
echo "   USE_GEMINI=false"
echo ""
echo "3. Test the deployment:"
echo "   modal run infra/modal/qwen3_service.py"
echo ""
echo "4. Monitor costs at: https://modal.com/settings/billing"
echo ""
echo "💰 Cost estimate: ~\$20-30/month for 100 requests/day"
