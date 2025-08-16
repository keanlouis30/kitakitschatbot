const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Import Gemini OCR module
const geminiOCR = require('./gemini-ocr');

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
 * Extract text from image using the configured OCR provider (Gemini or Tesseract)
 */
async function extractTextFromImage(imageUrl) {
  const ocrProvider = process.env.OCR_PROVIDER || 'tesseract';
  
  console.log(`Using OCR provider: ${ocrProvider}`);
  
  if (ocrProvider === 'gemini' && process.env.GOOGLE_GEMINI_API_KEY) {
    try {
      return await geminiOCR.extractTextFromImage(imageUrl);
    } catch (error) {
      console.error('Gemini OCR failed, falling back to Tesseract:', error);
      // Fall back to Tesseract if Gemini fails
    }
  }
  
  // Use Tesseract as default or fallback
  return await extractTextFromImageTesseract(imageUrl);
}

/**
 * Extract text from image using Tesseract.js (legacy/fallback method)
 */
async function extractTextFromImageTesseract(imageUrl) {
  try {
    console.log('Starting Tesseract OCR for image:', imageUrl);
    
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
    
    console.log(`Tesseract OCR completed. Confidence: ${confidence}%`);
    console.log('Extracted text:', extractedText);
    
    return {
      text: extractedText || 'No text detected in the image',
      confidence: confidence,
      words: result.data.words?.length || 0,
      lines: result.data.lines?.length || 0,
      provider: 'tesseract'
    };
  } catch (error) {
    console.error('Tesseract OCR Error:', error);
    return {
      text: 'Error processing image. Please try again.',
      confidence: 0,
      error: error.message,
      provider: 'tesseract'
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
 * Process receipt or structured document using smart OCR
 */
async function processReceipt(imageUrl) {
  const ocrProvider = process.env.OCR_PROVIDER || 'tesseract';
  
  if (ocrProvider === 'gemini' && process.env.GOOGLE_GEMINI_API_KEY) {
    try {
      // Use Gemini's smart sales extraction for receipts
      const result = await geminiOCR.extractSalesFromImage(imageUrl);
      if (result.success) {
        return {
          rawText: result.rawText,
          confidence: 90, // Gemini generally has high confidence
          items: result.transactions.map(t => ({
            description: t.item,
            amount: t.totalAmount,
            quantity: t.quantity,
            unitPrice: t.unitPrice
          })),
          total: result.totalSales,
          date: result.date,
          provider: 'gemini'
        };
      }
    } catch (error) {
      console.error('Gemini receipt processing failed, falling back to basic OCR:', error);
    }
  }
  
  // Fallback to basic OCR + simple parsing
  try {
    const ocrResult = await extractTextFromImage(imageUrl);
    const lines = ocrResult.text.split('\n').filter(line => line.trim());
    
    // Simple receipt parsing (can be enhanced)
    const receipt = {
      rawText: ocrResult.text,
      confidence: ocrResult.confidence,
      items: [],
      total: null,
      date: null,
      provider: ocrResult.provider || 'tesseract'
    };
    
    // Look for common patterns
    lines.forEach(line => {
      // Look for prices (simple regex for amounts)
      const priceMatch = line.match(/₱?(\d+\.?\d*)/);
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
      error: error.message,
      provider: 'tesseract'
    };
  }
}

/**
 * Extract inventory data from image (smart function)
 */
async function extractInventoryFromImage(imageUrl) {
  const ocrProvider = process.env.OCR_PROVIDER || 'tesseract';
  
  if (ocrProvider === 'gemini' && process.env.GOOGLE_GEMINI_API_KEY) {
    try {
      return await geminiOCR.extractInventoryFromImage(imageUrl);
    } catch (error) {
      console.error('Gemini inventory extraction failed:', error);
    }
  }
  
  // Fallback to basic text extraction
  const textResult = await extractTextFromImage(imageUrl);
  return {
    success: false,
    items: [],
    rawText: textResult.text,
    error: 'Advanced inventory extraction not available without Gemini',
    provider: textResult.provider || 'tesseract'
  };
}

/**
 * Extract sales data from image (smart function)
 */
async function extractSalesFromImage(imageUrl) {
  const ocrProvider = process.env.OCR_PROVIDER || 'tesseract';
  
  if (ocrProvider === 'gemini' && process.env.GOOGLE_GEMINI_API_KEY) {
    try {
      return await geminiOCR.extractSalesFromImage(imageUrl);
    } catch (error) {
      console.error('Gemini sales extraction failed:', error);
    }
  }
  
  // Fallback to basic text extraction
  const textResult = await extractTextFromImage(imageUrl);
  return {
    success: false,
    transactions: [],
    totalSales: 0,
    date: null,
    rawText: textResult.text,
    error: 'Advanced sales extraction not available without Gemini',
    provider: textResult.provider || 'tesseract'
  };
}

/**
 * Analyze document type and extract relevant data (smart function)
 */
async function analyzeDocument(imageUrl) {
  const ocrProvider = process.env.OCR_PROVIDER || 'tesseract';
  
  if (ocrProvider === 'gemini' && process.env.GOOGLE_GEMINI_API_KEY) {
    try {
      return await geminiOCR.analyzeDocument(imageUrl);
    } catch (error) {
      console.error('Gemini document analysis failed:', error);
    }
  }
  
  // Fallback to basic text extraction
  const textResult = await extractTextFromImage(imageUrl);
  return {
    success: false,
    documentType: 'OTHER',
    confidence: 'LOW',
    extractedData: {
      rawText: textResult.text
    },
    suggestions: ['Document analysis not available without Gemini. Please manually enter the data.'],
    provider: textResult.provider || 'tesseract'
  };
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
  extractInventoryFromImage,
  extractSalesFromImage,
  analyzeDocument,
  cleanupTempFiles
};
