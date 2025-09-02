#!/usr/bin/env python3
"""
Simple RAG Retrieval Test
Quick test to verify if the knowledge base has data and retrieval works
"""

import os
import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv
from qdrant_client import QdrantClient

# Load environment
project_root = Path(__file__).resolve().parent.parent.parent.parent
env_path = project_root / '.env.local'
load_dotenv(env_path)

async def simple_test():
    """Simple test to check if retrieval works"""
    
    # Environment check
    qdrant_url = os.getenv('QDRANT_URL')
    qdrant_api_key = os.getenv('QDRANT_API_KEY')
    
    if not qdrant_url or not qdrant_api_key:
        print("❌ Missing Qdrant credentials. Check QDRANT_URL and QDRANT_API_KEY in .env.local")
        return
    
    print("🔍 Simple RAG Retrieval Test")
    print("=" * 40)
    
    try:
        # Initialize Qdrant client
        client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=30.0)
        
        # Check if collection exists
        collections = client.get_collections()
        collection_names = [col.name for col in collections.collections]
        
        print(f"📊 Available collections: {collection_names}")
        
        if "regulatory_kb" not in collection_names:
            print("❌ No 'regulatory_kb' collection found. Run ingestion first.")
            return
        
        # Get collection info
        collection_info = client.get_collection("regulatory_kb")
        print(f"📈 Collection 'regulatory_kb' has {collection_info.points_count} points")
        
        if collection_info.points_count == 0:
            print("❌ Collection is empty. Run ingestion to populate it.")
            return
        
        # Get sample points (no embedding needed)
        sample_points = client.scroll(
            collection_name="regulatory_kb",
            limit=5,
            with_payload=True,
            with_vectors=False
        )
        
        print(f"\n📝 Sample data (showing {len(sample_points[0])} points):")
        for i, point in enumerate(sample_points[0], 1):
            payload = point.payload
            country = payload.get('country', 'N/A')
            source_name = payload.get('source_name', 'N/A')[:50] + '...'
            text_preview = payload.get('text', 'N/A')[:100] + '...'
            
            print(f"  {i}. {country} | {source_name}")
            print(f"     Text: {text_preview}")
        
        # Test Internal API endpoint
        print(f"\n🔧 Testing Internal API endpoint...")
        
        internal_api_key = os.getenv('INTERNAL_SERVICE_KEY')
        if not internal_api_key:
            print("❌ Missing INTERNAL_SERVICE_KEY for API testing")
            return
            
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            try:
                response = await http_client.post(
                    'http://localhost:3000/api/internal/search-regulatory',
                    headers={
                        'Authorization': f'Bearer {internal_api_key}',
                        'Content-Type': 'application/json'
                    },
                    json={
                        'query': 'Singapore GST registration',
                        'collection': 'regulatory_kb',
                        'limit': 3,
                        'score_threshold': 0.5
                    }
                )
                
                if response.status_code == 200:
                    api_result = response.json()
                    print(f"✅ Internal API working! Found {len(api_result.get('data', []))} results")
                    
                    for i, result in enumerate(api_result.get('data', [])[:3], 1):
                        metadata = result.get('metadata', {})
                        country = metadata.get('country', 'N/A')
                        text_preview = result.get('text', 'N/A')[:80] + '...'
                        print(f"  {i}. {country} | {text_preview}")
                        
                else:
                    print(f"❌ Internal API failed: HTTP {response.status_code}")
                    print(f"Response: {response.text}")
                    
            except Exception as e:
                print(f"❌ API test failed: {e}")
                print("💡 Make sure the dev server is running: npm run dev")
        
        print(f"\n✅ Simple test completed!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(simple_test())