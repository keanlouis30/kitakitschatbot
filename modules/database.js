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

module.exports = {
  initializeDB,
  insertInteraction,
  insertOCRResult,
  insertAnalyticsData,
  getUserInteractions,
  getUserOCRResults,
  getAnalyticsData,
  insertSummary,
  getDatabaseStats
};
