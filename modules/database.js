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
    
    // User consent and policy acceptance table
    db.run(`
      CREATE TABLE IF NOT EXISTS user_consent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL UNIQUE,
        consent_given BOOLEAN DEFAULT 0,
        data_handling_accepted BOOLEAN DEFAULT 0,
        data_sharing_accepted BOOLEAN DEFAULT 0,
        eula_accepted BOOLEAN DEFAULT 0,
        all_policies_accepted BOOLEAN DEFAULT 0,
        consent_date DATETIME,
        data_handling_date DATETIME,
        data_sharing_date DATETIME,
        eula_date DATETIME,
        completed_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating user_consent table:', err);
      else console.log('User consent table ready');
    });
    
    // User locations and geographic data table
    db.run(`
      CREATE TABLE IF NOT EXISTS user_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        address TEXT,
        city TEXT,
        region TEXT,
        postal_code TEXT,
        country TEXT,
        location_source TEXT, -- 'manual', 'gps', 'ip', 'inferred'
        accuracy_meters REAL,
        is_primary BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating user_locations table:', err);
      else console.log('User locations table ready');
    });
    
    // Geographic analytics and insights table
    db.run(`
      CREATE TABLE IF NOT EXISTS geographic_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_key TEXT NOT NULL, -- city, region, or coordinate grid
        user_count INTEGER DEFAULT 0,
        transaction_count INTEGER DEFAULT 0,
        total_revenue REAL DEFAULT 0,
        avg_transaction_value REAL DEFAULT 0,
        top_items TEXT, -- JSON array of popular items
        activity_score REAL DEFAULT 0,
        period_type TEXT, -- 'daily', 'weekly', 'monthly'
        period_date TEXT, -- date string for the period
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating geographic_analytics table:', err);
      else console.log('Geographic analytics table ready');
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
    
    // Validate required fields
    if (!senderId) {
      reject(new Error('Sender ID is required'));
      return;
    }
    
    if (!itemName || itemName.trim() === '') {
      reject(new Error('Item name is required'));
      return;
    }
    
    if (price === undefined || price === null || isNaN(price)) {
      reject(new Error('Valid price is required'));
      return;
    }
    
    if (quantity === undefined || quantity === null || isNaN(quantity)) {
      reject(new Error('Valid quantity is required'));
      return;
    }
    
    console.log(`[DATABASE] Adding inventory item: ${JSON.stringify({
      senderId,
      itemName: itemName.trim(),
      price: Number(price),
      quantity: Number(quantity),
      unit,
      category: category || 'general'
    })}`);
    
    // Check if item already exists
    db.get(
      `SELECT * FROM inventory_items WHERE sender_id = ? AND LOWER(item_name) = LOWER(?)`,
      [senderId, itemName.trim()],
      (err, existing) => {
        if (err) {
          console.error('[DATABASE] Error checking existing item:', err);
          reject(err);
          return;
        }
        
        if (existing) {
          console.log('[DATABASE] Item exists, updating quantity');
          // Update existing item
          db.run(
            `UPDATE inventory_items 
             SET quantity = quantity + ?, price = ?, unit = ?, category = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
             WHERE sender_id = ? AND LOWER(item_name) = LOWER(?)`,
            [Number(quantity), Number(price), unit, category || 'general', expiryDate, senderId, itemName.trim()],
            function(err) {
              if (err) {
                console.error('[DATABASE] Error updating inventory item:', err);
                reject(err);
              } else {
                console.log('[DATABASE] Successfully updated inventory item');
                resolve({ id: existing.id, updated: true, newQuantity: existing.quantity + Number(quantity) });
              }
            }
          );
        } else {
          console.log('[DATABASE] Creating new inventory item');
          // Insert new item
          db.run(
            `INSERT INTO inventory_items (sender_id, item_name, price, quantity, unit, category, expiry_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [senderId, itemName.trim(), Number(price), Number(quantity), unit, category || 'general', expiryDate],
            function(err) {
              if (err) {
                console.error('[DATABASE] Error inserting inventory item:', err);
                reject(err);
              } else {
                console.log('[DATABASE] Successfully created inventory item');
                resolve({ id: this.lastID, created: true, quantity: Number(quantity) });
              }
            }
          );
        }
      }
    );
  });
}

/**
 * Get inventory item by name or ID
 */
function getInventoryItem(senderId, itemName, itemId) {
  return new Promise((resolve, reject) => {
    let query;
    let params;
    
    if (itemId) {
      // Get by ID
      query = `SELECT * FROM inventory_items WHERE sender_id = ? AND id = ?`;
      params = [senderId, itemId];
    } else {
      // Get by name
      query = `SELECT * FROM inventory_items WHERE sender_id = ? AND LOWER(item_name) = LOWER(?)`;
      params = [senderId, itemName];
    }
    
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Get inventory item by ID (wrapper function)
 */
function getInventoryItemById(senderId, itemId) {
  return getInventoryItem(senderId, null, itemId);
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

/**
 * Update item price by ID
 */
function updateItemPrice(senderId, itemId, newPrice) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE inventory_items 
       SET price = ?, updated_at = CURRENT_TIMESTAMP
       WHERE sender_id = ? AND id = ?`,
      [newPrice, senderId, itemId],
      function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          reject(new Error('Item not found or no changes made'));
        } else {
          // Get the updated item details
          db.get(
            `SELECT * FROM inventory_items WHERE sender_id = ? AND id = ?`,
            [senderId, itemId],
            (err, row) => {
              if (err) {
                reject(err);
              } else {
                resolve(row);
              }
            }
          );
        }
      }
    );
  });
}

/**
 * Add stock to existing item by ID
 */
function addStockToItem(senderId, itemId, quantityToAdd) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE inventory_items 
       SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
       WHERE sender_id = ? AND id = ?`,
      [quantityToAdd, senderId, itemId],
      function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          reject(new Error('Item not found or no changes made'));
        } else {
          // Get the updated item details
          db.get(
            `SELECT * FROM inventory_items WHERE sender_id = ? AND id = ?`,
            [senderId, itemId],
            (err, row) => {
              if (err) {
                reject(err);
              } else {
                resolve(row);
              }
            }
          );
        }
      }
    );
  });
}

/**
 * Record sale by item ID
 */
function recordSaleById(senderId, itemId, quantitySold) {
  return new Promise((resolve, reject) => {
    // First get the item details
    db.get(
      `SELECT * FROM inventory_items WHERE sender_id = ? AND id = ?`,
      [senderId, itemId],
      (err, item) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!item) {
          reject(new Error('Item not found'));
          return;
        }
        
        if (item.quantity < quantitySold) {
          reject(new Error('Insufficient stock'));
          return;
        }
        
        const totalAmount = item.price * quantitySold;
        
        db.serialize(() => {
          // Record the sale
          db.run(
            `INSERT INTO sales_transactions (sender_id, item_name, quantity_sold, unit_price, total_amount) 
             VALUES (?, ?, ?, ?, ?)`,
            [senderId, item.item_name, quantitySold, item.price, totalAmount],
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
                 WHERE id = ?`,
                [quantitySold, itemId],
                (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({ 
                      saleId, 
                      itemName: item.item_name, 
                      quantitySold, 
                      unitPrice: item.price,
                      totalAmount,
                      remainingStock: item.quantity - quantitySold
                    });
                  }
                }
              );
            }
          );
        });
      }
    );
  });
}

/**
 * Get user consent status
 */
function getUserConsent(senderId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM user_consent WHERE sender_id = ?`,
      [senderId],
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
 * Initialize user consent record
 */
function initializeUserConsent(senderId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO user_consent (sender_id) VALUES (?)`,
      [senderId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID || 'existing', senderId });
        }
      }
    );
  });
}

/**
 * Update user consent step
 */
function updateUserConsent(senderId, step, accepted = true) {
  return new Promise((resolve, reject) => {
    let updateField, dateField;
    
    switch (step) {
      case 'consent':
        updateField = 'consent_given';
        dateField = 'consent_date';
        break;
      case 'data_handling':
        updateField = 'data_handling_accepted';
        dateField = 'data_handling_date';
        break;
      case 'data_sharing':
        updateField = 'data_sharing_accepted';
        dateField = 'data_sharing_date';
        break;
      case 'eula':
        updateField = 'eula_accepted';
        dateField = 'eula_date';
        break;
      default:
        reject(new Error('Invalid consent step'));
        return;
    }
    
    const query = `
      UPDATE user_consent 
      SET ${updateField} = ?, ${dateField} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE sender_id = ?
    `;
    
    db.run(query, [accepted ? 1 : 0, senderId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ changes: this.changes });
      }
    });
  });
}

/**
 * Mark all policies as completed
 */
function completeUserConsent(senderId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE user_consent 
       SET all_policies_accepted = 1, completed_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE sender_id = ? AND consent_given = 1 AND data_handling_accepted = 1 AND data_sharing_accepted = 1 AND eula_accepted = 1`,
      [senderId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ completed: this.changes > 0 });
        }
      }
    );
  });
}

// =============================================================================
// LOCATION AND GEOGRAPHIC ANALYTICS FUNCTIONS
// =============================================================================

/**
 * Insert or update user location
 */
function insertUserLocation(data) {
  return new Promise((resolve, reject) => {
    const { 
      senderId, latitude, longitude, address, city, region, 
      postalCode, country, locationSource = 'manual', 
      accuracyMeters, isPrimary = false 
    } = data;
    
    // If setting as primary, first unset other primary locations for this user
    if (isPrimary) {
      db.run(
        `UPDATE user_locations SET is_primary = 0 WHERE sender_id = ?`,
        [senderId],
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Now insert the new primary location
          insertLocationRecord();
        }
      );
    } else {
      insertLocationRecord();
    }
    
    function insertLocationRecord() {
      db.run(
        `INSERT INTO user_locations 
         (sender_id, latitude, longitude, address, city, region, postal_code, country, location_source, accuracy_meters, is_primary) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [senderId, latitude, longitude, address, city, region, postalCode, country, locationSource, accuracyMeters, isPrimary ? 1 : 0],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, ...data });
          }
        }
      );
    }
  });
}

/**
 * Get user's primary location
 */
function getUserLocation(senderId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM user_locations 
       WHERE sender_id = ? AND is_primary = 1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [senderId],
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
 * Get user count by location (city/region)
 */
function getUserCountByLocation() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
         city,
         region,
         country,
         COUNT(DISTINCT sender_id) as user_count,
         AVG(latitude) as avg_latitude,
         AVG(longitude) as avg_longitude
       FROM user_locations 
       WHERE is_primary = 1 AND city IS NOT NULL
       GROUP BY city, region, country
       ORDER BY user_count DESC`,
      [],
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
 * Get purchase patterns by location
 */
function getPurchasePatternsByLocation() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
         ul.city,
         ul.region,
         ul.country,
         st.item_name,
         SUM(st.quantity_sold) as total_quantity,
         SUM(st.total_amount) as total_revenue,
         COUNT(st.id) as transaction_count,
         AVG(st.total_amount) as avg_transaction_value
       FROM sales_transactions st
       JOIN user_locations ul ON st.sender_id = ul.sender_id AND ul.is_primary = 1
       WHERE ul.city IS NOT NULL
       GROUP BY ul.city, ul.region, ul.country, st.item_name
       ORDER BY ul.city, total_revenue DESC`,
      [],
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
 * Get high activity areas based on interactions and sales
 */
function getHighActivityAreas() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
         ul.city,
         ul.region,
         ul.country,
         COUNT(DISTINCT ul.sender_id) as unique_users,
         COUNT(i.id) as total_interactions,
         COUNT(st.id) as total_transactions,
         COALESCE(SUM(st.total_amount), 0) as total_revenue,
         (COUNT(i.id) * 0.3 + COUNT(st.id) * 0.7) as activity_score,
         AVG(ul.latitude) as center_latitude,
         AVG(ul.longitude) as center_longitude
       FROM user_locations ul
       LEFT JOIN interactions i ON ul.sender_id = i.sender_id
       LEFT JOIN sales_transactions st ON ul.sender_id = st.sender_id
       WHERE ul.is_primary = 1 AND ul.city IS NOT NULL
       GROUP BY ul.city, ul.region, ul.country
       HAVING unique_users >= 1
       ORDER BY activity_score DESC`,
      [],
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
 * Get popular items by geographic area
 */
function getPopularItemsByArea() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
         ul.city,
         ul.region,
         ul.country,
         st.item_name,
         SUM(st.quantity_sold) as total_sold,
         SUM(st.total_amount) as revenue,
         COUNT(st.id) as purchase_frequency,
         (SUM(st.quantity_sold) * 0.4 + COUNT(st.id) * 0.6) as popularity_score
       FROM sales_transactions st
       JOIN user_locations ul ON st.sender_id = ul.sender_id AND ul.is_primary = 1
       WHERE ul.city IS NOT NULL
       GROUP BY ul.city, ul.region, ul.country, st.item_name
       ORDER BY ul.city, popularity_score DESC`,
      [],
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
 * Get temporal activity patterns by location
 */
function getTemporalActivityByLocation() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
         ul.city,
         ul.region,
         ul.country,
         strftime('%H', i.timestamp) as hour_of_day,
         strftime('%w', i.timestamp) as day_of_week,
         COUNT(i.id) as interaction_count,
         COUNT(DISTINCT i.sender_id) as active_users
       FROM interactions i
       JOIN user_locations ul ON i.sender_id = ul.sender_id AND ul.is_primary = 1
       WHERE ul.city IS NOT NULL
       GROUP BY ul.city, ul.region, ul.country, hour_of_day, day_of_week
       ORDER BY ul.city, interaction_count DESC`,
      [],
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
 * Generate heat map data for geographic visualization
 */
function getHeatMapData() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
         ul.latitude,
         ul.longitude,
         ul.city,
         ul.region,
         ul.country,
         COUNT(DISTINCT ul.sender_id) as user_count,
         COUNT(i.id) as interaction_count,
         COUNT(st.id) as transaction_count,
         COALESCE(SUM(st.total_amount), 0) as total_revenue,
         (COUNT(i.id) + COUNT(st.id) * 2) as heat_intensity
       FROM user_locations ul
       LEFT JOIN interactions i ON ul.sender_id = i.sender_id
       LEFT JOIN sales_transactions st ON ul.sender_id = st.sender_id
       WHERE ul.is_primary = 1 AND ul.latitude IS NOT NULL AND ul.longitude IS NOT NULL
       GROUP BY ul.latitude, ul.longitude, ul.city, ul.region, ul.country
       ORDER BY heat_intensity DESC`,
      [],
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
 * Get demographic and economic indicators by area
 */
function getAreaDemographics() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
         ul.city,
         ul.region,
         ul.country,
         COUNT(DISTINCT ul.sender_id) as total_users,
         COUNT(DISTINCT ii.sender_id) as business_users,
         COUNT(DISTINCT st.sender_id) as active_sellers,
         AVG(transaction_summary.avg_transaction) as area_avg_transaction,
         COUNT(DISTINCT ii.category) as business_categories,
         SUM(ii.quantity * ii.price) as total_inventory_value
       FROM user_locations ul
       LEFT JOIN inventory_items ii ON ul.sender_id = ii.sender_id
       LEFT JOIN sales_transactions st ON ul.sender_id = st.sender_id
       LEFT JOIN (
         SELECT sender_id, AVG(total_amount) as avg_transaction
         FROM sales_transactions
         GROUP BY sender_id
       ) transaction_summary ON ul.sender_id = transaction_summary.sender_id
       WHERE ul.is_primary = 1 AND ul.city IS NOT NULL
       GROUP BY ul.city, ul.region, ul.country
       ORDER BY total_users DESC`,
      [],
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
  getInventoryItemById,
  searchInventoryItems,
  getAllInventoryItems,
  recordSale,
  recordSaleById,
  getLowStockItems,
  getSalesSummary,
  getExpiringItems,
  updateItemPrice,
  addStockToItem,
  // Consent management functions
  getUserConsent,
  initializeUserConsent,
  updateUserConsent,
  completeUserConsent,
  // Location and geographic analytics functions
  insertUserLocation,
  getUserLocation,
  getUserCountByLocation,
  getPurchasePatternsByLocation,
  getHighActivityAreas,
  getPopularItemsByArea,
  getTemporalActivityByLocation,
  getHeatMapData,
  getAreaDemographics
};
