require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

// Import modules
const messengerModule = require('./modules/messenger');
const databaseModule = require('./modules/database');
const ocrModule = require('./modules/ocr');
const queryModule = require('./modules/query');
const analyticsModule = require('./modules/analytics');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize database on startup
databaseModule.initializeDB();

// Single endpoint to handle all webhook requests
app.post('/webhook', async (req, res) => {
  try {
    const { body } = req;
    
    // Handle Facebook webhook verification
    if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
      return res.send(req.query['hub.challenge']);
    }
    
    // Process incoming messages
    if (body.object === 'page' && body.entry) {
      for (const entry of body.entry) {
        for (const event of entry.messaging) {
          await handleMessage(event);
        }
      }
    }
    
    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error processing webhook');
  }
});

// GET endpoint for webhook verification
app.get('/webhook', (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Analytics endpoint for data buyers
app.get('/analytics', async (req, res) => {
  try {
    const analytics = await analyticsModule.generateAnalytics(req.query);
    res.json(analytics);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to generate analytics' });
  }
});

// Handle incoming messages
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;
  
  try {
    // Store interaction in database
    await databaseModule.insertInteraction({
      senderId,
      messageType: message.attachments ? 'image' : 'text',
      content: message.text || 'image',
      timestamp: new Date().toISOString()
    });
    
    // Handle image with OCR
    if (message.attachments && message.attachments[0].type === 'image') {
      const imageUrl = message.attachments[0].payload.url;
      const extractedText = await ocrModule.extractTextFromImage(imageUrl);
      
      // Store OCR result
      await databaseModule.insertOCRResult({
        senderId,
        imageUrl,
        extractedText,
        timestamp: new Date().toISOString()
      });
      
      // Send response with extracted text
      await messengerModule.sendTextMessage(senderId, `I extracted this text: ${extractedText}`);
      
      // Generate quick replies for next action
      await messengerModule.sendQuickReplies(senderId, 'What would you like to do?', [
        { title: 'Get Summary', payload: 'SUMMARY' },
        { title: 'Save Data', payload: 'SAVE' },
        { title: 'View History', payload: 'HISTORY' }
      ]);
    }
    // Handle text messages and quick reply responses
    else if (message.text || message.quick_reply) {
      const payload = message.quick_reply?.payload;
      
      if (payload === 'SUMMARY') {
        const summary = await queryModule.generateSummary(senderId);
        await messengerModule.sendTextMessage(senderId, summary);
      } else if (payload === 'HISTORY') {
        const history = await queryModule.getUserHistory(senderId);
        await messengerModule.sendTextMessage(senderId, history);
      } else {
        // Default response with quick replies
        await messengerModule.sendQuickReplies(senderId, 'How can I help you?', [
          { title: 'Send Image', payload: 'SEND_IMAGE' },
          { title: 'Get Summary', payload: 'SUMMARY' },
          { title: 'View History', payload: 'HISTORY' }
        ]);
      }
    }
  } catch (error) {
    console.error('Message handling error:', error);
    await messengerModule.sendTextMessage(senderId, 'Sorry, I encountered an error. Please try again.');
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Analytics available at http://localhost:${PORT}/analytics`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
