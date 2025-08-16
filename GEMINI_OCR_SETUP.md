# Google Gemini OCR Setup Guide

This guide explains how to set up and use Google Gemini's vision capabilities for enhanced OCR functionality in the KitaKits chatbot.

## Why Gemini Over Tesseract?

**Google Gemini Advantages:**
- 🧠 **Intelligent Document Understanding**: Gemini can understand context and structure, not just extract text
- 📋 **Smart Data Parsing**: Automatically identifies inventory items, prices, quantities, and sales data
- 🎯 **Higher Accuracy**: Especially with handwritten text, receipts, and complex layouts
- 🔍 **Document Type Detection**: Can identify if an image is a receipt, inventory list, or price catalog
- 💡 **Contextual Processing**: Understands business context and provides structured output
- 🌐 **Multi-language Support**: Better handling of Filipino text mixed with English

**Tesseract Limitations:**
- Only extracts raw text without understanding context
- Poor performance with handwritten or low-quality images
- No structured data extraction capabilities
- Limited parsing of business documents

## Setup Instructions

### 1. Get Google Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key

### 2. Configure Environment Variables

Add these variables to your `.env` file:

```bash
# Google Gemini Configuration
GOOGLE_GEMINI_API_KEY=your_google_gemini_api_key_here
OCR_PROVIDER=gemini
```

### 3. Restart the Server

```bash
npm run dev
# or
npm start
```

## Usage

The system will automatically use Gemini when configured. The OCR module provides these enhanced functions:

### Basic Text Extraction
```javascript
const result = await ocrModule.extractTextFromImage(imageUrl);
// Returns: { text, confidence, words, lines, provider: 'gemini' }
```

### Smart Inventory Extraction
```javascript
const result = await ocrModule.extractInventoryFromImage(imageUrl);
// Returns: { success, items: [{ name, quantity, price, unit }], rawText, provider }
```

### Sales Data Extraction
```javascript
const result = await ocrModule.extractSalesFromImage(imageUrl);
// Returns: { success, transactions: [...], totalSales, date, rawText, provider }
```

### Smart Document Analysis
```javascript
const result = await ocrModule.analyzeDocument(imageUrl);
// Returns: { success, documentType, confidence, extractedData, suggestions, provider }
```

## Document Types Supported

Gemini can automatically detect and parse:

1. **INVENTORY_LIST** - Product lists with quantities and prices
2. **RECEIPT** - Purchase receipts showing bought items
3. **SALES_RECORD** - Records of sales transactions
4. **PRICE_LIST** - Product catalogs or price lists
5. **INVOICE** - Business invoices
6. **OTHER** - Any other document type

## Fallback Behavior

- If Gemini fails or is not configured, the system automatically falls back to Tesseract
- No changes needed to existing code - the same functions work with both providers
- Graceful degradation ensures the chatbot continues to work even without Gemini

## Cost Considerations

Google Gemini API has usage-based pricing:
- **Free Tier**: 15 requests per minute, 1,500 requests per day
- **Paid Plans**: Start at $0.00025 per request

For a small business chatbot, the free tier should be sufficient for most use cases.

## Example Configuration

Your `.env` file should look like:

```bash
# Facebook Messenger Configuration
PAGE_ACCESS_TOKEN=your_facebook_page_access_token_here
VERIFY_TOKEN=your_webhook_verify_token_here
APP_SECRET=your_facebook_app_secret_here

# Server Configuration
PORT=3000
NODE_ENV=development

# Google Gemini Configuration
GOOGLE_GEMINI_API_KEY=AIzaSyD...your_actual_api_key_here...
OCR_PROVIDER=gemini

# Database Configuration
DB_PATH=./chatbot.db

# Other configurations...
```

## Testing the Integration

1. Send an image of a receipt or inventory list to your chatbot
2. Use the "📄 Scan Document" feature
3. Check the console logs to see if Gemini is being used:
   ```
   Using OCR provider: gemini
   Starting Gemini OCR for image: ...
   Gemini OCR completed
   ```

## Troubleshooting

### Common Issues:

1. **"Using OCR provider: tesseract" instead of gemini**
   - Check that `GOOGLE_GEMINI_API_KEY` is set in your `.env` file
   - Ensure `OCR_PROVIDER=gemini` is configured
   - Restart the server after adding environment variables

2. **"Gemini OCR failed, falling back to Tesseract"**
   - Check your API key is valid
   - Verify you haven't exceeded rate limits
   - Check network connectivity

3. **API Key Issues**
   - Make sure your API key has the correct permissions
   - Check the Google AI Studio console for any restrictions
   - Verify the API key is not expired

### Debug Mode

To see detailed logs, set:
```bash
DEBUG=true
LOG_LEVEL=debug
```

## Performance Comparison

| Feature | Tesseract | Gemini |
|---------|-----------|--------|
| Text Extraction | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Handwritten Text | ⭐ | ⭐⭐⭐⭐ |
| Structured Data | ❌ | ✅ |
| Context Understanding | ❌ | ✅ |
| Speed | Fast | Medium |
| Cost | Free | Usage-based |
| Offline Support | ✅ | ❌ |

Choose Gemini for production use where accuracy and intelligent parsing are important. Keep Tesseract as a reliable fallback.
