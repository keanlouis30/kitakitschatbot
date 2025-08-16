const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./chatbot.db');

console.log('Checking sales data in database...\n');

// Check table structure
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='sales_transactions'", [], (err, row) => {
  if (err) {
    console.error('Error checking for sales_transactions table:', err);
  } else if (!row) {
    console.log('❌ sales_transactions table does not exist!');
  } else {
    console.log('✅ sales_transactions table exists');
    
    // Check sales data
    db.all('SELECT * FROM sales_transactions ORDER BY sale_date DESC LIMIT 20', [], (err, rows) => {
      if (err) {
        console.error('Error querying sales:', err);
      } else {
        console.log(`📊 Found ${rows.length} sales records:`);
        if (rows.length > 0) {
          rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.item_name} - Sold: ${row.quantity_sold} @ ₱${row.unit_price} = ₱${row.total_amount} (${row.sale_date})`);
          });
        } else {
          console.log('No sales records found');
        }
      }
      
      // Check inventory items
      db.all('SELECT * FROM inventory_items ORDER BY updated_at DESC LIMIT 10', [], (err, items) => {
        if (err) {
          console.error('Error querying inventory:', err);
        } else {
          console.log(`\n📦 Found ${items.length} inventory items:`);
          items.forEach((item, index) => {
            console.log(`${index + 1}. ${item.item_name} - Stock: ${item.quantity} ${item.unit} @ ₱${item.price}`);
          });
        }
        
        // Check recent interactions
        db.all('SELECT * FROM interactions ORDER BY timestamp DESC LIMIT 10', [], (err, interactions) => {
          if (err) {
            console.error('Error querying interactions:', err);
          } else {
            console.log(`\n💬 Found ${interactions.length} recent interactions:`);
            interactions.forEach((interaction, index) => {
              console.log(`${index + 1}. ${interaction.sender_id}: ${interaction.content} (${interaction.timestamp})`);
            });
          }
          db.close();
        });
      });
    });
  }
});
