const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

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
 * Convert image file to base64 format for Gemini API
 */
async function imageToBase64(filePath) {
  try {
    const imageData = await fs.readFile(filePath);
    return {
      inlineData: {
        data: imageData.toString('base64'),
        mimeType: 'image/jpeg'
      }
    };
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw error;
  }
}

/**
 * Extract text from image using Google Gemini Vision
 */
async function extractTextFromImage(imageUrl) {
  try {
    console.log('Starting Gemini OCR for image:', imageUrl);
    
    // Download image first (Facebook Messenger images require authentication)
    const localImagePath = await downloadImage(imageUrl);
    
    // Convert to base64 for Gemini
    const imageBase64 = await imageToBase64(localImagePath);
    
    // Get Gemini Vision model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // Create prompt for text extraction
    const prompt = `
    Please extract all visible text from this image. 
    Return ONLY the extracted text, maintaining the original structure and line breaks as much as possible.
    If no text is found, return "No text detected in the image".
    `;
    
    // Generate content with image
    const result = await model.generateContent([prompt, imageBase64]);
    const response = await result.response;
    const extractedText = response.text().trim();
    
    // Clean up temp file
    try {
      await fs.unlink(localImagePath);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
    
    console.log('Gemini OCR completed');
    console.log('Extracted text:', extractedText);
    
    return {
      text: extractedText || 'No text detected in the image',
      confidence: 95, // Gemini generally has high confidence
      words: extractedText.split(/\s+/).length,
      lines: extractedText.split('\n').length,
      provider: 'gemini'
    };
    
  } catch (error) {
    console.error('Gemini OCR Error:', error);
    return {
      text: 'Error processing image. Please try again.',
      confidence: 0,
      error: error.message,
      provider: 'gemini'
    };
  }
}

/**
 * Extract and parse inventory data from image using Gemini
 */
async function extractInventoryFromImage(imageUrl) {
  try {
    console.log('Starting Gemini inventory extraction for image:', imageUrl);
    
    const localImagePath = await downloadImage(imageUrl);
    const imageBase64 = await imageToBase64(localImagePath);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
    Analyze this image and extract inventory/product information. 
    Look for items with their names, quantities, prices, and units.
    
    Return the data in this JSON format:
    {
      "items": [
        {
          "name": "Product Name",
          "quantity": number,
          "price": number,
          "unit": "pcs/kg/liter/etc"
        }
      ],
      "rawText": "all visible text"
    }
    
    If no inventory data is found, return:
    {
      "items": [],
      "rawText": "extracted text here"
    }
    
    Be smart about parsing - look for patterns like:
    - "Rice 10kg ₱50"
    - "Coca Cola - 24pcs @ ₱15 each"
    - "Bread 20 ₱25"
    
    Return ONLY the JSON, no additional text.
    `;
    
    const result = await model.generateContent([prompt, imageBase64]);
    const response = await result.response;
    let responseText = response.text().trim();
    
    // Clean up temp file
    try {
      await fs.unlink(localImagePath);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
    
    // Try to parse JSON response
    try {
      // Remove markdown code blocks if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const parsedData = JSON.parse(responseText);
      
      console.log('Gemini inventory extraction completed');
      console.log('Extracted items:', parsedData.items?.length || 0);
      
      return {
        success: true,
        items: parsedData.items || [],
        rawText: parsedData.rawText || '',
        provider: 'gemini'
      };
      
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw response:', responseText);
      
      // Fallback to raw text extraction
      return {
        success: false,
        items: [],
        rawText: responseText,
        error: 'Could not parse structured data, but text was extracted',
        provider: 'gemini'
      };
    }
    
  } catch (error) {
    console.error('Gemini inventory extraction error:', error);
    return {
      success: false,
      items: [],
      rawText: '',
      error: error.message,
      provider: 'gemini'
    };
  }
}

/**
 * Extract and parse sales data from receipt/sales list using Gemini
 */
async function extractSalesFromImage(imageUrl) {
  try {
    console.log('Starting Gemini sales extraction for image:', imageUrl);
    
    const localImagePath = await downloadImage(imageUrl);
    const imageBase64 = await imageToBase64(localImagePath);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
    Analyze this image and extract sales/transaction information. 
    Look for sold items with their names, quantities sold, and prices.
    
    This could be:
    - A receipt showing purchased items
    - A sales list showing what was sold
    - A transaction record
    
    Return the data in this JSON format:
    {
      "transactions": [
        {
          "item": "Product Name",
          "quantity": number,
          "unitPrice": number,
          "totalAmount": number
        }
      ],
      "totalSales": number,
      "date": "date if found",
      "rawText": "all visible text"
    }
    
    If no sales data is found, return:
    {
      "transactions": [],
      "totalSales": 0,
      "date": null,
      "rawText": "extracted text here"
    }
    
    Be smart about parsing - look for patterns like:
    - "Coca Cola x2 ₱30"
    - "Rice 1kg sold ₱50"
    - "Bread - 5pcs @ ₱5 = ₱25"
    
    Return ONLY the JSON, no additional text.
    `;
    
    const result = await model.generateContent([prompt, imageBase64]);
    const response = await result.response;
    let responseText = response.text().trim();
    
    // Clean up temp file
    try {
      await fs.unlink(localImagePath);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
    
    // Try to parse JSON response
    try {
      // Remove markdown code blocks if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const parsedData = JSON.parse(responseText);
      
      console.log('Gemini sales extraction completed');
      console.log('Extracted transactions:', parsedData.transactions?.length || 0);
      
      return {
        success: true,
        transactions: parsedData.transactions || [],
        totalSales: parsedData.totalSales || 0,
        date: parsedData.date || null,
        rawText: parsedData.rawText || '',
        provider: 'gemini'
      };
      
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw response:', responseText);
      
      // Fallback to raw text extraction
      return {
        success: false,
        transactions: [],
        totalSales: 0,
        date: null,
        rawText: responseText,
        error: 'Could not parse structured data, but text was extracted',
        provider: 'gemini'
      };
    }
    
  } catch (error) {
    console.error('Gemini sales extraction error:', error);
    return {
      success: false,
      transactions: [],
      totalSales: 0,
      date: null,
      rawText: '',
      error: error.message,
      provider: 'gemini'
    };
  }
}

/**
 * Smart document analysis - determines document type and extracts relevant data
 */
async function analyzeDocument(imageUrl) {
  try {
    console.log('Starting Gemini document analysis for image:', imageUrl);
    
    const localImagePath = await downloadImage(imageUrl);
    const imageBase64 = await imageToBase64(localImagePath);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
    Analyze this document/image and determine what type of business document it is.
    Then extract the relevant information based on the document type.
    
    Document types to look for:
    1. INVENTORY_LIST - Lists of products with quantities and prices
    2. RECEIPT - Purchase receipts showing bought items
    3. SALES_RECORD - Records of sales transactions
    4. PRICE_LIST - Product catalogs or price lists
    5. INVOICE - Business invoices
    6. OTHER - Any other type of document
    
    Return the data in this JSON format:
    {
      "documentType": "INVENTORY_LIST|RECEIPT|SALES_RECORD|PRICE_LIST|INVOICE|OTHER",
      "confidence": "HIGH|MEDIUM|LOW",
      "extractedData": {
        // For INVENTORY_LIST:
        "items": [{"name": "string", "quantity": number, "price": number, "unit": "string"}],
        
        // For RECEIPT/SALES_RECORD:
        "transactions": [{"item": "string", "quantity": number, "unitPrice": number, "totalAmount": number}],
        "totalAmount": number,
        "date": "string",
        
        // For PRICE_LIST:
        "products": [{"name": "string", "price": number, "unit": "string"}],
        
        // Always include:
        "rawText": "all visible text"
      },
      "suggestions": ["array of suggestions for user"]
    }
    
    Return ONLY the JSON, no additional text.
    `;
    
    const result = await model.generateContent([prompt, imageBase64]);
    const response = await result.response;
    let responseText = response.text().trim();
    
    // Clean up temp file
    try {
      await fs.unlink(localImagePath);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
    
    // Try to parse JSON response
    try {
      // Remove markdown code blocks if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const parsedData = JSON.parse(responseText);
      
      console.log('Gemini document analysis completed');
      console.log('Document type:', parsedData.documentType);
      console.log('Confidence:', parsedData.confidence);
      
      return {
        success: true,
        documentType: parsedData.documentType || 'OTHER',
        confidence: parsedData.confidence || 'LOW',
        extractedData: parsedData.extractedData || {},
        suggestions: parsedData.suggestions || [],
        provider: 'gemini'
      };
      
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw response:', responseText);
      
      // Fallback to basic text extraction
      const basicTextResult = await extractTextFromImage(imageUrl);
      return {
        success: false,
        documentType: 'OTHER',
        confidence: 'LOW',
        extractedData: {
          rawText: basicTextResult.text
        },
        suggestions: ['Document could not be analyzed automatically. Please manually enter the data.'],
        error: 'Could not parse structured analysis',
        provider: 'gemini'
      };
    }
    
  } catch (error) {
    console.error('Gemini document analysis error:', error);
    return {
      success: false,
      documentType: 'OTHER',
      confidence: 'LOW',
      extractedData: { rawText: '' },
      suggestions: ['Error analyzing document. Please try again or manually enter the data.'],
      error: error.message,
      provider: 'gemini'
    };
  }
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
  extractInventoryFromImage,
  extractSalesFromImage,
  analyzeDocument,
  cleanupTempFiles
};
