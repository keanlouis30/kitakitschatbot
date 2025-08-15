const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
let serverProcess = null;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
  console.log('🚀 Starting server...');
  
  serverProcess = spawn('npm', ['start'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.log(`Server Error: ${data.toString().trim()}`);
  });

  // Wait for server to start
  await sleep(3000);
  
  // Test if server is responding
  try {
    await axios.get(`${BASE_URL}/analytics`);
    console.log('✅ Server is running and responding');
    return true;
  } catch (error) {
    console.log('❌ Server not responding yet, waiting longer...');
    await sleep(2000);
    try {
      await axios.get(`${BASE_URL}/analytics`);
      console.log('✅ Server is now responding');
      return true;
    } catch (error) {
      console.log('❌ Server failed to start properly');
      return false;
    }
  }
}

async function stopServer() {
  if (serverProcess) {
    console.log('🛑 Stopping server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

async function testEndpoint(name, method, endpoint, data = null) {
  try {
    console.log(`\n🔍 ${name}`);
    console.log(`   ${method.toUpperCase()} ${endpoint}`);
    
    let response;
    if (method.toLowerCase() === 'get') {
      response = await axios.get(`${BASE_URL}${endpoint}`);
    } else if (method.toLowerCase() === 'post') {
      response = await axios.post(`${BASE_URL}${endpoint}`, data, {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`   ✅ Status: ${response.status}`);
    
    // Show response preview
    let preview = '';
    if (typeof response.data === 'string') {
      preview = response.data.substring(0, 100);
    } else if (typeof response.data === 'object') {
      preview = JSON.stringify(response.data, null, 2).substring(0, 200);
    }
    
    if (preview) {
      console.log(`   📄 Response: ${preview}${preview.length >= 100 ? '...' : ''}`);
    }
    
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   📊 Status: ${error.response.status}`);
      console.log(`   📄 Response: ${JSON.stringify(error.response.data)}`);
    }
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════');
  console.log('🧪 KitaKits Chatbot Endpoint Testing');
  console.log('═══════════════════════════════════════');
  
  // Start server
  const serverStarted = await startServer();
  if (!serverStarted) {
    console.log('❌ Failed to start server. Exiting tests.');
    return;
  }
  
  const results = [];
  
  try {
    // Test 1: Webhook Verification
    results.push(await testEndpoint(
      'TEST 1: Webhook Verification',
      'GET', 
      '/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=test_challenge_123'
    ));
    
    // Test 2: Basic Analytics
    results.push(await testEndpoint(
      'TEST 2: Basic Analytics',
      'GET',
      '/analytics'
    ));
    
    // Test 3: Filtered Analytics
    results.push(await testEndpoint(
      'TEST 3: Filtered Analytics',
      'GET',
      '/analytics?dataType=ocr&category=receipts'
    ));
    
    // Test 4: Text Message Webhook
    const textMessage = {
      object: 'page',
      entry: [{
        messaging: [{
          sender: { id: 'test_user_123' },
          message: { text: 'Hello, this is a test message!' }
        }]
      }]
    };
    
    results.push(await testEndpoint(
      'TEST 4: Text Message Processing',
      'POST',
      '/webhook',
      textMessage
    ));
    
    // Test 5: Image Message Webhook
    const imageMessage = {
      object: 'page',
      entry: [{
        messaging: [{
          sender: { id: 'test_user_456' },
          message: {
            attachments: [{
              type: 'image',
              payload: { url: 'https://via.placeholder.com/300x200.png?text=Test+Receipt' }
            }]
          }
        }]
      }]
    };
    
    results.push(await testEndpoint(
      'TEST 5: Image Message Processing',
      'POST',
      '/webhook',
      imageMessage
    ));
    
    // Test 6: Invalid endpoint
    results.push(await testEndpoint(
      'TEST 6: Invalid Endpoint (404 Test)',
      'GET',
      '/nonexistent'
    ));
    
  } catch (error) {
    console.log(`\n❌ Testing error: ${error.message}`);
  } finally {
    await stopServer();
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════');
  
  const successful = results.filter(r => r && r.success).length;
  const total = results.length;
  
  console.log(`✅ Successful: ${successful}/${total}`);
  console.log(`❌ Failed: ${total - successful}/${total}`);
  
  console.log('\n📋 ENDPOINT STATUS:');
  results.forEach((result, index) => {
    if (result) {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`   Test ${index + 1}: ${status}`);
    }
  });
  
  console.log('\n💡 NOTES:');
  console.log('- Webhook verification should return the challenge token');
  console.log('- Analytics should return comprehensive JSON data');
  console.log('- Message processing should return "EVENT_RECEIVED"');
  console.log('- Image processing may fail without network access');
  console.log('- 404 errors are expected for invalid endpoints');
  
  console.log('\n🔍 DATABASE CHECK:');
  console.log('Run this to see stored data:');
  console.log('   sqlite3 chatbot.db "SELECT * FROM interactions;"');
  console.log('   sqlite3 chatbot.db "SELECT * FROM ocr_results;"');
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Received interrupt signal...');
  await stopServer();
  process.exit(0);
});

// Run tests
runTests().catch(console.error);
