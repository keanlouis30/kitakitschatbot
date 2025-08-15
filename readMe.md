# KitaKits Chatbot MVP - Hackathon Project

A streamlined Facebook Messenger chatbot with OCR capabilities and analytics for data buyers. Built for rapid deployment in under 16 hours.

## 🚀 Features

### Core Modules
1. **Facebook Messenger Integration** - Quick replies and message processing
2. **Database Module** - SQLite for data persistence
3. **OCR Module** - Text extraction from images using Tesseract.js
4. **Query Module** - Data summaries and insights
5. **Analytics Module** - Business intelligence for data buyers

## 📋 Prerequisites

- Node.js v14+ 
- Facebook Page and App (for Messenger integration)
- ngrok or similar tool for webhook testing (optional)

## ⚡ Quick Setup (5 minutes)

### 1. Clone and Install
```bash
git clone <repository>
cd kitakitschatbot
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your Facebook credentials
```

### 3. Facebook App Setup
1. Create a Facebook App at https://developers.facebook.com
2. Add Messenger product to your app
3. Generate Page Access Token
4. Set webhook URL: `https://your-domain.com/webhook`
5. Subscribe to messages and messaging_postbacks events

### 4. Run the Server
```bash
npm start
# Server runs on http://localhost:3000
```

## 🔧 Configuration

### Required Environment Variables
- `PAGE_ACCESS_TOKEN` - From Facebook App Dashboard
- `VERIFY_TOKEN` - Custom string for webhook verification
- `PORT` - Server port (default: 3000)

## 📱 Usage

### For End Users (via Messenger)
1. Send a message to your Facebook Page
2. Upload images for OCR processing
3. Use quick replies to:
   - Get summaries
   - View history
   - Process receipts

### For Data Buyers (via API)
Access analytics at: `http://localhost:3000/analytics`

Query parameters:
- `dataType` - Filter by data type
- `category` - Filter by category
- `startDate` - Start date for data range
- `endDate` - End date for data range

## 🏗️ Project Structure
```
kitakitschatbot/
├── server.js           # Main server with single endpoint
├── modules/
│   ├── messenger.js    # FB Messenger integration
│   ├── database.js     # SQLite operations
│   ├── ocr.js         # Text extraction
│   ├── query.js       # Data queries & summaries
│   └── analytics.js   # Business analytics
├── temp/              # Temporary image storage
├── chatbot.db         # SQLite database (auto-created)
├── package.json       # Dependencies
├── .env              # Configuration (create from .env.example)
└── README.md         # This file
```

## 🔌 API Endpoints

### Webhook Endpoint
- **POST/GET** `/webhook` - Facebook Messenger webhook

### Analytics Endpoint
- **GET** `/analytics` - Business analytics dashboard
  
Example response:
```json
{
  "metadata": {...},
  "overview": {
    "totalUsers": 150,
    "totalInteractions": 1850,
    "totalOCRProcessed": 680
  },
  "businessInsights": {...}
}
```

## 🧪 Testing

### Local Testing with ngrok
```bash
# Install ngrok
npm install -g ngrok

# In terminal 1: Start server
npm start

# In terminal 2: Expose local server
ngrok http 3000

# Use ngrok URL for Facebook webhook
```

### Test OCR Locally
```javascript
// Quick test script
const ocr = require('./modules/ocr');
ocr.extractTextFromImage('path/to/image.jpg')
  .then(result => console.log(result));
```

## 📊 Analytics Features

The analytics module provides:
- User engagement metrics
- OCR processing statistics
- Trend analysis (daily/weekly/monthly)
- Business insights and recommendations
- Market potential analysis
- Custom report generation

## 🚦 MVP Limitations

This is a hackathon MVP with simplified features:
- Basic error handling
- Sample data for some analytics
- Limited to English OCR by default
- SQLite database (not production-scale)
- No authentication on analytics endpoint
- Basic receipt parsing

## 🔄 Next Steps for Production

1. **Security**
   - Add authentication for analytics
   - Implement rate limiting
   - Add input validation

2. **Scalability**
   - Replace SQLite with PostgreSQL/MongoDB
   - Add Redis for caching
   - Implement message queue

3. **Features**
   - Multi-language OCR support
   - Advanced receipt parsing
   - Real-time analytics dashboard
   - Webhook retry logic

## 🐛 Troubleshooting

### Common Issues

**Webhook verification failing**
- Check VERIFY_TOKEN matches in .env and Facebook App
- Ensure webhook URL is publicly accessible

**OCR not working**
- Check temp directory permissions
- Verify image URLs are accessible
- Check Tesseract.js installation

**Database errors**
- Ensure write permissions in project directory
- Check if chatbot.db was created

## 📝 License

MIT - Built for hackathon demonstration

## 🤝 Support

For hackathon support:
- Check error logs in console
- Verify all environment variables are set
- Test with simple text messages first
- Use ngrok for local testing

---

**Built with ❤️ for the Hackathon - Ready in < 16 hours!**
