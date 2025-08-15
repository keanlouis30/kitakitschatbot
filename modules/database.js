const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, '..', 'chatbot.db');
let db;

/**
 * Initialize SQLite database and create tables
 */
function initializeDB() {
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      return;
    }
    console.log('Connected to SQLite database');
  });
  
  // Create tables
  db.serialize(() => {
    // User interactions table
    db.run(`
      CREATE TABLE IF NOT EXISTS interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating interactions table:', err);
      else console.log('Interactions table ready');
    });
    
    // OCR results table
    db.run(`
      CREATE TABLE IF NOT EXISTS ocr_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL,
        image_url TEXT,
        extracted_text TEXT,
        confidence REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating ocr_results table:', err);
      else console.log('OCR results table ready');
    });
    
    // Analytics data table
    db.run(`
      CREATE TABLE IF NOT EXISTS analytics_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type TEXT NOT NULL,
        category TEXT,
        value TEXT,
        metadata TEXT,
        sender_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating analytics_data table:', err);
      else console.log('Analytics data table ready');
    });
    
    // User summaries table
    db.run(`
      CREATE TABLE IF NOT EXISTS summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL,
        summary_type TEXT,
        summary_text TEXT,
        data_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating summaries table:', err);
      else console.log('Summaries table ready');
    });
    
    // Inventory items table
    db.run(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        price REAL,
        quantity INTEGER DEFAULT 0,
        unit TEXT DEFAULT 'pcs',
        category TEXT,
        expiry_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating inventory_items table:', err);
      else console.log('Inventory items table ready');
    });
    
    // Sales transactions table
    db.run(`
      CREATE TABLE IF NOT EXISTS sales_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        quantity_sold INTEGER NOT NULL,
        unit_price REAL,
        total_amount REAL,
        sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating sales_transactions table:', err);
      else console.log('Sales transactions table ready');
    });
  });
}

/**
 * Insert user interaction
 */
function insertInteraction(data) {
  return new Promise((resolve, reject) => {
    const { senderId, messageType, content, timestamp } = data;
    
    db.run(
      `INSERT INTO interactions (sender_id, message_type, content, timestamp) 
       VALUES (?, ?, ?, ?)`,
      [senderId, messageType, content, timestamp],
      function(err) {
        if (err) {
          console.error('Error inserting interaction:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID, ...data });
        }
      }
    );
  });
}

/**
 * Insert OCR result
 */
function insertOCRResult(data) {
  return new Promise((resolve, reject) => {
    const { senderId, imageUrl, extractedText, confidence = 0.0, timestamp } = data;
    
    db.run(
      `INSERT INTO ocr_results (sender_id, image_url, extracted_text, confidence, timestamp) 
       VALUES (?, ?, ?, ?, ?)`,
      [senderId, imageUrl, extractedText, confidence, timestamp],
      function(err) {
        if (err) {
          console.error('Error inserting OCR result:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID, ...data });
        }
      }
    );
  });
}

/**
 * Insert analytics data point
 */
function insertAnalyticsData(data) {
  return new Promise((resolve, reject) => {
    const { dataType, category, value, metadata, senderId } = data;
    
    db.run(
      `INSERT INTO analytics_data (data_type, category, value, metadata, sender_id) 
       VALUES (?, ?, ?, ?, ?)`,
      [dataType, category, value, JSON.stringify(metadata), senderId],
      function(err) {
        if (err) {
          console.error('Error inserting analytics data:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID, ...data });
        }
      }
    );
  });
}

/**
 * Get all interactions for a user
 */
function getUserInteractions(senderId, limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM interactions 
       WHERE sender_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [senderId, limit],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

/**
 * Get OCR results for a user
 */
function getUserOCRResults(senderId, limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM ocr_results 
       WHERE sender_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [senderId, limit],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

/**
 * Get analytics data
 */
function getAnalyticsData(filters = {}) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM analytics_data WHERE 1=1';
    const params = [];
    
    if (filters.dataType) {
      query += ' AND data_type = ?';
      params.push(filters.dataType);
    }
    
    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    
    if (filters.startDate) {
      query += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Insert summary
 */
function insertSummary(data) {
  return new Promise((resolve, reject) => {
    const { senderId, summaryType, summaryText, dataCount } = data;
    
    db.run(
      `INSERT INTO summaries (sender_id, summary_type, summary_text, data_count) 
       VALUES (?, ?, ?, ?)`,
      [senderId, summaryType, summaryText, dataCount],
      function(err) {
        if (err) {
          console.error('Error inserting summary:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID, ...data });
        }
      }
    );
  });
}

/**
 * Get database statistics
 */
function getDatabaseStats() {
  return new Promise((resolve, reject) => {
    const stats = {};
    
    db.serialize(() => {
      db.get('SELECT COUNT(*) as count FROM interactions', (err, row) => {
        if (!err) stats.totalInteractions = row.count;
      });
      
      db.get('SELECT COUNT(*) as count FROM ocr_results', (err, row) => {
        if (!err) stats.totalOCRResults = row.count;
      });
      
      db.get('SELECT COUNT(DISTINCT sender_id) as count FROM interactions', (err, row) => {
        if (!err) stats.uniqueUsers = row.count;
        resolve(stats);
      });
    });
  });
}

/**
 * Add or update inventory item
 */
function addInventoryItem(data) {
  return new Promise((resolve, reject) => {
    const { senderId, itemName, price, quantity = 0, unit = 'pcs', category, expiryDate } = data;
    
    // Check if item already exists
    db.get(
      `SELECT * FROM inventory_items WHERE sender_id = ? AND LOWER(item_name) = LOWER(?)`,
      [senderId, itemName],
      (err, existing) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (existing) {
          // Update existing item
          db.run(
            `UPDATE inventory_items 
             SET quantity = quantity + ?, price = ?, unit = ?, category = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
             WHERE sender_id = ? AND LOWER(item_name) = LOWER(?)`,
            [quantity, price, unit, category, expiryDate, senderId, itemName],
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve({ id: existing.id, updated: true, newQuantity: existing.quantity + quantity });
              }
            }
          );
        } else {
          // Insert new item
          db.run(
            `INSERT INTO inventory_items (sender_id, item_name, price, quantity, unit, category, expiry_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [senderId, itemName, price, quantity, unit, category, expiryDate],
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve({ id: this.lastID, created: true, quantity });
              }
            }
          );
        }
      }
    );
  });
}

/**
 * Get inventory item by name
 */
function getInventoryItem(senderId, itemName) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM inventory_items 
       WHERE sender_id = ? AND LOWER(item_name) = LOWER(?)`,
      [senderId, itemName],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

/**
 * Search inventory items (partial match)
 */
function searchInventoryItems(senderId, searchTerm) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM inventory_items 
       WHERE sender_id = ? AND LOWER(item_name) LIKE LOWER(?)
       ORDER BY item_name ASC`,
      [senderId, `%${searchTerm}%`],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

/**
 * Get all inventory items for a user
 */
function getAllInventoryItems(senderId, limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM inventory_items 
       WHERE sender_id = ? 
       ORDER BY updated_at DESC 
       LIMIT ?`,
      [senderId, limit],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

/**
 * Record a sale transaction
 */
function recordSale(data) {
  return new Promise((resolve, reject) => {
    const { senderId, itemName, quantitySold, unitPrice, totalAmount } = data;
    
    db.serialize(() => {
      // Record the sale
      db.run(
        `INSERT INTO sales_transactions (sender_id, item_name, quantity_sold, unit_price, total_amount) 
         VALUES (?, ?, ?, ?, ?)`,
        [senderId, itemName, quantitySold, unitPrice, totalAmount],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          
          const saleId = this.lastID;
          
          // Update inventory quantity
          db.run(
            `UPDATE inventory_items 
             SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE sender_id = ? AND LOWER(item_name) = LOWER(?)`,
            [quantitySold, senderId, itemName],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve({ saleId, itemName, quantitySold, totalAmount });
              }
            }
          );
        }
      );
    });
  });
}

/**
 * Get low stock items
 */
function getLowStockItems(senderId, threshold = 5) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM inventory_items 
       WHERE sender_id = ? AND quantity <= ? AND quantity > 0
       ORDER BY quantity ASC`,
      [senderId, threshold],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

/**
 * Get sales summary for a date range
 */
function getSalesSummary(senderId, days = 1) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT item_name, SUM(quantity_sold) as total_sold, SUM(total_amount) as total_revenue, COUNT(*) as transaction_count
       FROM sales_transactions 
       WHERE sender_id = ? AND sale_date >= datetime('now', '-${days} days')
       GROUP BY item_name
       ORDER BY total_revenue DESC`,
      [senderId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

/**
 * Get items expiring within specified days
 */
function getExpiringItems(senderId, days = 7) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM inventory_items 
       WHERE sender_id = ? AND expiry_date IS NOT NULL 
       AND date(expiry_date) <= date('now', '+${days} days')
       AND date(expiry_date) >= date('now')
       ORDER BY expiry_date ASC`,
      [senderId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

module.exports = {
  initializeDB,
  insertInteraction,
  insertOCRResult,
  insertAnalyticsData,
  getUserInteractions,
  getUserOCRResults,
  getAnalyticsData,
  insertSummary,
  getDatabaseStats,
  // Inventory management functions
  addInventoryItem,
  getInventoryItem,
  searchInventoryItems,
  getAllInventoryItems,
  recordSale,
  getLowStockItems,
  getSalesSummary,
  getExpiringItems
};
