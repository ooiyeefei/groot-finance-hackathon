#!/usr/bin/env python3
"""
Comprehensive Retrieval Quality Analysis
Analyzes topK performance and collection metadata distribution
"""

import asyncio
from test_retrieval import RegulatoryRetrievalTester
from collections import Counter

async def comprehensive_analysis():
    tester = RegulatoryRetrievalTester()
    
    print("🔍 Regulatory KB Collection Analysis")
    print("=" * 50)
    
    # Collection stats
    collection_info = tester.qdrant_client.get_collection('regulatory_kb')
    print(f"📊 Collection Stats:")
    print(f"  Points: {collection_info.points_count}")
    print(f"  Vector Size: {collection_info.config.params.vectors.size}")
    print(f"  Distance: {collection_info.config.params.vectors.distance}")
    
    # Sample metadata analysis
    print(f"\n📋 Metadata Distribution Analysis:")
    sample_results = tester.qdrant_client.scroll(
        collection_name="regulatory_kb",
        limit=148,  # Get all points
        with_payload=True
    )[0]
    
    countries = [point.payload.get('country') for point in sample_results if point.payload.get('country')]
    tax_types = [point.payload.get('tax_type') for point in sample_results if point.payload.get('tax_type')]
    
    print(f"  Countries: {dict(Counter(countries))}")
    print(f"  Tax Types: {dict(Counter(tax_types))}")
    
    # Test queries with different thresholds
    test_queries = [
        "Singapore GST registration requirements",
        "Malaysia service tax SST", 
        "corporate income tax",
        "withholding tax non-resident",
        "import GST calculation"
    ]
    
    print(f"\n🎯 Threshold Analysis:")
    for threshold in [0.5, 0.6, 0.7, 0.8]:
        print(f"\n--- Threshold: {threshold} ---")
        for query in test_queries:
            result = await tester.test_retrieval(query, top_k=5, score_threshold=threshold)
            print(f"  '{query}': {result['results_count']} results")
    
    # Optimal topK analysis  
    print(f"\n📈 TopK Performance Analysis:")
    sample_query = "Singapore GST registration requirements"
    
    for k in [3, 5, 10, 15, 20]:
        result = await tester.test_retrieval(sample_query, top_k=k, score_threshold=0.5)
        if result['results']:
            scores = [r['score'] for r in result['results']]
            print(f"  Top-{k}: {len(scores)} results | Min: {min(scores):.3f} | Max: {max(scores):.3f} | Avg: {sum(scores)/len(scores):.3f}")
        else:
            print(f"  Top-{k}: 0 results")
    
    # Country-specific filtering test
    print(f"\n🌏 Country-Specific Retrieval Test:")
    
    # Generate embedding once
    query_embedding = await tester.generate_embedding("service tax registration")
    
    # Test Malaysia filtering
    malaysia_results = tester.qdrant_client.search(
        collection_name="regulatory_kb",
        query_vector=query_embedding,
        query_filter={
            "must": [{"key": "country", "match": {"value": "malaysia"}}]
        },
        limit=5
    )
    
    # Test Singapore filtering  
    singapore_results = tester.qdrant_client.search(
        collection_name="regulatory_kb", 
        query_vector=query_embedding,
        query_filter={
            "must": [{"key": "country", "match": {"value": "singapore"}}]
        },
        limit=5
    )
    
    print(f"  Malaysia-specific: {len(malaysia_results)} results")
    if malaysia_results:
        print(f"    Best match: {malaysia_results[0].score:.3f} | {malaysia_results[0].payload.get('source_name', 'Unknown')[:50]}...")
    
    print(f"  Singapore-specific: {len(singapore_results)} results") 
    if singapore_results:
        print(f"    Best match: {singapore_results[0].score:.3f} | {singapore_results[0].payload.get('source_name', 'Unknown')[:50]}...")
    
    await tester.close()
    print(f"\n✅ Analysis completed!")

if __name__ == "__main__":
    asyncio.run(comprehensive_analysis())