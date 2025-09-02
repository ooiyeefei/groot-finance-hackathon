#!/usr/bin/env python3
"""
Test Existing RAG API Endpoints
Tests the actual internal APIs that exist
"""

import os
import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv

# Load environment
project_root = Path(__file__).resolve().parent.parent.parent.parent
env_path = project_root / '.env.local'
load_dotenv(env_path)

async def test_existing_apis():
    """Test the existing internal APIs with proper authentication"""
    
    print("🔧 Testing Existing Internal APIs")
    print("=" * 40)
    
    # Check for required environment variables
    internal_key = os.getenv('INTERNAL_SERVICE_KEY')
    
    if not internal_key:
        print("❌ Missing INTERNAL_SERVICE_KEY in .env.local")
        print("💡 Add: INTERNAL_SERVICE_KEY=your_secret_key")
        return
    
    print(f"✅ Found INTERNAL_SERVICE_KEY: {internal_key[:8]}...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # Test 1: Search Regulatory API
        print(f"\n🔍 Testing /api/internal/search-regulatory")
        print("-" * 40)
        
        try:
            response = await client.post(
                'http://localhost:3000/api/internal/search-regulatory',
                headers={
                    'Authorization': f'Bearer {internal_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'query': 'Singapore GST registration requirements',
                    'collection': 'regulatory_kb',
                    'limit': 3,
                    'score_threshold': 0.6
                }
            )
            
            print(f"📊 Response: HTTP {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                data = result.get('data', [])
                
                print(f"✅ Found {len(data)} results")
                
                for i, item in enumerate(data[:2], 1):
                    metadata = item.get('metadata', {})
                    country = metadata.get('country', 'N/A')
                    text = item.get('text', 'N/A')[:100] + '...'
                    
                    print(f"  {i}. [{country}] {text}")
                    
            else:
                print(f"❌ Error: {response.text[:200]}")
                
        except Exception as e:
            print(f"❌ Search API test failed: {e}")
        
        # Test 2: Embed Chunk API
        print(f"\n📊 Testing /api/internal/embed-chunk")
        print("-" * 40)
        
        try:
            test_chunk = {
                "text": "Test regulatory text about GST requirements",
                "chunk_id": "test_chunk_001",
                "source_metadata": {
                    "country": "singapore",
                    "tax_type": "GST"
                }
            }
            
            response = await client.post(
                'http://localhost:3000/api/internal/embed-chunk',
                headers={
                    'Authorization': f'Bearer {internal_key}',
                    'Content-Type': 'application/json'
                },
                json=test_chunk
            )
            
            print(f"📊 Response: HTTP {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Embedding success: {result.get('message', 'OK')}")
            else:
                print(f"❌ Error: {response.text[:200]}")
                
        except Exception as e:
            print(f"❌ Embed API test failed: {e}")
    
    print(f"\n✅ API testing completed!")

async def test_cross_border_tool():
    """Test the CrossBorderTaxComplianceTool directly"""
    
    print(f"\n🧠 Testing CrossBorderTaxComplianceTool Integration") 
    print("=" * 50)
    
    # Sample transaction for testing
    test_transaction = {
        "transaction_type": "expense",
        "amount": 15000,
        "original_currency": "SGD",
        "home_currency": "USD", 
        "description": "Software subscription from Singapore vendor",
        "category": "Software & Technology"
    }
    
    print(f"💰 Test Transaction:")
    print(f"  Amount: {test_transaction['amount']} {test_transaction['original_currency']} → {test_transaction['home_currency']}")
    print(f"  Type: {test_transaction['transaction_type']}")
    print(f"  Description: {test_transaction['description']}")
    
    # Since we can't directly test the tool without creating a new API endpoint,
    # let's verify it exists in the codebase
    
    tool_path = project_root / 'src' / 'lib' / 'tools' / 'cross-border-tax-compliance-tool.ts'
    
    if tool_path.exists():
        print(f"✅ CrossBorderTaxComplianceTool found at: {tool_path}")
        
        # Read a snippet to verify RAG integration
        with open(tool_path, 'r') as f:
            content = f.read()
            
        if 'searchRegulatoryKnowledgeBase' in content:
            print(f"✅ RAG integration confirmed: searchRegulatoryKnowledgeBase method found")
        else:
            print(f"⚠️  RAG integration not found in tool")
            
        if '/api/internal/search-regulatory' in content:
            print(f"✅ Internal API integration confirmed")
        else:
            print(f"⚠️  Internal API integration not found")
            
    else:
        print(f"❌ CrossBorderTaxComplianceTool not found")
    
    print(f"\n💡 To test full compliance analysis, create transaction via UI or API")

if __name__ == "__main__":
    async def main():
        await test_existing_apis()
        await test_cross_border_tool()
    
    asyncio.run(main())