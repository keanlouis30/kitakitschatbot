const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Temp directory for storing images
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating temp directory:', error);
  }
}

/**
 * Download image from URL to local temp file
 */
async function downloadImage(imageUrl) {
  await ensureTempDir();
  
  const fileName = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  const filePath = path.join(TEMP_DIR, fileName);
  
  try {
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream'
    });
    
    const writer = require('fs').createWriteStream(filePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(filePath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Error downloading image:', error);
    throw error;
  }
}

/**
 * Extract text from image using Tesseract.js
 */
async function extractTextFromImage(imageUrl) {
  try {
    console.log('Starting OCR for image:', imageUrl);
    
    // Download image first (Facebook Messenger images require authentication)
    const localImagePath = await downloadImage(imageUrl);
    
    // Perform OCR
    const result = await Tesseract.recognize(
      localImagePath,
      'eng', // Language
      {
        logger: m => console.log('OCR Progress:', m.status, m.progress)
      }
    );
    
    // Clean up temp file
    try {
      await fs.unlink(localImagePath);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
    
    // Extract and clean the text
    const extractedText = result.data.text.trim();
    const confidence = result.data.confidence;
    
    console.log(`OCR completed. Confidence: ${confidence}%`);
    console.log('Extracted text:', extractedText);
    
    return {
      text: extractedText || 'No text detected in the image',
      confidence: confidence,
      words: result.data.words?.length || 0,
      lines: result.data.lines?.length || 0
    };
  } catch (error) {
    console.error('OCR Error:', error);
    return {
      text: 'Error processing image. Please try again.',
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Extract text with specific language
 */
async function extractTextWithLanguage(imageUrl, language = 'eng') {
  try {
    console.log(`Starting OCR with language: ${language}`);
    
    const localImagePath = await downloadImage(imageUrl);
    
    // Language codes: eng, chi_sim (Chinese Simplified), spa (Spanish), etc.
    const result = await Tesseract.recognize(
      localImagePath,
      language,
      {
        logger: m => console.log('OCR Progress:', m.status, m.progress)
      }
    );
    
    // Clean up
    try {
      await fs.unlink(localImagePath);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
    
    return {
      text: result.data.text.trim() || 'No text detected',
      confidence: result.data.confidence,
      language: language
    };
  } catch (error) {
    console.error('OCR Error with language:', error);
    return {
      text: 'Error processing image',
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Process receipt or structured document
 */
async function processReceipt(imageUrl) {
  try {
    const ocrResult = await extractTextFromImage(imageUrl);
    const lines = ocrResult.text.split('\n').filter(line => line.trim());
    
    // Simple receipt parsing (can be enhanced)
    const receipt = {
      rawText: ocrResult.text,
      confidence: ocrResult.confidence,
      items: [],
      total: null,
      date: null
    };
    
    // Look for common patterns
    lines.forEach(line => {
      // Look for prices (simple regex for amounts)
      const priceMatch = line.match(/\$?(\d+\.?\d*)/);
      if (priceMatch) {
        const amount = parseFloat(priceMatch[1]);
        
        // Check if it's likely a total
        if (line.toLowerCase().includes('total')) {
          receipt.total = amount;
        } else if (amount > 0) {
          receipt.items.push({
            description: line.replace(priceMatch[0], '').trim(),
            amount: amount
          });
        }
      }
      
      // Look for dates (simple MM/DD/YYYY or DD/MM/YYYY pattern)
      const dateMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (dateMatch && !receipt.date) {
        receipt.date = dateMatch[0];
      }
    });
    
    return receipt;
  } catch (error) {
    console.error('Receipt processing error:', error);
    return {
      rawText: '',
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Extract text from multiple images
 */
async function extractTextFromMultipleImages(imageUrls) {
  const results = [];
  
  for (const imageUrl of imageUrls) {
    const result = await extractTextFromImage(imageUrl);
    results.push(result);
  }
  
  // Combine all text
  const combinedText = results.map(r => r.text).join('\n\n');
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  
  return {
    text: combinedText,
    confidence: avgConfidence,
    imageCount: imageUrls.length,
    individualResults: results
  };
}

/**
 * Clean up temp directory (maintenance function)
 */
async function cleanupTempFiles() {
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_DIR);
    
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      
      // Delete files older than 1 hour
      const hourAgo = Date.now() - (60 * 60 * 1000);
      if (stats.mtimeMs < hourAgo) {
        await fs.unlink(filePath);
        console.log('Deleted old temp file:', file);
      }
    }
  } catch (error) {
    console.error('Temp cleanup error:', error);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupTempFiles, 30 * 60 * 1000);

module.exports = {
  extractTextFromImage,
  extractTextWithLanguage,
  processReceipt,
  extractTextFromMultipleImages,
  cleanupTempFiles
};
