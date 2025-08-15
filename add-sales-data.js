/**
 * Add Sales Transactions to Demo Data
 * 
 * This script adds sales transactions based on existing inventory items
 */

const databaseModule = require('./modules/database');

async function addSalesTransactions() {
  console.log('💰 Adding sales transactions to existing inventory...');
  
  try {
    // Initialize database
    databaseModule.initializeDB();
    
    // Wait for database to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get database stats first
    const stats = await databaseModule.getDatabaseStats();
    console.log('📊 Current stats:', stats);
    
    // Get all interactions to find user IDs
    const sampleInteraction = await new Promise((resolve, reject) => {
      databaseModule.db.get('SELECT sender_id FROM interactions LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!sampleInteraction) {
      console.log('❌ No users found in database');
      return;
    }
    
    console.log('✅ Found users in database');
    
    // Get all unique user IDs
    const users = await new Promise((resolve, reject) => {
      databaseModule.db.all('SELECT DISTINCT sender_id FROM interactions LIMIT 10', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`👥 Found ${users.length} users`);
    
    let totalSales = 0;
    
    // Add sales for each user
    for (const user of users) {
      try {
        const userItems = await databaseModule.getAllInventoryItems(user.sender_id, 5);
        
        if (userItems.length > 0) {
          // Create 2-4 sales per user
          const salesCount = Math.floor(Math.random() * 3) + 2;
          
          for (let i = 0; i < Math.min(salesCount, userItems.length); i++) {
            const item = userItems[i];
            const quantitySold = Math.min(
              Math.floor(Math.random() * 3) + 1, // Sell 1-3 items
              Math.floor(item.quantity * 0.5) // Don't sell more than 50% of stock
            );
            
            if (quantitySold > 0) {
              const saleData = {
                senderId: user.sender_id,
                itemName: item.item_name,
                quantitySold: quantitySold,
                unitPrice: item.price,
                totalAmount: item.price * quantitySold
              };
              
              try {
                await databaseModule.recordSale(saleData);
                totalSales++;
                console.log(`✅ Sale: ${item.item_name} x${quantitySold} = ₱${saleData.totalAmount}`);
              } catch (error) {
                console.error('Error recording sale:', error.message);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing user ${user.sender_id}:`, error.message);
      }
    }
    
    console.log(`✅ Added ${totalSales} sales transactions`);
    
    // Get updated stats
    const newStats = await databaseModule.getDatabaseStats();
    console.log('📊 Updated stats:', newStats);
    
  } catch (error) {
    console.error('❌ Error adding sales:', error);
  }
}

// Run the script
if (require.main === module) {
  addSalesTransactions()
    .then(() => {
      console.log('✨ Sales data addition completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to add sales data:', error);
      process.exit(1);
    });
}
