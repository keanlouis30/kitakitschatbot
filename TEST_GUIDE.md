# KitaKits Chatbot Endpoint Testing Guide

This guide shows you how to test all the endpoints in the KitaKits chatbot system.

## Available Endpoints

The server exposes these endpoints:
- `GET /webhook` - Facebook webhook verification
- `POST /webhook` - Facebook message processing
- `GET /analytics` - Analytics data for data buyers

## Quick Testing Methods

### Method 1: Using the Test Script (Automated)

First, start the server in one terminal:
```bash
npm start
```

Then in another terminal, run the automated test:
```bash
node test-endpoints.js
```

### Method 2: Manual Testing with curl

Start the server:
```bash
npm start
```

Then run these curl commands:

#### Test 1: Webhook Verification
```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=test_challenge_123"
```
**Expected**: Returns `test_challenge_123`

#### Test 2: Analytics Endpoint (Basic)
```bash
curl "http://localhost:3000/analytics"
```
**Expected**: Returns comprehensive analytics JSON with sample data

#### Test 3: Analytics with Filters
```bash
curl "http://localhost:3000/analytics?dataType=ocr&category=receipts&startDate=2024-01-01"
```
**Expected**: Returns filtered analytics data

#### Test 4: Message Processing (Text)
```bash
curl -X POST "http://localhost:3000/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "messaging": [{
        "sender": {"id": "test_user_123"},
        "message": {"text": "Hello test message"}
      }]
    }]
  }'
```
**Expected**: Returns `EVENT_RECEIVED`

#### Test 5: Image Message Processing
```bash
curl -X POST "http://localhost:3000/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "messaging": [{
        "sender": {"id": "test_user_456"},
        "message": {
          "attachments": [{
            "type": "image",
            "payload": {"url": "https://via.placeholder.com/300x200.png?text=Sample+Receipt"}
          }]
        }
      }]
    }]
  }'
```
**Expected**: Returns `EVENT_RECEIVED` and triggers OCR processing

### Method 3: Using PowerShell (Windows)

```powershell
# Test webhook verification
Invoke-RestMethod -Uri "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=test_challenge_123" -Method Get

# Test analytics
Invoke-RestMethod -Uri "http://localhost:3000/analytics" -Method Get

# Test message webhook
$body = @{
    object = "page"
    entry = @(
        @{
            messaging = @(
                @{
                    sender = @{ id = "test_user_123" }
                    message = @{ text = "Hello from PowerShell" }
                }
            )
        }
    )
} | ConvertTo-Json -Depth 4

Invoke-RestMethod -Uri "http://localhost:3000/webhook" -Method Post -Body $body -ContentType "application/json"
```

## Testing Different Scenarios

### Scenario 1: New User Text Message
Tests basic message logging and quick reply generation.

### Scenario 2: Image Upload with OCR
Tests OCR integration, image processing, and database storage of extracted text.

### Scenario 3: Quick Reply Responses
Send a message, then test the quick reply responses (SUMMARY, HISTORY).

### Scenario 4: Analytics Data Generation
Test how user interactions generate analytics data for the business intelligence layer.

## Checking Test Results

### Database Verification
After running tests, check the SQLite database:

```bash
sqlite3 chatbot.db
.tables
SELECT * FROM interactions LIMIT 5;
SELECT * FROM ocr_results LIMIT 5;
SELECT * FROM analytics_data LIMIT 5;
.quit
```

### Log Output
Monitor the server console for:
- Database initialization messages
- Message processing logs
- OCR processing status
- Error messages

## Expected Behaviors

### Successful Tests
- **Webhook verification**: Returns challenge token
- **Analytics endpoint**: Returns structured JSON with sample business data
- **Message processing**: Logs interactions to database, returns appropriate responses
- **Image processing**: Attempts OCR extraction (may fail without network access)

### Common Issues
- **Module not found**: Run `npm install`
- **Database errors**: Check file permissions
- **OCR failures**: Network-dependent, may fail with placeholder images
- **Facebook API errors**: Expected with test tokens

## Advanced Testing with Postman

Import this JSON collection to test with Postman:

```json
{
  "info": { "name": "KitaKits Endpoints" },
  "item": [
    {
      "name": "Webhook Verification",
      "request": {
        "method": "GET",
        "url": "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=test123"
      }
    },
    {
      "name": "Analytics",
      "request": {
        "method": "GET",
        "url": "http://localhost:3000/analytics"
      }
    },
    {
      "name": "Text Message",
      "request": {
        "method": "POST",
        "url": "http://localhost:3000/webhook",
        "body": {
          "mode": "raw",
          "raw": "{\"object\":\"page\",\"entry\":[{\"messaging\":[{\"sender\":{\"id\":\"test_user\"},\"message\":{\"text\":\"Test message\"}}]}]}"
        }
      }
    }
  ]
}
```

## Integration Testing with ngrok

For testing with real Facebook webhooks:

1. Install ngrok: `npm install -g ngrok`
2. Start server: `npm start`
3. Expose server: `ngrok http 3000`
4. Use ngrok URL in Facebook webhook configuration
5. Test with real Facebook Messenger messages

## Performance Testing

Test endpoint performance:
```bash
# Using curl with timing
curl -w "@curl-format.txt" -s "http://localhost:3000/analytics"

# Create curl-format.txt with:
# time_total: %{time_total}s
# size_download: %{size_download} bytes
# speed_download: %{speed_download} bytes/sec
```

## Troubleshooting

### Server Won't Start
- Check if port 3000 is available
- Verify all dependencies installed (`npm install`)
- Check .env file exists and is properly configured

### Endpoints Return Errors
- Check server logs for detailed error messages
- Verify request format matches expected schema
- Ensure database is properly initialized

### OCR Processing Fails
- Network connectivity required for image download
- Check image URL accessibility
- Monitor temp directory for downloaded images

## Security Testing

Test with invalid tokens and malformed requests:
```bash
# Invalid webhook verification
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=invalid_token&hub.challenge=test"

# Malformed JSON
curl -X POST "http://localhost:3000/webhook" -H "Content-Type: application/json" -d '{"invalid": json}'
```

Expected: Proper error responses and security validations.
