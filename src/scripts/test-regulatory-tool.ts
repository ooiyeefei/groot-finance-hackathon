#!/usr/bin/env npx tsx

/**
 * Test script to debug the regulatory knowledge tool citation URL issue
 */

import { RegulatoryKnowledgeTool } from '../lib/tools/regulatory-knowledge-tool';
import { UserContext } from '../lib/tools/base-tool';

async function testRegulatoryTool() {
  console.log('🔍 Testing Regulatory Knowledge Tool...');
  
  const tool = new RegulatoryKnowledgeTool();
  const testUserContext: UserContext = {
    userId: 'test-user',
    conversationId: 'test-conversation'
  };
  
  const testQuery = "What are the GST requirements for Singapore?";
  
  try {
    console.log(`\n📤 Testing query: "${testQuery}"`);
    console.log('🔧 Executing regulatory knowledge tool...\n');
    
    const result = await tool.execute(
      { query: testQuery, limit: 3 },
      testUserContext
    );
    
    console.log('✅ Tool execution completed!');
    console.log('📊 Result success:', result.success);
    
    if (result.citations && result.citations.length > 0) {
      console.log(`\n📋 Found ${result.citations.length} citations:`);
      
      result.citations.forEach((citation, index) => {
        console.log(`\n--- Citation ${index + 1} ---`);
        console.log('ID:', citation.id);
        console.log('Source Name:', citation.source_name);
        console.log('Country:', citation.country);
        console.log('PDF URL:', citation.pdf_url || 'NOT SET');
        console.log('Official URL:', citation.official_url || 'NOT SET');
        console.log('Page Number:', citation.page_number || 'N/A');
        console.log('Confidence Score:', citation.confidence_score);
        console.log('Content Snippet:', citation.content_snippet.substring(0, 100) + '...');
        
        // Check if preview would be available
        const hasPreview = !!(citation.pdf_url || citation.official_url);
        console.log('🖼️  Preview Available:', hasPreview ? 'YES' : 'NO');
      });
      
      // Summary
      const citationsWithUrls = result.citations.filter(c => c.pdf_url || c.official_url);
      console.log(`\n📈 Summary:`);
      console.log(`   Total citations: ${result.citations.length}`);
      console.log(`   Citations with URLs: ${citationsWithUrls.length}`);
      console.log(`   Citations missing URLs: ${result.citations.length - citationsWithUrls.length}`);
      
      if (citationsWithUrls.length === 0) {
        console.log('❌ ISSUE: No citations have URLs - this explains the "No Document Preview Available"');
      } else {
        console.log('✅ Some citations have URLs - overlay should show previews');
      }
      
    } else {
      console.log('❌ No citations found in result');
    }
    
    console.log('\n📝 Raw result data (first 500 chars):');
    console.log(result.data?.substring(0, 500) + '...');
    
  } catch (error) {
    console.error('❌ Tool execution failed:', error);
  }
}

// Run the test
testRegulatoryTool().catch(console.error);