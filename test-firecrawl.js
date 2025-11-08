#!/usr/bin/env node

/**
 * Firecrawl Test Script
 * 
 * Kör detta script för att testa din Firecrawl-integration isolerat.
 * 
 * Användning:
 *   node test-firecrawl.js
 *   
 * Eller med en specifik URL:
 *   node test-firecrawl.js https://example.com
 */

require('dotenv').config({ path: '.env.local' });

async function testFirecrawl() {
  console.log('=== FIRECRAWL DIAGNOSTIC TEST ===\n');
  
  // 1. Check environment
  console.log('1. Environment Check:');
  console.log('   Node version:', process.version);
  console.log('   Platform:', process.platform);
  
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error('   ❌ FIRECRAWL_API_KEY not found in environment');
    console.log('\n   Add to .env.local:');
    console.log('   FIRECRAWL_API_KEY=fc-your-key-here');
    process.exit(1);
  }
  
  console.log('   ✅ FIRECRAWL_API_KEY found');
  console.log('   Key prefix:', apiKey.substring(0, 8) + '...');
  console.log('   Key length:', apiKey.length, 'characters');
  
  // 2. Check SDK installation
  console.log('\n2. SDK Check:');
  let FirecrawlApp;
  try {
    FirecrawlApp = require('@mendable/firecrawl-js').default;
    console.log('   ✅ @mendable/firecrawl-js installed');
    
    // Try to get version
    const packageJson = require('./node_modules/@mendable/firecrawl-js/package.json');
    console.log('   Version:', packageJson.version);
  } catch (error) {
    console.error('   ❌ @mendable/firecrawl-js not installed');
    console.log('\n   Install with:');
    console.log('   npm install @mendable/firecrawl-js');
    process.exit(1);
  }
  
  // 3. Test API connection
  console.log('\n3. API Test:');
  const testUrl = process.argv[2] || 'https://example.com';
  console.log('   Testing URL:', testUrl);
  
  const firecrawl = new FirecrawlApp({
    apiKey: apiKey
  });
  
  try {
    console.log('   Calling Firecrawl API...');
    const startTime = Date.now();
    
    const result = await firecrawl.scrape(testUrl, {
      formats: ['markdown', 'html'],
      onlyMainContent: true
    });
    
    const duration = Date.now() - startTime;
    console.log('   ✅ API call completed in', duration, 'ms');
    
    // 4. Analyze response
    console.log('\n4. Response Analysis:');
    console.log('   Response type:', typeof result);
    console.log('   Response keys:', Object.keys(result || {}).join(', '));
    
    // Firecrawl v4+ returns data directly without a success field
    const hasContent = result.markdown || result.html;
    
    if (hasContent) {
      console.log('   ✅ Content received');
      console.log('   Has markdown:', !!result.markdown);
      console.log('   Markdown length:', result.markdown?.length || 0, 'chars');
      console.log('   Has HTML:', !!result.html);
      console.log('   HTML length:', result.html?.length || 0, 'chars');
      console.log('   Has metadata:', !!result.metadata);
      
      if (result.metadata) {
        console.log('   Metadata keys:', Object.keys(result.metadata).join(', '));
        console.log('   Title:', result.metadata.title || 'N/A');
        console.log('   Description:', result.metadata.description?.substring(0, 100) || 'N/A');
      }
      
      // Show sample of markdown
      if (result.markdown) {
        console.log('\n   Markdown sample (first 200 chars):');
        console.log('   ---');
        console.log('   ' + result.markdown.substring(0, 200).replace(/\n/g, '\n   '));
        console.log('   ...');
      }
      
      console.log('\n✅ TEST PASSED - Firecrawl is working correctly!');
      
    } else {
      console.log('   ❌ No content returned');
      console.log('   Error:', result.error || 'No error message provided');
      
      console.log('\n❌ TEST FAILED - Firecrawl returned no content');
      console.log('\nPossible causes:');
      console.log('   1. Rate limit exceeded (500 requests/month on free tier)');
      console.log('   2. URL cannot be accessed by Firecrawl');
      console.log('   3. Website blocks scraping');
      console.log('\nCheck your dashboard: https://www.firecrawl.dev/dashboard');
    }
    
  } catch (error) {
    console.error('\n❌ API call failed:');
    console.error('   Error type:', error.constructor.name);
    console.error('   Error message:', error.message);
    
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('\n   This looks like an authentication error.');
      console.log('   Check that your API key is correct.');
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      console.log('\n   This looks like a rate limit error.');
      console.log('   You may have exceeded 500 requests/month.');
    }
    
    console.error('\nFull error details:');
    console.error(error);
    
    process.exit(1);
  }
}

console.log('Starting Firecrawl diagnostic test...\n');
testFirecrawl().catch(error => {
  console.error('\nUnexpected error:', error);
  process.exit(1);
});

