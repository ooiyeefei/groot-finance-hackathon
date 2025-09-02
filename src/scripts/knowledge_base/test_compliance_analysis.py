#!/usr/bin/env python3
"""
End-to-End Compliance Analysis Test
Tests the complete RAG-powered compliance analysis flow
"""

import asyncio
import httpx
import json
from pathlib import Path
from dotenv import load_dotenv

# Load environment
project_root = Path(__file__).resolve().parent.parent.parent.parent
env_path = project_root / '.env.local'
load_dotenv(env_path)

async def test_compliance_analysis():
    """Test the CrossBorderTaxComplianceTool with real transaction data"""
    
    print("🧠 Testing RAG-Powered Compliance Analysis")
    print("=" * 50)
    
    # Test transaction scenarios
    test_transactions = [
        {
            "name": "Singapore B2C Digital Service",
            "transaction": {
                "transaction_type": "expense",
                "amount": 15000,
                "original_currency": "SGD", 
                "home_currency": "USD",
                "description": "Software subscription from Singapore vendor",
                "category": "Software & Technology",
                "vendor_country": "singapore"
            }
        },
        {
            "name": "Malaysia Consulting Service", 
            "transaction": {
                "transaction_type": "income",
                "amount": 25000,
                "original_currency": "MYR",
                "home_currency": "SGD", 
                "description": "Consulting services provided to Malaysian client",
                "category": "Professional Services",
                "vendor_country": "malaysia"
            }
        },
        {
            "name": "High-Value Cross-Border Transfer",
            "transaction": {
                "transaction_type": "expense", 
                "amount": 100000,
                "original_currency": "THB",
                "home_currency": "USD",
                "description": "Equipment purchase from Thailand supplier",
                "category": "Equipment & Hardware",
                "vendor_country": "thailand"
            }
        }
    ]
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        
        for test_case in test_transactions:
            print(f"\n📊 Testing: {test_case['name']}")
            print("-" * 40)
            
            transaction = test_case['transaction']
            print(f"💰 {transaction['amount']} {transaction['original_currency']} → {transaction['home_currency']}")
            print(f"🏢 {transaction['description']}")
            print(f"🌍 Vendor: {transaction['vendor_country']}")
            
            try:
                # Test the internal compliance analysis endpoint
                response = await client.post(
                    'http://localhost:3000/api/internal/analyze-compliance', 
                    json=transaction,
                    headers={'Content-Type': 'application/json'}
                )
                
                if response.status_code == 200:
                    result = response.json()
                    
                    print(f"✅ Analysis Status: {result.get('compliance_status', 'unknown')}")
                    print(f"⚠️  Risk Level: {result.get('risk_level', 'unknown')}")
                    
                    # Tax implications
                    tax_info = result.get('tax_implications', {})
                    if tax_info.get('withholding_tax_required'):
                        print(f"💸 Withholding Tax: {tax_info.get('estimated_tax_rate', 0)}%")
                    
                    # Regulatory requirements
                    reqs = result.get('regulatory_requirements', {})
                    if reqs.get('documentation_required'):
                        print(f"📋 Required Docs: {len(reqs['documentation_required'])} items")
                    
                    # Recommendations
                    recommendations = result.get('recommendations', [])
                    if recommendations:
                        print(f"💡 Recommendations: {len(recommendations)} provided")
                        for i, rec in enumerate(recommendations[:2], 1):
                            print(f"  {i}. {rec}")
                    
                    # Confidence and analysis metadata
                    confidence = result.get('confidence_score', 0)
                    analysis_method = result.get('analysis_method', 'unknown')
                    print(f"🎯 Confidence: {confidence:.1f}% | Method: {analysis_method}")
                    
                else:
                    print(f"❌ API Error: HTTP {response.status_code}")
                    print(f"Response: {response.text[:200]}")
                    
            except Exception as e:
                print(f"❌ Test failed: {e}")
                print("💡 Make sure the dev server is running: npm run dev")
    
    print(f"\n✅ Compliance analysis testing completed!")

async def test_retrieval_queries():
    """Test specific regulatory retrieval queries"""
    
    print(f"\n🔍 Testing Specific Regulatory Queries")
    print("=" * 50)
    
    test_queries = [
        "Singapore OVR overseas vendor registration",
        "Malaysia SST service tax cross border", 
        "withholding tax requirements",
        "GST registration threshold",
        "digital services tax compliance"
    ]
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        for query in test_queries:
            print(f"\n🔍 Query: {query}")
            print("-" * 30)
            
            try:
                response = await client.post(
                    'http://localhost:3000/api/internal/search-regulatory',
                    json={
                        'query': query,
                        'collection': 'regulatory_kb', 
                        'limit': 3,
                        'score_threshold': 0.6
                    },
                    headers={'Content-Type': 'application/json'}
                )
                
                if response.status_code == 200:
                    results = response.json()
                    data = results.get('data', [])
                    
                    print(f"📊 Found {len(data)} results")
                    
                    for i, result in enumerate(data, 1):
                        metadata = result.get('metadata', {})
                        country = metadata.get('country', 'N/A')
                        source = metadata.get('source_name', 'N/A')[:40] + '...'
                        text = result.get('text', 'N/A')[:100] + '...'
                        
                        print(f"  {i}. [{country}] {source}")
                        print(f"     {text}")
                        
                else:
                    print(f"❌ Query failed: HTTP {response.status_code}")
                    
            except Exception as e:
                print(f"❌ Query failed: {e}")
    
    print(f"\n✅ Regulatory query testing completed!")

if __name__ == "__main__":
    async def main():
        await test_retrieval_queries()
        await test_compliance_analysis()
    
    asyncio.run(main())