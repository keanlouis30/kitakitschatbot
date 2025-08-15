# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**KitaKits** is a dual-purpose Facebook Messenger chatbot platform serving as both an inventory management tool for Philippine MSMEs (sari-sari stores, carinderias, food retailers) and a data intelligence platform. The current implementation is an MVP with basic OCR capabilities, analytics, and webhook handling.

### Strategic Architecture

The system operates on two levels:
- **Surface Level**: Simple inventory tracking via Facebook Messenger
- **Deep Level**: Anonymized data collection for market intelligence and business insights

This dual architecture creates value for both end users (improved inventory management) and data clients (market insights for suppliers, LGUs, financial institutions).

## Development Commands

### Core Development Workflow

```bash
# Quick setup
npm install
cp .env.example .env
# Edit .env with your Facebook credentials

# Development
npm start              # Start server on localhost:3000
npm run dev            # Start with nodemon for auto-restart

# Database operations
# SQLite database auto-initializes on first run at ./chatbot.db

# Testing with ngrok (for webhook testing)
ngrok http 3000        # Expose local server for Facebook webhook
```

### Common Development Tasks

```bash
# Test OCR functionality locally
node -e "const ocr = require('./modules/ocr'); ocr.extractTextFromImage('path/to/test-image.jpg').then(console.log);"

# Check analytics endpoint
curl "http://localhost:3000/analytics?dataType=ocr&startDate=2024-01-01"

# Clean up temp OCR files
# Automatic cleanup runs every 30 minutes, or manually call:
node -e "require('./modules/ocr').cleanupTempFiles()"

# Database inspection (SQLite)
sqlite3 chatbot.db ".tables"
sqlite3 chatbot.db "SELECT * FROM interactions LIMIT 10;"
```

### Facebook App Configuration

The project requires Facebook Developer setup:
1. Create Facebook App with Messenger product
2. Set webhook URL: `https://your-domain.com/webhook`
3. Subscribe to `messages` and `messaging_postbacks` events
4. Configure environment variables: `PAGE_ACCESS_TOKEN`, `VERIFY_TOKEN`, `APP_SECRET`

## Code Architecture

### Modular System Design

The codebase follows a clean modular architecture:

```
server.js                 # Main Express server with single webhook endpoint
modules/
├── messenger.js          # Facebook Messenger API integration
├── database.js           # SQLite operations and schema management  
├── ocr.js               # Tesseract.js image processing
├── query.js             # Data queries, summaries, and insights
└── analytics.js         # Business intelligence and sample data generation
```

### Key Architectural Patterns

**Single Webhook Pattern**: All Facebook messages flow through one `/webhook` endpoint that dispatches to appropriate handlers based on message type (text, image, quick_reply).

**Database-First Logging**: Every interaction is logged to SQLite for analytics - interactions, OCR results, analytics data, and user summaries are all stored for future intelligence generation.

**Async Processing Chain**: 
1. Message received → logged to database
2. If image → OCR processing → results stored → quick reply options sent
3. If text/quick_reply → command processing → appropriate response

**Progressive Enhancement**: The system is designed to scale from simple SQLite to production-grade PostgreSQL with the same interface patterns.

### Data Intelligence Layer

The analytics system has a sophisticated dual-purpose design:

**Real-time Data Collection**: 
- User interactions, OCR extractions, usage patterns all captured
- Anonymization built into data pipeline
- Geographic and temporal data aggregation

**Business Intelligence Generation**:
- User engagement metrics (daily active users, session length, retention)
- OCR processing analytics (document types, confidence scores, entity extraction)
- Trend analysis (daily/weekly/monthly growth patterns)
- Market insights (industry categories, transaction values, geographic distribution)

### Production Evolution Path

The PLAN.md outlines a comprehensive 12-week evolution:

**Phase 1-2** (Weeks 1-4): Enhanced database schema, NLP, voice processing, image recognition
**Phase 3-4** (Weeks 5-8): Advanced analytics engine, notifications, personalized insights  
**Phase 5** (Weeks 9-10): Data monetization platform with dashboards for LGUs, FMCG companies, financial institutions

Key architectural migrations planned:
- SQLite → PostgreSQL/MongoDB  
- Single server → microservices with Redis caching
- Basic OCR → advanced NLP with Filipino language support
- Static analytics → real-time data pipeline with Apache Airflow

### Important Context Files

- **CONTEXT.MD**: Full business strategy and market positioning
- **PLAN.MD**: Detailed 12-week technical implementation roadmap  
- **Example code/**: Contains a more complex Python/Flask implementation with authentication, session management, and Excel reporting

This dual-nature architecture (simple tool + data intelligence) is the core innovation and should be preserved through all development iterations.

## Development Notes

### Environment Configuration
The system uses extensive environment configuration for different deployment contexts. Key variables include OCR language settings, rate limiting, debug modes, and Facebook API credentials.

### Error Handling Strategy  
The current implementation has basic error handling. Production evolution should implement:
- Webhook retry logic for failed message deliveries
- OCR fallback mechanisms for low-confidence results
- Database connection pooling and backup strategies

### Testing Approach
Local testing requires ngrok for webhook exposure. The system includes comprehensive logging for debugging Facebook webhook interactions.

### Database Schema Evolution
The current schema supports the MVP. The planned evolution includes store profiles, inventory items with expiry tracking, sales transactions, and enhanced analytics tables for the data marketplace.

The modular architecture allows for incremental complexity addition while maintaining the core dual-purpose value proposition.
