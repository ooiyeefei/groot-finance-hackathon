#!/usr/bin/env python3
"""
Quick test for DTAA and MAP retrieval after ingestion
"""
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from qdrant_client import QdrantClient
import httpx

# Load environment
try:
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    env_path = project_root / '.env.local'
    load_dotenv(env_path, verbose=False)
except Exception as e:
    print(f"Warning: Failed to load environment: {e}")

async def quick_test():
    # Initialize clients
    qdrant_client = QdrantClient(
        url=os.getenv('QDRANT_URL'),
        api_key=os.getenv('QDRANT_API_KEY'),
    )
    
    embedding_client = httpx.AsyncClient(
        timeout=httpx.Timeout(60.0),
        headers={
            'Authorization': f'Bearer {os.getenv("EMBEDDING_API_KEY")}',
            'Content-Type': 'application/json'
        }
    )
    
    # Test the previously failing terms
    test_queries = [
        "DTAA benefits Malaysia Singapore",
        "Double Taxation Avoidance Agreement", 
        "MAP dispute resolution",
        "Mutual Agreement Procedure"
    ]
    
    print("🎯 Testing Previously Failing Terms:")
    print("=" * 50)
    
    for query in test_queries:
        try:
            # Generate embedding
            response = await embedding_client.post(
                f"{os.getenv('EMBEDDING_ENDPOINT_URL')}/embeddings",
                json={
                    "model": os.getenv('EMBEDDING_MODEL_ID'),
                    "input": query
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                query_embedding = result['data'][0]['embedding']
                
                # Search with lower limit
                results = qdrant_client.query_points(
                    collection_name="regulatory_kb",
                    query=query_embedding,
                    limit=3,
                    score_threshold=0.6
                ).points
                
                print(f"\n--- {query} ---")
                if results:
                    print(f"✅ Found {len(results)} results!")
                    for i, res in enumerate(results, 1):
                        country = res.payload.get('country', 'N/A')
                        source = res.payload.get('source_name', 'N/A')[:50] + '...'
                        print(f"  {i}. Score: {res.score:.3f} | {country} | {source}")
                else:
                    print("❌ No results found")
            else:
                print(f"❌ Embedding failed for '{query}': {response.status_code}")
                
        except Exception as e:
            print(f"❌ Error testing '{query}': {e}")
    
    await embedding_client.aclose()
    
    # Quick acronym test
    print(f"\n🔗 Quick Acronym Test:")
    print("=" * 30)
    
    acronym_pairs = [("DTAA", "Double Taxation Avoidance Agreement"), ("MAP", "Mutual Agreement Procedure")]
    
    for acronym, full_term in acronym_pairs:
        try:
            for term in [acronym, full_term]:
                embedding_client = httpx.AsyncClient(
                    timeout=httpx.Timeout(60.0),
                    headers={
                        'Authorization': f'Bearer {os.getenv("EMBEDDING_API_KEY")}',
                        'Content-Type': 'application/json'
                    }
                )
                
                response = await embedding_client.post(
                    f"{os.getenv('EMBEDDING_ENDPOINT_URL')}/embeddings",
                    json={
                        "model": os.getenv('EMBEDDING_MODEL_ID'),
                        "input": term
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    query_embedding = result['data'][0]['embedding']
                    
                    results = qdrant_client.query_points(
                        collection_name="regulatory_kb",
                        query=query_embedding,
                        limit=1,
                        score_threshold=0.6
                    ).points
                    
                    status = "✅" if results else "❌"
                    count = len(results)
                    print(f"{status} {term}: {count} results")
                
                await embedding_client.aclose()
                
        except Exception as e:
            print(f"❌ Error in acronym test: {e}")

if __name__ == "__main__":
    asyncio.run(quick_test())