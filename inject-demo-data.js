/**
 * Demo Data Injection Script for KitaKits Analytics
 * 
 * This script injects realistic sample data into the backend database
 * to demonstrate the analytics dashboard with meaningful data.
 */

const databaseModule = require('./modules/database');

// Demo data configuration
const DEMO_CONFIG = {
  users: 45,
  interactionsPerUser: 15,
  inventoryItemsPerUser: 8,
  salesPerUser: 5,
  timeRangeDays: 30
};

// Filipino cities and regions for realistic geographic data
const PHILIPPINES_LOCATIONS = [
  { city: 'Manila', region: 'Metro Manila', latitude: 14.5995, longitude: 120.9842 },
  { city: 'Quezon City', region: 'Metro Manila', latitude: 14.6760, longitude: 121.0437 },
  { city: 'Makati', region: 'Metro Manila', latitude: 14.5547, longitude: 121.0244 },
  { city: 'Cebu City', region: 'Central Visayas', latitude: 10.3157, longitude: 123.8854 },
  { city: 'Davao City', region: 'Davao Region', latitude: 7.0731, longitude: 125.6128 },
  { city: 'Iloilo City', region: 'Western Visayas', latitude: 10.7202, longitude: 122.5621 },
  { city: 'Taguig', region: 'Metro Manila', latitude: 14.5176, longitude: 121.0509 },
  { city: 'Pasig', region: 'Metro Manila', latitude: 14.5764, longitude: 121.0851 },
  { city: 'Marikina', region: 'Metro Manila', latitude: 14.6507, longitude: 121.1029 },
  { city: 'Caloocan', region: 'Metro Manila', latitude: 14.6488, longitude: 120.9668 },
  { city: 'Bacolod', region: 'Western Visayas', latitude: 10.6765, longitude: 122.9540 },
  { city: 'Cagayan de Oro', region: 'Northern Mindanao', latitude: 8.4542, longitude: 124.6319 }
];

// Typical Filipino MSME inventory items
const INVENTORY_ITEMS = [
  { name: 'Jasmine Rice 25kg', category: 'Staples', basePrice: 1250, unit: 'sack' },
  { name: 'Cooking Oil 1L', category: 'Cooking', basePrice: 85, unit: 'bottle' },
  { name: 'Instant Noodles', category: 'Processed', basePrice: 12, unit: 'pack' },
  { name: 'Sugar 1kg', category: 'Staples', basePrice: 65, unit: 'kg' },
  { name: 'Canned Sardines', category: 'Processed', basePrice: 28, unit: 'can' },
  { name: 'Coffee 3-in-1', category: 'Beverages', basePrice: 8, unit: 'sachet' },
  { name: 'Laundry Soap', category: 'Household', basePrice: 15, unit: 'bar' },
  { name: 'Milk Powder 400g', category: 'Dairy', basePrice: 180, unit: 'pack' },
  { name: 'Bread Loaf', category: 'Bakery', basePrice: 35, unit: 'loaf' },
  { name: 'Eggs 12pcs', category: 'Fresh', basePrice: 95, unit: 'tray' },
  { name: 'Soy Sauce 1L', category: 'Condiments', basePrice: 45, unit: 'bottle' },
  { name: 'Fish Sauce 350ml', category: 'Condiments', basePrice: 35, unit: 'bottle' },
  { name: 'White Onions 1kg', category: 'Fresh', basePrice: 120, unit: 'kg' },
  { name: 'Garlic 250g', category: 'Fresh', basePrice: 80, unit: 'pack' },
  { name: 'Tomatoes 1kg', category: 'Fresh', basePrice: 90, unit: 'kg' },
  { name: 'Banana Cue Stick', category: 'Snacks', basePrice: 15, unit: 'piece' },
  { name: 'Load Card P100', category: 'Services', basePrice: 100, unit: 'card' },
  { name: 'Load Card P50', category: 'Services', basePrice: 50, unit: 'card' },
  { name: 'Cigarettes Marlboro', category: 'Tobacco', basePrice: 150, unit: 'pack' },
  { name: 'Soft Drinks 1.5L', category: 'Beverages', basePrice: 65, unit: 'bottle' }
];

// Common interactions for Filipino MSME users
const INTERACTION_TYPES = [
  'Add Instant Noodles 12 50pcs',
  'Sold Rice 5kg',
  'Stock Cooking Oil',
  'Dagdag Coffee 8 100pcs',
  'Nabenta Sardines 10cans',
  'Check low stock',
  'Summary',
  'Add Load Card 100 20pcs',
  'Price ng Sugar',
  'Inventory list',
  'Sale Bread 5loaves',
  'Expiry check',
  'Add Eggs 95 5trays',
  'Daily sales'
];

/**
 * Generate a random date within the last N days
 */
function randomDateWithinDays(days) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  return new Date(pastDate.getTime() + Math.random() * (now.getTime() - pastDate.getTime()));
}

/**
 * Generate a random Filipino user ID
 */
function generateUserId(index) {
  return `demo_user_${String(index).padStart(3, '0')}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Add price variation based on location (urban vs rural)
 */
function adjustPriceByLocation(basePrice, location) {
  const urbanAreas = ['Manila', 'Quezon City', 'Makati', 'Taguig', 'Pasig'];
  const multiplier = urbanAreas.includes(location.city) ? 
    1.1 + Math.random() * 0.2 : // Urban: 10-30% higher
    0.85 + Math.random() * 0.2; // Rural: 15% lower to 5% higher
  
  return Math.round(basePrice * multiplier);
}

/**
 * Inject demo user interactions
 */
async function injectUserInteractions() {
  console.log('🗣️ Injecting user interactions...');
  const interactions = [];
  
  for (let userIndex = 0; userIndex < DEMO_CONFIG.users; userIndex++) {
    const userId = generateUserId(userIndex);
    const userInteractionCount = Math.floor(Math.random() * 10) + DEMO_CONFIG.interactionsPerUser;
    
    for (let i = 0; i < userInteractionCount; i++) {
      const interaction = {
        senderId: userId,
        messageType: Math.random() > 0.3 ? 'text' : 'image',
        content: INTERACTION_TYPES[Math.floor(Math.random() * INTERACTION_TYPES.length)],
        timestamp: randomDateWithinDays(DEMO_CONFIG.timeRangeDays).toISOString()
      };
      
      try {
        await databaseModule.insertInteraction(interaction);
        interactions.push(interaction);
      } catch (error) {
        console.error('Error inserting interaction:', error);
      }
    }
  }
  
  console.log(`✅ Inserted ${interactions.length} user interactions`);
  return interactions;
}

/**
 * Inject demo OCR results
 */
async function injectOCRResults() {
  console.log('📱 Injecting OCR results...');
  const ocrResults = [];
  
  const sampleOCRTexts = [
    'SM RECEIPT\nCoca Cola 1.5L - P65.00\nInstant Noodles x5 - P60.00\nTotal: P125.00',
    'PUREGOLD\nJasmine Rice 5kg - P275.00\nCooking Oil 1L - P85.00\nSugar 1kg - P65.00\nTotal: P425.00',
    'SARI-SARI STORE\nLoad P100 x3 = P300.00\nCigarette x2 = P300.00\nTotal: P600.00',
    'GROCERY RECEIPT\nEggs 1 tray - P95.00\nBread loaf x2 - P70.00\nMilk powder - P180.00\nTotal: P345.00'
  ];
  
  for (let userIndex = 0; userIndex < DEMO_CONFIG.users; userIndex++) {
    const userId = generateUserId(userIndex);
    const ocrCount = Math.floor(Math.random() * 3) + 1; // 1-3 OCR results per user
    
    for (let i = 0; i < ocrCount; i++) {
      const ocrResult = {
        senderId: userId,
        imageUrl: `https://demo.kitakits.com/receipt_${userIndex}_${i}.jpg`,
        extractedText: sampleOCRTexts[Math.floor(Math.random() * sampleOCRTexts.length)],
        confidence: 0.75 + Math.random() * 0.2, // 75-95% confidence
        timestamp: randomDateWithinDays(DEMO_CONFIG.timeRangeDays).toISOString()
      };
      
      try {
        await databaseModule.insertOCRResult(ocrResult);
        ocrResults.push(ocrResult);
      } catch (error) {
        console.error('Error inserting OCR result:', error);
      }
    }
  }
  
  console.log(`✅ Inserted ${ocrResults.length} OCR results`);
  return ocrResults;
}

/**
 * Inject demo user locations
 */
async function injectUserLocations() {
  console.log('📍 Injecting user locations...');
  const locations = [];
  
  for (let userIndex = 0; userIndex < DEMO_CONFIG.users; userIndex++) {
    const userId = generateUserId(userIndex);
    const location = PHILIPPINES_LOCATIONS[Math.floor(Math.random() * PHILIPPINES_LOCATIONS.length)];
    
    // Add small random variations to coordinates (within ~1km radius)
    const latVariation = (Math.random() - 0.5) * 0.01;
    const lonVariation = (Math.random() - 0.5) * 0.01;
    
    const userLocation = {
      senderId: userId,
      latitude: location.latitude + latVariation,
      longitude: location.longitude + lonVariation,
      address: `${Math.floor(Math.random() * 999) + 1} ${['Rizal St', 'Mabini Ave', 'Del Pilar St', 'Luna St', 'Bonifacio Ave'][Math.floor(Math.random() * 5)]}, ${location.city}`,
      city: location.city,
      region: location.region,
      country: 'Philippines',
      locationSource: Math.random() > 0.5 ? 'manual' : 'gps',
      accuracyMeters: Math.floor(Math.random() * 100) + 10,
      isPrimary: true
    };
    
    try {
      await databaseModule.insertUserLocation(userLocation);
      locations.push(userLocation);
    } catch (error) {
      console.error('Error inserting user location:', error);
    }
  }
  
  console.log(`✅ Inserted ${locations.length} user locations`);
  return locations;
}

/**
 * Inject demo inventory items
 */
async function injectInventoryItems(locations) {
  console.log('📦 Injecting inventory items...');
  const inventoryItems = [];
  
  for (let userIndex = 0; userIndex < DEMO_CONFIG.users; userIndex++) {
    const userId = generateUserId(userIndex);
    const userLocation = locations[userIndex];
    const itemCount = Math.floor(Math.random() * 5) + DEMO_CONFIG.inventoryItemsPerUser;
    
    // Select random items for this store
    const selectedItems = [...INVENTORY_ITEMS].sort(() => 0.5 - Math.random()).slice(0, itemCount);
    
    for (const item of selectedItems) {
      const adjustedPrice = adjustPriceByLocation(item.basePrice, userLocation);
      const quantity = Math.floor(Math.random() * 50) + 10; // 10-60 items
      
      const inventoryItem = {
        senderId: userId,
        itemName: item.name,
        price: adjustedPrice,
        quantity: quantity,
        unit: item.unit,
        category: item.category,
        expiryDate: ['Fresh', 'Dairy', 'Bakery'].includes(item.category) ? 
          new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : 
          null
      };
      
      try {
        await databaseModule.addInventoryItem(inventoryItem);
        inventoryItems.push(inventoryItem);
      } catch (error) {
        console.error('Error inserting inventory item:', error);
      }
    }
  }
  
  console.log(`✅ Inserted ${inventoryItems.length} inventory items`);
  return inventoryItems;
}

/**
 * Inject demo sales transactions
 */
async function injectSalesTransactions() {
  console.log('💰 Injecting sales transactions...');
  const salesTransactions = [];
  
  for (let userIndex = 0; userIndex < DEMO_CONFIG.users; userIndex++) {
    const userId = generateUserId(userIndex);
    const salesCount = Math.floor(Math.random() * 8) + DEMO_CONFIG.salesPerUser;
    
    // Get user's inventory items
    try {
      const userItems = await databaseModule.getAllInventoryItems(userId, 20);
      
      for (let i = 0; i < salesCount && i < userItems.length; i++) {
        const item = userItems[Math.floor(Math.random() * userItems.length)];
        const quantitySold = Math.min(
          Math.floor(Math.random() * 5) + 1, // Sell 1-5 items
          Math.floor(item.quantity * 0.3) // Don't sell more than 30% of stock
        );
        
        if (quantitySold > 0) {
          const saleData = {
            senderId: userId,
            itemName: item.item_name,
            quantitySold: quantitySold,
            unitPrice: item.price,
            totalAmount: item.price * quantitySold
          };
          
          try {
            await databaseModule.recordSale(saleData);
            salesTransactions.push(saleData);
          } catch (error) {
            console.error('Error recording sale:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error getting user inventory:', error);
    }
  }
  
  console.log(`✅ Inserted ${salesTransactions.length} sales transactions`);
  return salesTransactions;
}

/**
 * Inject demo analytics data points
 */
async function injectAnalyticsData() {
  console.log('📊 Injecting analytics data points...');
  const analyticsData = [];
  
  const dataTypes = [
    { type: 'user_interaction', categories: ['text', 'image', 'quick_reply'] },
    { type: 'business_activity', categories: ['inventory_add', 'sale_record', 'price_update'] },
    { type: 'location_collection', categories: ['manual', 'gps', 'ip'] },
    { type: 'ocr_processing', categories: ['receipt', 'invoice', 'text_document'] }
  ];
  
  for (let userIndex = 0; userIndex < DEMO_CONFIG.users; userIndex++) {
    const userId = generateUserId(userIndex);
    
    for (const dataType of dataTypes) {
      const pointCount = Math.floor(Math.random() * 5) + 2; // 2-6 data points per type per user
      
      for (let i = 0; i < pointCount; i++) {
        const category = dataType.categories[Math.floor(Math.random() * dataType.categories.length)];
        
        const analyticsPoint = {
          dataType: dataType.type,
          category: category,
          value: `demo_value_${i}`,
          metadata: {
            source: 'demo_data_injection',
            userLocation: PHILIPPINES_LOCATIONS[userIndex % PHILIPPINES_LOCATIONS.length].city,
            timestamp: randomDateWithinDays(DEMO_CONFIG.timeRangeDays).toISOString()
          },
          senderId: userId
        };
        
        try {
          await databaseModule.insertAnalyticsData(analyticsPoint);
          analyticsData.push(analyticsPoint);
        } catch (error) {
          console.error('Error inserting analytics data:', error);
        }
      }
    }
  }
  
  console.log(`✅ Inserted ${analyticsData.length} analytics data points`);
  return analyticsData;
}

/**
 * Complete user consent for all demo users
 */
async function completeUserConsent() {
  console.log('✅ Completing user consent for demo users...');
  
  for (let userIndex = 0; userIndex < DEMO_CONFIG.users; userIndex++) {
    const userId = generateUserId(userIndex);
    
    try {
      await databaseModule.initializeUserConsent(userId);
      await databaseModule.updateUserConsent(userId, 'consent', true);
      await databaseModule.updateUserConsent(userId, 'data_handling', true);
      await databaseModule.updateUserConsent(userId, 'data_sharing', true);
      await databaseModule.updateUserConsent(userId, 'eula', true);
      await databaseModule.completeUserConsent(userId);
    } catch (error) {
      console.error('Error completing user consent:', error);
    }
  }
  
  console.log(`✅ Completed consent for ${DEMO_CONFIG.users} demo users`);
}

/**
 * Main injection function
 */
async function injectDemoData() {
  console.log('🚀 Starting KitaKits demo data injection...');
  console.log(`📊 Configuration: ${DEMO_CONFIG.users} users, ${DEMO_CONFIG.timeRangeDays} days of data`);
  
  try {
    // Initialize database
    databaseModule.initializeDB();
    
    // Wait a bit for database to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Inject data in logical order
    const interactions = await injectUserInteractions();
    const ocrResults = await injectOCRResults();
    const locations = await injectUserLocations();
    const inventoryItems = await injectInventoryItems(locations);
    const salesTransactions = await injectSalesTransactions();
    const analyticsData = await injectAnalyticsData();
    await completeUserConsent();
    
    // Final summary
    console.log('🎉 Demo data injection completed successfully!');
    console.log('📈 Summary:');
    console.log(`   👥 Users: ${DEMO_CONFIG.users}`);
    console.log(`   💬 Interactions: ${interactions.length}`);
    console.log(`   📱 OCR Results: ${ocrResults.length}`);
    console.log(`   📍 Locations: ${locations.length}`);
    console.log(`   📦 Inventory Items: ${inventoryItems.length}`);
    console.log(`   💰 Sales Transactions: ${salesTransactions.length}`);
    console.log(`   📊 Analytics Data Points: ${analyticsData.length}`);
    console.log('');
    console.log('🚀 Your analytics dashboard should now show live data!');
    console.log('🔗 Visit: https://kitakitachatbot.onrender.com/analytics');
    
  } catch (error) {
    console.error('❌ Error during demo data injection:', error);
    process.exit(1);
  }
}

// Run the injection if this script is executed directly
if (require.main === module) {
  injectDemoData()
    .then(() => {
      console.log('✨ Demo data injection completed. Exiting...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Demo data injection failed:', error);
      process.exit(1);
    });
}

module.exports = {
  injectDemoData,
  DEMO_CONFIG,
  PHILIPPINES_LOCATIONS,
  INVENTORY_ITEMS
};
