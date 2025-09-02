#!/usr/bin/env python3
"""
Expanded Query Testing for Regulatory Knowledge Base
Tests comprehensive coverage across different tax types, jurisdictions, and regulatory scenarios
"""

import httpx
import json
import os
from pathlib import Path

def test_expanded_regulatory_queries():
    """Test comprehensive regulatory query coverage"""
    
    # API configuration
    base_url = "http://localhost:3000"
    endpoint = f"{base_url}/api/internal/search-regulatory"
    service_key = os.getenv('INTERNAL_SERVICE_KEY', "Zcrj13Ic8UNP/mvKquvblu2PLoU4j5Dsmhugl1+VhRM=")
    
    # Comprehensive test queries organized by category
    test_categories = {
        "GST/VAT Registration": [
            "GST registration thresholds Singapore",
            "voluntary GST registration criteria",
            "GST deregistration procedures",
            "group registration GST Singapore"
        ],
        
        "Withholding Tax": [
            "withholding tax rates technical fees Malaysia",
            "royalty withholding tax Singapore",
            "interest withholding tax ASEAN",
            "tax treaty withholding rate reductions"
        ],
        
        "Digital Services Tax": [
            "digital service tax DST Malaysia registration",
            "overseas vendor registration Singapore",
            "digital services tax compliance requirements",
            "B2C digital services tax rates"
        ],
        
        "Cross-Border Transactions": [
            "transfer pricing documentation requirements",
            "advance pricing arrangements APA",
            "thin capitalization rules",
            "controlled foreign company CFC rules"
        ],
        
        "Tax Treaties": [
            "Singapore Malaysia tax treaty benefits", 
            "permanent establishment definition",
            "tax treaty tie-breaker rules",
            "mutual agreement procedures MAP"
        ],
        
        "Compliance Procedures": [
            "tax audit procedures Singapore",
            "voluntary disclosure program",
            "penalty mitigation factors",
            "objection and appeal procedures Malaysia"
        ],
        
        "Specialized Areas": [
            "real property gains tax RPGT",
            "stamp duty rates property transactions",
            "goods and services tax on imports",
            "tax exemptions charitable organizations"
        ]
    }
    
    print("🔍 Expanded Regulatory Query Testing")
    print("=" * 80)
    
    results_summary = {
        "total_queries": 0,
        "successful_queries": 0,
        "failed_queries": 0,
        "categories_tested": len(test_categories),
        "coverage_gaps": []
    }
    
    for category, queries in test_categories.items():
        print(f"\n📂 Category: {category}")
        print("-" * 50)
        
        category_results = []
        
        for query in queries:
            results_summary["total_queries"] += 1
            
            try:
                # Make API request
                with httpx.Client() as client:
                    response = client.post(
                        endpoint,
                        headers={
                            'Content-Type': 'application/json',
                            'Authorization': f'Bearer {service_key}'
                        },
                        json={
                            'query': query,
                            'limit': 3,
                            'score_threshold': 0.6
                        },
                        timeout=15
                    )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if data.get('success'):
                        results = data.get('data', [])
                        results_summary["successful_queries"] += 1
                        
                        if results:
                            top_result = results[0]
                            print(f"   ✅ '{query}'")
                            print(f"      📊 {len(results)} results (score: {top_result.get('score', 0):.3f})")
                            print(f"      🏷️  {top_result.get('metadata', {}).get('source_name', 'Unknown')[:50]}...")
                            
                            # Check if we got high-quality results
                            if top_result.get('score', 0) < 0.7:
                                category_results.append({
                                    'query': query,
                                    'status': 'low_relevance', 
                                    'score': top_result.get('score', 0)
                                })
                        else:
                            print(f"   ⚠️  '{query}' - No results found")
                            category_results.append({
                                'query': query,
                                'status': 'no_results',
                                'score': 0
                            })
                            
                    else:
                        print(f"   ❌ '{query}' - API Error: {data.get('error', 'Unknown')}")
                        results_summary["failed_queries"] += 1
                        category_results.append({
                            'query': query,
                            'status': 'api_error',
                            'error': data.get('error', 'Unknown')
                        })
                        
                else:
                    print(f"   ❌ '{query}' - HTTP {response.status_code}")
                    results_summary["failed_queries"] += 1
                    category_results.append({
                        'query': query,
                        'status': 'http_error',
                        'status_code': response.status_code
                    })
                    
            except httpx.ConnectError:
                print(f"   🔌 Connection failed for '{query}'")
                results_summary["failed_queries"] += 1
                category_results.append({
                    'query': query,
                    'status': 'connection_error'
                })
            except Exception as e:
                print(f"   ❌ '{query}' - Error: {e}")
                results_summary["failed_queries"] += 1
                category_results.append({
                    'query': query,
                    'status': 'exception',
                    'error': str(e)
                })
        
        # Analyze category coverage
        low_relevance = [r for r in category_results if r.get('status') == 'low_relevance']
        no_results = [r for r in category_results if r.get('status') == 'no_results']
        
        if low_relevance or no_results:
            results_summary["coverage_gaps"].append({
                'category': category,
                'low_relevance_count': len(low_relevance),
                'no_results_count': len(no_results),
                'queries_needing_attention': low_relevance + no_results
            })
    
    # Print comprehensive summary
    print("\n" + "=" * 80)
    print("📊 EXPANDED QUERY TESTING SUMMARY")
    print("=" * 80)
    
    success_rate = (results_summary["successful_queries"] / results_summary["total_queries"] * 100) if results_summary["total_queries"] > 0 else 0
    
    print(f"📈 Overall Performance:")
    print(f"   Total Queries Tested: {results_summary['total_queries']}")
    print(f"   Successful Queries: {results_summary['successful_queries']}")
    print(f"   Failed Queries: {results_summary['failed_queries']}")
    print(f"   Success Rate: {success_rate:.1f}%")
    print(f"   Categories Tested: {results_summary['categories_tested']}")
    
    if results_summary["coverage_gaps"]:
        print(f"\n🚨 COVERAGE GAPS IDENTIFIED:")
        for gap in results_summary["coverage_gaps"]:
            print(f"   📂 {gap['category']}:")
            if gap['no_results_count'] > 0:
                print(f"      🔍 {gap['no_results_count']} queries returned no results")
            if gap['low_relevance_count'] > 0:
                print(f"      📉 {gap['low_relevance_count']} queries had low relevance scores")
                
        print(f"\n💡 RECOMMENDATIONS:")
        print("   1. Review queries with no results - may need additional document sources")
        print("   2. Improve chunking for low-relevance results - may need better context preservation")
        print("   3. Consider adding more specialized regulatory documents for gap areas")
        print("   4. Evaluate embedding model performance on domain-specific terminology")
    else:
        print(f"\n✅ EXCELLENT COVERAGE: No significant gaps identified!")
        
    print(f"\n🎯 NEXT STEPS:")
    print("   1. Run metadata filtering tests for country/tax-type specificity")
    print("   2. Test integration with Next.js application UI")
    print("   3. Validate end-to-end RAG pipeline performance")
    
    return results_summary

if __name__ == "__main__":
    test_expanded_regulatory_queries()