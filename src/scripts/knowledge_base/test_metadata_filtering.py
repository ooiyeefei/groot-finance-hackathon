#!/usr/bin/env python3
"""
Metadata Filtering Test for Regulatory Knowledge Base
Tests country/tax-type specific searches and metadata accuracy
"""

import httpx
import json
import os
from pathlib import Path

def test_metadata_filtering():
    """Test metadata filtering capabilities"""
    
    # API configuration
    base_url = "http://localhost:3000"
    endpoint = f"{base_url}/api/internal/search-regulatory"
    service_key = os.getenv('INTERNAL_SERVICE_KEY', "Zcrj13Ic8UNP/mvKquvblu2PLoU4j5Dsmhugl1+VhRM=")
    
    # Test scenarios with expected metadata
    test_scenarios = [
        {
            "name": "Singapore GST Specific",
            "query": "GST registration threshold million dollars",
            "expected_country": "singapore",
            "expected_tax_type": "gst",
            "description": "Should return Singapore-specific GST information"
        },
        {
            "name": "Malaysia Service Tax Specific", 
            "query": "Malaysia service tax 6 percent digital services",
            "expected_country": "malaysia",
            "expected_tax_type": "service_tax",
            "description": "Should return Malaysia-specific service tax information"
        },
        {
            "name": "Withholding Tax Cross-Country",
            "query": "withholding tax rates 17 percent technical fees",
            "expected_countries": ["singapore", "malaysia"],
            "expected_tax_type": "withholding_tax",
            "description": "Should return both Singapore and Malaysia withholding tax info"
        },
        {
            "name": "Digital Services Tax Regional",
            "query": "overseas vendor registration digital services DST",
            "expected_countries": ["singapore", "malaysia"],
            "expected_tax_types": ["gst", "service_tax"],
            "description": "Should return digital services tax info from both countries"
        },
        {
            "name": "Singapore IRAS Source",
            "query": "IRAS Singapore tax compliance procedures",
            "expected_country": "singapore",
            "expected_source": "iras",
            "description": "Should return documents specifically from IRAS"
        },
        {
            "name": "Malaysia LHDN Source",
            "query": "LHDN Malaysia tax legislation guidelines",
            "expected_country": "malaysia", 
            "expected_source": "lhdn",
            "description": "Should return documents specifically from LHDN"
        }
    ]
    
    print("🏷️  Metadata Filtering Test")
    print("=" * 80)
    
    test_results = {
        "total_scenarios": len(test_scenarios),
        "passed_scenarios": 0,
        "failed_scenarios": 0,
        "metadata_accuracy": [],
        "filtering_issues": []
    }
    
    for i, scenario in enumerate(test_scenarios, 1):
        print(f"\n{i}. {scenario['name']}")
        print(f"   🔍 Query: '{scenario['query']}'")
        print(f"   📋 Expected: {scenario['description']}")
        
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
                        'query': scenario['query'],
                        'limit': 5,  # Get more results for metadata analysis
                        'score_threshold': 0.5  # Lower threshold for broader analysis
                    },
                    timeout=15
                )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('success'):
                    results = data.get('data', [])
                    
                    if results:
                        print(f"   ✅ Retrieved {len(results)} results")
                        
                        # Analyze metadata accuracy
                        metadata_analysis = analyze_metadata(results, scenario)
                        test_results["metadata_accuracy"].append({
                            "scenario": scenario['name'],
                            "analysis": metadata_analysis
                        })
                        
                        # Print top results with metadata
                        for j, result in enumerate(results[:3]):
                            metadata = result.get('metadata', {})
                            print(f"      [{j+1}] Score: {result.get('score', 0):.3f}")
                            print(f"          Country: {metadata.get('country', 'Unknown')}")
                            print(f"          Tax Type: {metadata.get('tax_type', 'Unknown')}")
                            print(f"          Source: {metadata.get('source_name', 'Unknown')}")
                            print(f"          Topics: {metadata.get('topics', [])}")
                            
                        # Check if expectations are met
                        if validate_expectations(results, scenario):
                            print(f"   ✅ PASSED: Metadata expectations met")
                            test_results["passed_scenarios"] += 1
                        else:
                            print(f"   ❌ FAILED: Metadata expectations not met")
                            test_results["failed_scenarios"] += 1
                            test_results["filtering_issues"].append({
                                "scenario": scenario['name'],
                                "issue": "Expectations not met",
                                "results": metadata_analysis
                            })
                    else:
                        print(f"   ❌ FAILED: No results returned")
                        test_results["failed_scenarios"] += 1
                        test_results["filtering_issues"].append({
                            "scenario": scenario['name'],
                            "issue": "No results returned"
                        })
                else:
                    print(f"   ❌ FAILED: API Error - {data.get('error', 'Unknown')}")
                    test_results["failed_scenarios"] += 1
                    test_results["filtering_issues"].append({
                        "scenario": scenario['name'],
                        "issue": f"API Error: {data.get('error', 'Unknown')}"
                    })
            else:
                print(f"   ❌ FAILED: HTTP {response.status_code}")
                test_results["failed_scenarios"] += 1
                test_results["filtering_issues"].append({
                    "scenario": scenario['name'],
                    "issue": f"HTTP Error {response.status_code}"
                })
                
        except Exception as e:
            print(f"   ❌ FAILED: {e}")
            test_results["failed_scenarios"] += 1
            test_results["filtering_issues"].append({
                "scenario": scenario['name'],
                "issue": f"Exception: {str(e)}"
            })
    
    # Print comprehensive summary
    print("\n" + "=" * 80)
    print("📊 METADATA FILTERING TEST SUMMARY")
    print("=" * 80)
    
    success_rate = (test_results["passed_scenarios"] / test_results["total_scenarios"] * 100) if test_results["total_scenarios"] > 0 else 0
    
    print(f"📈 Test Performance:")
    print(f"   Total Scenarios: {test_results['total_scenarios']}")
    print(f"   Passed Scenarios: {test_results['passed_scenarios']}")
    print(f"   Failed Scenarios: {test_results['failed_scenarios']}")
    print(f"   Success Rate: {success_rate:.1f}%")
    
    # Analyze metadata accuracy across all scenarios
    if test_results["metadata_accuracy"]:
        print(f"\n🏷️  Metadata Quality Analysis:")
        
        all_countries = set()
        all_tax_types = set()
        all_sources = set()
        
        for accuracy in test_results["metadata_accuracy"]:
            analysis = accuracy["analysis"]
            all_countries.update(analysis.get("countries_found", []))
            all_tax_types.update(analysis.get("tax_types_found", []))
            all_sources.update(analysis.get("sources_found", []))
        
        print(f"   Countries Represented: {sorted(list(all_countries))}")
        print(f"   Tax Types Covered: {sorted(list(all_tax_types))}")
        print(f"   Document Sources: {sorted(list(all_sources))}")
    
    if test_results["filtering_issues"]:
        print(f"\n🚨 FILTERING ISSUES IDENTIFIED:")
        for issue in test_results["filtering_issues"]:
            print(f"   ❌ {issue['scenario']}: {issue['issue']}")
            
        print(f"\n💡 RECOMMENDATIONS:")
        print("   1. Review metadata extraction during document processing")
        print("   2. Verify country/tax-type tagging accuracy in processed chunks")
        print("   3. Consider implementing metadata-based result filtering")
        print("   4. Test vector similarity with metadata weighting")
    else:
        print(f"\n✅ EXCELLENT METADATA FILTERING: All scenarios passed!")
        
    print(f"\n🎯 NEXT STEPS:")
    print("   1. Run full integration test with Next.js application")
    print("   2. Test user-facing RAG pipeline end-to-end")
    print("   3. Validate production-ready regulatory search capabilities")
    
    return test_results

def analyze_metadata(results, scenario):
    """Analyze metadata consistency and accuracy"""
    
    analysis = {
        "total_results": len(results),
        "countries_found": [],
        "tax_types_found": [],
        "sources_found": [],
        "score_distribution": [],
        "metadata_consistency": True
    }
    
    for result in results:
        metadata = result.get('metadata', {})
        
        country = metadata.get('country')
        if country:
            analysis["countries_found"].append(country)
            
        tax_type = metadata.get('tax_type')
        if tax_type:
            analysis["tax_types_found"].append(tax_type)
            
        source = metadata.get('source_name', '')
        if source:
            analysis["sources_found"].append(source)
            
        score = result.get('score', 0)
        analysis["score_distribution"].append(score)
    
    # Remove duplicates and sort
    analysis["countries_found"] = sorted(list(set(analysis["countries_found"])))
    analysis["tax_types_found"] = sorted(list(set(analysis["tax_types_found"])))
    analysis["sources_found"] = sorted(list(set(analysis["sources_found"])))
    
    return analysis

def validate_expectations(results, scenario):
    """Validate if results meet scenario expectations"""
    
    if not results:
        return False
    
    # Extract metadata from results
    countries = [r.get('metadata', {}).get('country', '').lower() for r in results]
    tax_types = [r.get('metadata', {}).get('tax_type', '').lower() for r in results]
    sources = [r.get('metadata', {}).get('source_name', '').lower() for r in results]
    
    # Check expected country
    if 'expected_country' in scenario:
        expected = scenario['expected_country'].lower()
        if expected not in countries:
            return False
    
    # Check expected countries (plural)
    if 'expected_countries' in scenario:
        expected_countries = [c.lower() for c in scenario['expected_countries']]
        if not any(country in countries for country in expected_countries):
            return False
    
    # Check expected tax type
    if 'expected_tax_type' in scenario:
        expected = scenario['expected_tax_type'].lower()
        if expected not in tax_types:
            return False
            
    # Check expected tax types (plural)
    if 'expected_tax_types' in scenario:
        expected_types = [t.lower() for t in scenario['expected_tax_types']]
        if not any(tax_type in tax_types for tax_type in expected_types):
            return False
    
    # Check expected source
    if 'expected_source' in scenario:
        expected = scenario['expected_source'].lower()
        if not any(expected in source.lower() for source in sources):
            return False
    
    return True

if __name__ == "__main__":
    test_metadata_filtering()