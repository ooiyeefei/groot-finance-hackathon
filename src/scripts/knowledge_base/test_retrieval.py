#!/usr/bin/env python3
"""
Regulatory Knowledge Base Retrieval Testing
Tests retrieval quality using the same embeddings as production system
"""

import os
import sys
import json
import asyncio
import httpx
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

# Load environment from project root
try:
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    env_path = project_root / '.env.local'
    load_dotenv(env_path, verbose=False)
except Exception as e:
    print(f"Warning: Failed to load environment: {e}")

class RegulatoryRetrievalTester:
    """Test retrieval quality for regulatory_kb collection using production embeddings"""
    
    def __init__(self):
        # Load configuration (same as production)
        self.qdrant_url = os.getenv('QDRANT_URL')
        self.qdrant_api_key = os.getenv('QDRANT_API_KEY') 
        self.embedding_endpoint = os.getenv('EMBEDDING_ENDPOINT_URL', 'https://litellm.eks.kopi.io/v1')
        self.embedding_model = os.getenv('EMBEDDING_MODEL_ID', 'openai/qwen3-embedding-4b-bf16-cpu')
        self.embedding_api_key = os.getenv('EMBEDDING_API_KEY')
        self.collection_name = "regulatory_kb"
        
        # Initialize clients
        self.qdrant_client = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_api_key,
        )
        
        self.embedding_client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0),
            headers={
                'Authorization': f'Bearer {self.embedding_api_key}',
                'Content-Type': 'application/json'
            }
        )
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using production endpoint"""
        response = await self.embedding_client.post(
            f"{self.embedding_endpoint}/embeddings",
            json={
                "model": self.embedding_model,
                "input": text
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['data'][0]['embedding']
        else:
            raise Exception(f"Embedding generation failed: HTTP {response.status_code}")
    
    def expand_query_acronyms(self, query: str) -> str:
        """FIXED: True bidirectional query expansion for acronyms to improve semantic matching"""
        
        # Same acronym map as used in document processing for consistency
        acronym_map = {
            "OVR": "Overseas Vendor Registration",
            "GST": "Goods and Services Tax",
            "SST": "Sales and Service Tax", 
            "DST": "Digital Services Tax",
            "DTAA": "Double Taxation Avoidance Agreement",
            "MAP": "Mutual Agreement Procedure",
            "IRAS": "Inland Revenue Authority of Singapore",
            "LHDN": "Lembaga Hasil Dalam Negeri",
            "ACRA": "Accounting and Corporate Regulatory Authority",
            "SSM": "Suruhanjaya Syarikat Malaysia",
            "CRS": "Common Reporting Standard",
            "FATCA": "Foreign Account Tax Compliance Act",
            "MLI": "Multilateral Instrument",
            "APA": "Advance Pricing Arrangement",
            "CFC": "Controlled Foreign Company",
            "RPGT": "Real Property Gains Tax",
            "BEPS": "Base Erosion and Profit Shifting",
            "GMT": "Global Minimum Tax"
        }
        
        # Invert the map for efficient phrase-to-acronym lookup
        phrase_map = {v.lower(): k for k, v in acronym_map.items()}
        
        additions = set()
        query_lower = query.lower()

        # 1. FIXED: Check for full phrases in the query and add the acronym
        for phrase, acronym in phrase_map.items():
            if phrase in query_lower:
                additions.add(acronym)

        # 2. Check for acronyms in the query and add the full phrase
        # Use regex for whole-word matching to avoid partial matches
        import re
        for acronym, phrase in acronym_map.items():
            if re.search(rf'\b{re.escape(acronym)}\b', query, re.IGNORECASE):
                additions.add(phrase)
        
        if not additions:
            return query

        # FIXED: Append unique new terms to the original query for comprehensive search
        return query + " " + " ".join(sorted(list(additions)))
    
    async def test_retrieval(self, query: str, top_k: int = 5, score_threshold: float = 0.7) -> Dict[str, Any]:
        """Test retrieval with different topK and threshold settings"""
        # Apply application-side query expansion for better semantic matching
        expanded_query = self.expand_query_acronyms(query)
        
        # Generate query embedding using expanded query
        query_embedding = await self.generate_embedding(expanded_query)
        
        # Search with specified topK
        results = self.qdrant_client.query_points(
            collection_name=self.collection_name,
            query=query_embedding,
            limit=top_k,
            score_threshold=score_threshold
        ).points
        
        return {
            'query': query,
            'expanded_query': expanded_query,
            'query_expansion_applied': expanded_query != query,
            'top_k': top_k,
            'score_threshold': score_threshold,
            'results_count': len(results),
            'results': [
                {
                    'score': result.score,
                    'country': result.payload.get('country', 'N/A'),
                    'tax_type': result.payload.get('tax_type', 'N/A'),
                    'source_name': result.payload.get('source_name', 'N/A')[:50] + '...',
                    'text_preview': result.payload.get('text', 'N/A')[:150] + '...'
                }
                for result in results
            ]
        }
    
    def test_metadata_filtering(self, query: str, country: str = None, tax_type: str = None, top_k: int = 5):
        """Test retrieval with metadata filtering"""
        import asyncio
        
        async def _test():
            # Apply query expansion for consistency
            expanded_query = self.expand_query_acronyms(query)
            query_embedding = await self.generate_embedding(expanded_query)
            
            # Build filter conditions
            filter_conditions = []
            if country:
                filter_conditions.append(FieldCondition(key="country", match=MatchValue(value=country)))
            if tax_type:
                filter_conditions.append(FieldCondition(key="tax_type", match=MatchValue(value=tax_type)))
            
            query_filter = Filter(must=filter_conditions) if filter_conditions else None
            
            results = self.qdrant_client.query_points(
                collection_name=self.collection_name,
                query=query_embedding,
                query_filter=query_filter,
                limit=top_k
            ).points
            
            return {
                'query': query,
                'country_filter': country,
                'tax_type_filter': tax_type, 
                'results_count': len(results),
                'results': [
                    {
                        'score': result.score,
                        'country': result.payload.get('country'),
                        'tax_type': result.payload.get('tax_type'),
                        'source_name': result.payload.get('source_name', 'N/A')[:50] + '...',
                    }
                    for result in results
                ]
            }
        
        return asyncio.run(_test())
    
    async def benchmark_topk_performance(self, test_queries: List[str]):
        """Benchmark different topK values to find optimal setting"""
        top_k_values = [3, 5, 10, 15, 20]
        results = {}
        
        for query in test_queries:
            query_results = {}
            for k in top_k_values:
                # Use 0.6 threshold to match detailed results section
                result = await self.test_retrieval(query, top_k=k, score_threshold=0.6)
                query_results[f"top_{k}"] = {
                    'results_count': result['results_count'],
                    'min_score': min([r['score'] for r in result['results']]) if result['results'] else 0,
                    'max_score': max([r['score'] for r in result['results']]) if result['results'] else 0,
                    'avg_score': sum([r['score'] for r in result['results']]) / len(result['results']) if result['results'] else 0
                }
            results[query] = query_results
        
        return results
    
    async def test_acronym_expansion_effectiveness(self):
        """Test acronym-expansion pairs to validate semantic linking"""
        acronym_pairs = [
            ("OVR", "Overseas Vendor Registration"),
            ("GST", "Goods and Services Tax"),
            ("DST", "Digital Services Tax"),
            ("SST", "Sales and Service Tax"),
            ("DTAA", "Double Taxation Avoidance Agreement"),
            ("MAP", "Mutual Agreement Procedure")
        ]
        
        results = {}
        
        for acronym, expansion in acronym_pairs:
            # Test both directions
            acronym_result = await self.test_retrieval(acronym, top_k=3, score_threshold=0.6)
            expansion_result = await self.test_retrieval(expansion, top_k=3, score_threshold=0.6)
            
            # Calculate effectiveness metrics
            acronym_found = acronym_result['results_count'] > 0
            expansion_found = expansion_result['results_count'] > 0
            
            avg_acronym_score = sum([r['score'] for r in acronym_result['results']]) / len(acronym_result['results']) if acronym_result['results'] else 0
            avg_expansion_score = sum([r['score'] for r in expansion_result['results']]) / len(expansion_result['results']) if expansion_result['results'] else 0
            
            results[f"{acronym}/{expansion}"] = {
                'acronym_found': acronym_found,
                'expansion_found': expansion_found,
                'acronym_results_count': acronym_result['results_count'],
                'expansion_results_count': expansion_result['results_count'],
                'avg_acronym_score': avg_acronym_score,
                'avg_expansion_score': avg_expansion_score,
                'bidirectional_success': acronym_found and expansion_found
            }
        
        return results
    
    async def close(self):
        """Clean up resources"""
        await self.embedding_client.aclose()

async def main():
    """Run retrieval quality tests"""
    tester = RegulatoryRetrievalTester()
    
    print("🔍 Regulatory Knowledge Base Retrieval Quality Test")
    print("=" * 60)
    
    # Comprehensive test queries including acronym variations
    test_queries = [
        "Singapore GST registration requirements",
        "Malaysia service tax SST cross border", 
        "overseas vendor registration",  # Test full term
        "OVR",  # Test acronym only
        "GST for Overseas Vendor Registration",  # Test combination
        "Digital Services Tax compliance",  # Test full term
        "DST",  # Test acronym
        "DTAA benefits Malaysia Singapore",  # Test acronym
        "Double Taxation Avoidance Agreement",  # Test full term
        "MAP dispute resolution",  # Test acronym
        "Mutual Agreement Procedure"  # Test full term
    ]
    
    try:
        print("\n📊 Testing Different TopK Values:")
        benchmark_results = await tester.benchmark_topk_performance(test_queries)
        
        for query, results in benchmark_results.items():
            print(f"\nQuery: {query}")
            for top_k, metrics in results.items():
                print(f"  {top_k}: {metrics['results_count']} results, avg_score: {metrics['avg_score']:.3f}")
        
        print("\n🎯 Detailed Results for Key Queries:")
        
        # Test specific queries with optimal topK
        for query in test_queries:
            print(f"\n--- Query: {query} ---")
            result = await tester.test_retrieval(query, top_k=5, score_threshold=0.6)
            
            if result['results']:
                for i, res in enumerate(result['results'], 1):
                    print(f"  {i}. Score: {res['score']:.3f} | {res['country']} | {res['tax_type']} | {res['source_name']}")
            else:
                print("  No results found")
        
        print("\n🔗 Acronym Expansion Effectiveness Test:")
        acronym_results = await tester.test_acronym_expansion_effectiveness()
        
        successful_pairs = 0
        total_pairs = len(acronym_results)
        
        for pair, metrics in acronym_results.items():
            acronym, expansion = pair.split('/')
            status = "✅ PASS" if metrics['bidirectional_success'] else "❌ FAIL"
            print(f"\n  {status} {acronym} ↔ {expansion}")
            print(f"    Acronym: {metrics['acronym_results_count']} results (avg: {metrics['avg_acronym_score']:.3f})")
            print(f"    Expansion: {metrics['expansion_results_count']} results (avg: {metrics['avg_expansion_score']:.3f})")
            
            if metrics['bidirectional_success']:
                successful_pairs += 1
        
        success_rate = (successful_pairs / total_pairs) * 100
        print(f"\n📊 Acronym Expansion Success Rate: {successful_pairs}/{total_pairs} ({success_rate:.1f}%)")
        
        if success_rate >= 80:
            print("✅ Acronym expansion is working effectively!")
        else:
            print("⚠️ Acronym expansion needs improvement. Consider re-processing documents.")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
    finally:
        await tester.close()
        print("\n✅ Retrieval quality test completed!")

if __name__ == "__main__":
    asyncio.run(main())