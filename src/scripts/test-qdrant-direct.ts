#!/usr/bin/env npx tsx

/**
 * Direct Qdrant API test to inspect regulatory_kb collection data
 */

import 'dotenv/config';

async function testQdrantCollection() {
  const QDRANT_URL = process.env.QDRANT_URL;
  const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
  
  if (!QDRANT_URL || !QDRANT_API_KEY) {
    console.log('❌ Missing QDRANT_URL or QDRANT_API_KEY in environment');
    return;
  }
  
  console.log('🔍 Testing Qdrant regulatory_kb collection...');
  console.log('📍 Qdrant URL:', QDRANT_URL);
  
  try {
    // Check collection info
    console.log('\n📊 Getting collection info...');
    const collectionResponse = await fetch(`${QDRANT_URL}/collections/regulatory_kb`, {
      method: 'GET',
      headers: {
        'api-key': QDRANT_API_KEY
      }
    });
    
    if (!collectionResponse.ok) {
      throw new Error(`Collection check failed: ${collectionResponse.status} ${collectionResponse.statusText}`);
    }
    
    const collectionInfo = await collectionResponse.json();
    console.log('✅ Collection exists!');
    console.log('📊 Points count:', collectionInfo.result?.points_count || 'Unknown');
    console.log('📏 Vector size:', collectionInfo.result?.config?.params?.vectors?.size || 'Unknown');
    
    // Get a few sample points to inspect metadata using scroll method
    console.log('\n🔍 Getting sample points...');
    const sampleResponse = await fetch(`${QDRANT_URL}/collections/regulatory_kb/points/scroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': QDRANT_API_KEY
      },
      body: JSON.stringify({
        limit: 3,
        with_payload: true,
        with_vector: false
      })
    });
    
    if (!sampleResponse.ok) {
      const errorText = await sampleResponse.text();
      throw new Error(`Sample points fetch failed: ${sampleResponse.status} ${sampleResponse.statusText} - ${errorText}`);
    }
    
    const sampleData = await sampleResponse.json();
    const points = sampleData.result?.points || [];
    
    console.log(`📋 Found ${points.length} sample points:`);
    
    points.forEach((point: any, index: number) => {
      console.log(`\n--- Point ${index + 1} ---`);
      console.log('ID:', point.id);
      console.log('Payload keys:', Object.keys(point.payload || {}));
      
      const metadata = point.payload?.metadata || {};
      console.log('Metadata keys:', Object.keys(metadata));
      console.log('Source name:', metadata.source_name || 'NOT SET');
      console.log('Country:', metadata.country || 'NOT SET');
      console.log('URL field:', metadata.url || 'NOT SET');
      console.log('Document ID:', metadata.document_id || 'NOT SET');
      
      // Check if this point has URL data
      const hasUrl = !!metadata.url;
      console.log('🔗 Has URL:', hasUrl ? 'YES' : 'NO');
      
      if (hasUrl) {
        console.log('🔗 URL:', metadata.url);
        const isPdf = metadata.url.toLowerCase().includes('.pdf');
        console.log('📄 Is PDF:', isPdf ? 'YES' : 'NO');
      }
    });
    
    // Summary analysis
    const pointsWithUrls = points.filter((p: any) => p.payload?.metadata?.url);
    console.log(`\n📈 Summary:`);
    console.log(`   Sample points: ${points.length}`);
    console.log(`   Points with URLs: ${pointsWithUrls.length}`);
    console.log(`   Points missing URLs: ${points.length - pointsWithUrls.length}`);
    
    if (pointsWithUrls.length === 0) {
      console.log('❌ PROBLEM FOUND: Sample points have no URL metadata!');
      console.log('   This explains why citations show "No Document Preview Available"');
    } else {
      console.log('✅ Some points have URLs - should work for citations');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Load .env.local and run
testQdrantCollection().catch(console.error);