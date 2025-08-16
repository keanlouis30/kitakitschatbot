const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const VERIFY_TOKEN = 'test_verify_token_123';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testEndpoint(method, endpoint, data = null, headers = {}) {
  try {
    console.log(`\n🔍 Testing ${method.toUpperCase()} ${endpoint}`);
    
    let response;
    if (method.toLowerCase() === 'get') {
      response = await axios.get(`${BASE_URL}${endpoint}`, { headers });
    } else if (method.toLowerCase() === 'post') {
      response = await axios.post(`${BASE_URL}${endpoint}`, data, { headers });
    }
    
    console.log(`✅ Status: ${response.status}`);
    console.log(`📄 Response:`, JSON.stringify(response.data, null, 2));
    return response;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`📄 Error Response:`, error.response.data);
      console.log(`📊 Status: ${error.response.status}`);
    }
    return null;
  }
}

async function testEndpoints() {
  console.log('🚀 Starting endpoint tests...\n');
  
  // Wait for server to start
  console.log('⏳ Waiting for server to start...');
  await sleep(3000);
  
  // Test 1: GET /webhook (webhook verification)
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 1: Webhook Verification');
  console.log('═══════════════════════════════════════');
  
  await testEndpoint('get', `/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=test_challenge_123`);
  
  // Test 2: GET /analytics (analytics endpoint)
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 2: Analytics Endpoint');
  console.log('═══════════════════════════════════════');
  
  await testEndpoint('get', '/analytics');
  
  // Test 3: GET /analytics with filters
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 3: Analytics with Filters');
  console.log('═══════════════════════════════════════');
  
  await testEndpoint('get', '/analytics?dataType=ocr&category=receipts&startDate=2024-01-01');
  
  // Test 4: POST /webhook (message handling)
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 4: Webhook Message Handling');
  console.log('═══════════════════════════════════════');
  
  const testMessage = {
    object: 'page',
    entry: [{
      messaging: [{
        sender: { id: 'test_user_123' },
        message: { text: 'Hello, this is a test message!' }
      }]
    }]
  };
  
  await testEndpoint('post', '/webhook', testMessage, {
    'Content-Type': 'application/json'
  });
  
  // Test 5: POST /webhook with image message
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 5: Webhook Image Message (Simulated)');
  console.log('═══════════════════════════════════════');
  
  const imageMessage = {
    object: 'page',
    entry: [{
      messaging: [{
        sender: { id: 'test_user_456' },
        message: { 
          attachments: [{
            type: 'image',
            payload: { url: 'https://via.placeholder.com/300x200.png?text=Test+Image' }
          }]
        }
      }]
    }]
  };
  
  await testEndpoint('post', '/webhook', imageMessage, {
    'Content-Type': 'application/json'
  });
  
  // Test 6: Invalid endpoint
  console.log('\n═══════════════════════════════════════');
  console.log('TEST 6: Invalid Endpoint (404 Test)');
  console.log('═══════════════════════════════════════');
  
  await testEndpoint('get', '/nonexistent-endpoint');
  
  console.log('\n🏁 Endpoint testing completed!');
  console.log('\n📋 SUMMARY:');
  console.log('- Webhook verification: Tests Facebook webhook setup');
  console.log('- Analytics endpoint: Tests data intelligence features');  
  console.log('- Message handling: Tests core chatbot functionality');
  console.log('- Image processing: Tests OCR integration');
  console.log('\n💡 Note: Some tests may fail if Facebook tokens are not configured.');
  console.log('💡 Image OCR test may fail without valid image URL or network access.');
}

if (require.main === module) {
  testEndpoints().catch(console.error);
}

module.exports = { testEndpoints };
