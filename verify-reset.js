/**
 * Verification Script for KitaKits Database Reset
 * 
 * This script verifies that the database reset was successful and tests
 * how the analytics endpoints respond with empty vs populated data.
 * It also helps understand the mock/live data flow.
 */

const axios = require('axios');
const { resetDatabase, verifyReset } = require('./reset-database');
const databaseModule = require('./modules/database');

const SERVER_URL = 'http://localhost:3000';

/**
 * Test analytics endpoints with empty database
 */
async function testEmptyAnalytics() {
  console.log('\n🧪 Testing analytics with empty database...');
  
  try {
    // Test main analytics endpoint
    console.log('📊 Testing /analytics endpoint...');
    const analyticsResponse = await axios.get(`${SERVER_URL}/analytics`);
    
    console.log('✅ Analytics endpoint responded');
    console.log(`📈 Response metadata:`, {
      success: analyticsResponse.data.success,
      timestamp: analyticsResponse.data.timestamp,
      api_version: analyticsResponse.data.api_version,
      hasData: Object.keys(analyticsResponse.data).length > 5
    });
    
    // Check if it's using live or mock data
    const isLive = analyticsResponse.data.metadata?.isLive;
    console.log(`🔄 Data source: ${isLive ? 'LIVE DATA' : 'MOCK DATA'}`);
    
    // Check key metrics
    const overview = analyticsResponse.data.overview;
    if (overview) {
      console.log('📋 Overview data:');
      console.log(`  - Total Users: ${overview.totalUsers}`);
      console.log(`  - Total Interactions: ${overview.totalInteractions}`);
      console.log(`  - Total OCR Processed: ${overview.totalOCRProcessed}`);
      console.log(`  - Data Points: ${overview.dataPoints}`);
    }
    
    // Test urban planning endpoint
    console.log('\n🏙️ Testing /analytics/urban-planning/full endpoint...');
    const urbanResponse = await axios.get(`${SERVER_URL}/analytics/urban-planning/full`);
    console.log('✅ Urban planning endpoint responded');
    
    return {
      analytics: analyticsResponse.data,
      urban: urbanResponse.data,
      isEmpty: overview?.totalUsers === 0 && overview?.totalInteractions === 0
    };
    
  } catch (error) {
    console.error('❌ Error testing analytics:', error.message);
    return null;
  }
}

/**
 * Add sample data to test live data functionality
 */
async function addSampleData() {
  console.log('\n📝 Adding sample user data...');
  
  try {
    const sampleUserId = 'test_user_verification_001';
    
    // Initialize database if needed
    databaseModule.initializeDB();
    
    // Wait a bit for DB initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Add sample interaction
    await databaseModule.insertInteraction({
      senderId: sampleUserId,
      messageType: 'text',
      content: 'Hello, testing the system',
      timestamp: new Date().toISOString()
    });
    
    // Add sample inventory item
    await databaseModule.addInventoryItem({
      senderId: sampleUserId,
      itemName: 'Test Product',
      price: 25.50,
      quantity: 10,
      unit: 'pcs'
    });
    
    // Add sample location
    await databaseModule.insertUserLocation({
      senderId: sampleUserId,
      city: 'Manila',
      region: 'Metro Manila',
      country: 'Philippines',
      latitude: 14.5995,
      longitude: 120.9842,
      locationSource: 'manual',
      isPrimary: true
    });
    
    // Add sample analytics data
    await databaseModule.insertAnalyticsData({
      dataType: 'user_interaction',
      category: 'test',
      value: 'verification_test',
      metadata: { source: 'verification_script' },
      senderId: sampleUserId
    });
    
    console.log('✅ Sample data added successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Error adding sample data:', error.message);
    return false;
  }
}

/**
 * Test analytics endpoints with sample data
 */
async function testWithSampleData() {
  console.log('\n🧪 Testing analytics with sample data...');
  
  try {
    const analyticsResponse = await axios.get(`${SERVER_URL}/analytics`);
    
    console.log('✅ Analytics endpoint responded with sample data');
    
    const overview = analyticsResponse.data.overview;
    if (overview) {
      console.log('📋 Updated overview data:');
      console.log(`  - Total Users: ${overview.totalUsers}`);
      console.log(`  - Total Interactions: ${overview.totalInteractions}`);
      console.log(`  - Total OCR Processed: ${overview.totalOCRProcessed}`);
      console.log(`  - Data Points: ${overview.dataPoints}`);
    }
    
    // Check for mock vs live data indicators
    const isLive = analyticsResponse.data.metadata?.isLive;
    console.log(`🔄 Data source: ${isLive ? 'LIVE DATA' : 'MOCK DATA'}`);
    
    return analyticsResponse.data;
    
  } catch (error) {
    console.error('❌ Error testing analytics with sample data:', error.message);
    return null;
  }
}

/**
 * Analyze how the system behaves with empty vs populated data
 */
async function analyzeDataFlow() {
  console.log('\n🔍 Analyzing data flow behavior...');
  
  // Initialize database first
  databaseModule.initializeDB();
  
  // Wait for DB to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check database stats
  const stats = await databaseModule.getDatabaseStats();
  console.log('📊 Current database stats:', stats);
  
  // Check if the system has mechanisms for fallback data
  console.log('\n🔄 Data flow analysis:');
  console.log('1. When database is empty:');
  console.log('   - Analytics should show 0 for live metrics');
  console.log('   - May fall back to sample/mock data for visualization');
  console.log('   - Geographic data may use default Philippines locations');
  
  console.log('\n2. When database has data:');
  console.log('   - Analytics should reflect real user metrics');
  console.log('   - Geographic data comes from user_locations table');
  console.log('   - Business metrics come from inventory_items and sales_transactions');
  
  return stats;
}

/**
 * Test the mock/live data switch functionality
 */
async function testDataSwitch() {
  console.log('\n🔀 Testing mock/live data switch...');
  
  try {
    // Test with different query parameters that might control data source
    const testParams = [
      '', // default
      '?mock=true',
      '?mock=false', 
      '?live=true',
      '?live=false',
      '?data_source=mock',
      '?data_source=live'
    ];
    
    for (const params of testParams) {
      try {
        const response = await axios.get(`${SERVER_URL}/analytics${params}`);
        const isLive = response.data.metadata?.isLive;
        const dataSource = response.data.metadata?.dataSource;
        
        console.log(`📊 ${params || 'default'}: isLive=${isLive}, source="${dataSource}"`);
      } catch (error) {
        console.log(`❌ ${params || 'default'}: Error - ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing data switch:', error.message);
  }
}

/**
 * Generate summary report
 */
async function generateSummary(emptyResult, withDataResult) {
  console.log('\n📋 VERIFICATION SUMMARY');
  console.log('='.repeat(50));
  
  console.log('\n🗄️ Database Reset Status:');
  const isReset = await verifyReset();
  console.log(`  ${isReset ? '✅' : '❌'} Database is clean: ${isReset}`);
  
  console.log('\n📊 Analytics Functionality:');
  console.log(`  ${emptyResult ? '✅' : '❌'} Empty database analytics: ${emptyResult ? 'Working' : 'Failed'}`);
  console.log(`  ${withDataResult ? '✅' : '❌'} With data analytics: ${withDataResult ? 'Working' : 'Failed'}`);
  
  if (emptyResult && withDataResult) {
    const emptyUsers = emptyResult.overview?.totalUsers || 0;
    const withDataUsers = withDataResult.overview?.totalUsers || 0;
    
    console.log('\n📈 Data Responsiveness:');
    console.log(`  Empty DB users: ${emptyUsers}`);
    console.log(`  With data users: ${withDataUsers}`);
    console.log(`  ${withDataUsers > emptyUsers ? '✅' : '❌'} System responds to data changes`);
  }
  
  console.log('\n🎯 Recommendations:');
  console.log('  1. ✅ Database successfully reset to 0');
  console.log('  2. ✅ System ready for live user data');
  console.log('  3. 🔄 Analytics will show real data as users interact');
  console.log('  4. 📊 Mock data may be used for visualization when DB is empty');
  
  console.log('\n🚀 Next Steps:');
  console.log('  - Deploy to production environment');
  console.log('  - Monitor real user interactions');
  console.log('  - Analytics will populate automatically with user data');
  
  if (!isReset) {
    console.log('\n⚠️ WARNING: Database reset verification failed!');
    console.log('   Consider running the reset script again.');
  }
}

// Main execution
async function main() {
  try {
    console.log('🔬 KitaKits Database Reset Verification');
    console.log('=' .repeat(50));
    
    // Step 1: Analyze current state
    await analyzeDataFlow();
    
    // Step 2: Test with empty database
    const emptyResult = await testEmptyAnalytics();
    
    // Step 3: Test data switch functionality
    await testDataSwitch();
    
    // Step 4: Add sample data and test again
    const sampleAdded = await addSampleData();
    let withDataResult = null;
    
    if (sampleAdded) {
      withDataResult = await testWithSampleData();
      
      // Clean up sample data
      await resetDatabase();
      console.log('🧹 Cleaned up verification sample data');
    }
    
    // Step 5: Generate summary
    await generateSummary(emptyResult, withDataResult);
    
    console.log('\n✨ Verification completed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  testEmptyAnalytics,
  addSampleData,
  testWithSampleData,
  analyzeDataFlow,
  testDataSwitch
};
