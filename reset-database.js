/**
 * Database Reset Script for KitaKits
 * 
 * This script clears all data from the database tables while preserving
 * the table structure. This allows you to start fresh with a clean database
 * that will reflect only real user data going forward.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, 'chatbot.db');

/**
 * Reset database by clearing all tables
 */
async function resetDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('🔌 Connected to SQLite database');
    });

    // Get counts before reset
    const getTableCounts = () => {
      return new Promise((resolve) => {
        const counts = {};
        
        db.serialize(() => {
          db.get('SELECT COUNT(*) as count FROM interactions', (err, row) => {
            if (!err) counts.interactions = row.count;
          });
          
          db.get('SELECT COUNT(*) as count FROM ocr_results', (err, row) => {
            if (!err) counts.ocr_results = row.count;
          });
          
          db.get('SELECT COUNT(*) as count FROM analytics_data', (err, row) => {
            if (!err) counts.analytics_data = row.count;
          });
          
          db.get('SELECT COUNT(*) as count FROM summaries', (err, row) => {
            if (!err) counts.summaries = row.count;
          });
          
          db.get('SELECT COUNT(*) as count FROM inventory_items', (err, row) => {
            if (!err) counts.inventory_items = row.count;
          });
          
          db.get('SELECT COUNT(*) as count FROM sales_transactions', (err, row) => {
            if (!err) counts.sales_transactions = row.count;
          });
          
          db.get('SELECT COUNT(*) as count FROM user_locations', (err, row) => {
            if (!err) counts.user_locations = row.count;
          });
          
          db.get('SELECT COUNT(*) as count FROM geographic_analytics', (err, row) => {
            if (!err) counts.geographic_analytics = row.count;
            resolve(counts);
          });
        });
      });
    };

    // Clear all tables
    const clearAllTables = () => {
      return new Promise((resolve, reject) => {
        db.serialize(() => {
          console.log('🧹 Clearing all data tables...');
          
          // Clear data tables (preserving user_consent to maintain privacy agreements)
          const clearStatements = [
            'DELETE FROM interactions',
            'DELETE FROM ocr_results', 
            'DELETE FROM analytics_data',
            'DELETE FROM summaries',
            'DELETE FROM inventory_items',
            'DELETE FROM sales_transactions',
            'DELETE FROM user_locations',
            'DELETE FROM geographic_analytics'
          ];
          
          let completed = 0;
          const total = clearStatements.length;
          
          clearStatements.forEach((statement, index) => {
            db.run(statement, function(err) {
              if (err) {
                console.error(`❌ Error executing: ${statement}`, err);
                reject(err);
                return;
              }
              
              console.log(`✅ Cleared table ${index + 1}/${total}: ${statement.split(' ')[2]} (${this.changes} rows removed)`);
              completed++;
              
              if (completed === total) {
                console.log('🎉 All data tables cleared successfully');
                resolve();
              }
            });
          });
        });
      });
    };

    // Reset auto-increment sequences
    const resetSequences = () => {
      return new Promise((resolve, reject) => {
        db.serialize(() => {
          console.log('🔄 Resetting auto-increment sequences...');
          
          const resetStatements = [
            "DELETE FROM sqlite_sequence WHERE name='interactions'",
            "DELETE FROM sqlite_sequence WHERE name='ocr_results'", 
            "DELETE FROM sqlite_sequence WHERE name='analytics_data'",
            "DELETE FROM sqlite_sequence WHERE name='summaries'",
            "DELETE FROM sqlite_sequence WHERE name='inventory_items'",
            "DELETE FROM sqlite_sequence WHERE name='sales_transactions'",
            "DELETE FROM sqlite_sequence WHERE name='user_locations'",
            "DELETE FROM sqlite_sequence WHERE name='geographic_analytics'"
          ];
          
          let completed = 0;
          const total = resetStatements.length;
          
          resetStatements.forEach((statement, index) => {
            db.run(statement, function(err) {
              if (err && !err.message.includes('no such table')) {
                console.error(`❌ Error resetting sequence: ${statement}`, err);
                reject(err);
                return;
              }
              
              console.log(`✅ Reset sequence ${index + 1}/${total}`);
              completed++;
              
              if (completed === total) {
                console.log('🎉 All sequences reset successfully');
                resolve();
              }
            });
          });
        });
      });
    };

    // Execute the reset process
    (async () => {
      try {
        console.log('📊 Getting table counts before reset...');
        const beforeCounts = await getTableCounts();
        
        console.log('📈 Current data counts:');
        Object.entries(beforeCounts).forEach(([table, count]) => {
          console.log(`  ${table}: ${count} records`);
        });
        
        console.log('\n🚀 Starting database reset...');
        
        await clearAllTables();
        await resetSequences();
        
        console.log('\n📊 Getting table counts after reset...');
        const afterCounts = await getTableCounts();
        
        console.log('📉 Final data counts:');
        Object.entries(afterCounts).forEach(([table, count]) => {
          console.log(`  ${table}: ${count} records`);
        });
        
        console.log('\n✨ Database reset completed successfully!');
        console.log('🔄 The database is now clean and ready for real user data only.');
        console.log('\n📝 Note: User consent records were preserved to maintain privacy agreements.');
        
        db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('🔌 Database connection closed');
          }
          resolve();
        });
        
      } catch (error) {
        console.error('❌ Error during database reset:', error);
        db.close();
        reject(error);
      }
    })();
  });
}

/**
 * Verify database is empty
 */
async function verifyReset() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
    });

    console.log('\n🔍 Verifying database reset...');
    
    const verificationQueries = [
      'SELECT COUNT(*) as count FROM interactions',
      'SELECT COUNT(*) as count FROM inventory_items',
      'SELECT COUNT(*) as count FROM sales_transactions',
      'SELECT COUNT(*) as count FROM analytics_data'
    ];
    
    let completed = 0;
    let allEmpty = true;
    
    verificationQueries.forEach((query, index) => {
      db.get(query, (err, row) => {
        if (err) {
          console.error(`❌ Error verifying: ${query}`, err);
          allEmpty = false;
        } else {
          const tableName = query.split(' FROM ')[1];
          console.log(`✅ ${tableName}: ${row.count} records`);
          if (row.count > 0) allEmpty = false;
        }
        
        completed++;
        if (completed === verificationQueries.length) {
          db.close();
          if (allEmpty) {
            console.log('\n🎉 Verification successful! Database is clean.');
          } else {
            console.log('\n⚠️  Some tables still contain data.');
          }
          resolve(allEmpty);
        }
      });
    });
  });
}

// Main execution
if (require.main === module) {
  (async () => {
    try {
      console.log('🗄️  KitaKits Database Reset Tool');
      console.log('================================\n');
      
      await resetDatabase();
      await verifyReset();
      
      console.log('\n✨ Database reset process completed!');
      console.log('🚀 Your application is now ready to collect fresh user data.');
      
    } catch (error) {
      console.error('❌ Database reset failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  resetDatabase,
  verifyReset
};
