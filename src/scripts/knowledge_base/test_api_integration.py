#!/usr/bin/env python3
"""
Test script for the enhanced regulatory search API integration
Tests the updated /api/internal/search-regulatory endpoint
"""

import httpx
import json
import os
from pathlib import Path

def test_regulatory_search_api():
    """Test the enhanced regulatory search API"""
    
    # API configuration
    base_url = "http://localhost:3000"  # Next.js dev server
    endpoint = f"{base_url}/api/internal/search-regulatory"
    service_key = os.getenv('INTERNAL_SERVICE_KEY', "dev-service-key-change-in-production")  # Use env var or default
    
    # Test queries
    test_queries = [
        "Singapore GST registration requirements",
        "Malaysia withholding tax rates for services", 
        "cross-border transaction documentation requirements",
        "ASEAN tax treaty benefits",
        "digital services tax compliance"
    ]
    
    print("🔍 Testing Enhanced Regulatory Search API")
    print(f"📡 Endpoint: {endpoint}")
    print("="*60)
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n{i}. Testing query: \"{query}\"")
        
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
                    timeout=10
                )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('success'):
                    results = data.get('data', [])
                    metadata = data.get('metadata', {})
                    
                    print(f"   ✅ Success: {len(results)} results found")
                    print(f"   📊 Results count: {metadata.get('results_count', 0)}")
                    print(f"   🎯 Score threshold: {metadata.get('score_threshold', 'N/A')}")
                    
                    # Display top result
                    if results:
                        top_result = results[0]
                        print(f"   📄 Top result:")
                        print(f"       Source: {top_result.get('metadata', {}).get('source_name', 'Unknown')}")
                        print(f"       Country: {top_result.get('metadata', {}).get('country', 'Unknown')}")
                        print(f"       Score: {top_result.get('score', 0):.3f}")
                        print(f"       Text: {top_result.get('text', '')[:100]}...")
                else:
                    print(f"   ❌ API Error: {data.get('error', 'Unknown error')}")
            
            elif response.status_code == 401:
                print(f"   🔐 Authentication failed - check service key")
            else:
                print(f"   ❌ HTTP Error: {response.status_code} - {response.text[:200]}")
                
        except httpx.ConnectError:
            print(f"   🔌 Connection failed - is Next.js dev server running on {base_url}?")
        except Exception as e:
            print(f"   ❌ Request failed: {e}")
    
    print("\n" + "="*60)
    print("🏁 Testing Complete")
    print("\n💡 To run this test:")
    print("   1. Start Next.js dev server: npm run dev")  
    print("   2. Run this script: python test_api_integration.py")
    print("   3. Check results above for regulatory search functionality")

def test_health_endpoint():
    """Test the health check endpoint"""
    
    base_url = "http://localhost:3000"
    health_endpoint = f"{base_url}/api/internal/search-regulatory"
    
    print("\n🏥 Testing Health Check Endpoint")
    
    try:
        with httpx.Client() as client:
            response = client.get(health_endpoint, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Health check passed")
            print(f"   📦 Collection: {data.get('collection', 'Unknown')}")
            print(f"   📝 Note: {data.get('note', 'No note')}")
        else:
            print(f"   ❌ Health check failed: {response.status_code}")
            
    except Exception as e:
        print(f"   ❌ Health check error: {e}")

if __name__ == "__main__":
    test_health_endpoint()
    test_regulatory_search_api()