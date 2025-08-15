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
    if (body.object === 'page' && body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (entry.messaging && Array.isArray(entry.messaging)) {
          for (const event of entry.messaging) {
            // Only process message events, skip delivery/read receipts
            if (event && (event.message || event.postback)) {
              await handleMessage(event);
            }
          }
        }
      }
    } else {
      console.log('Non-message webhook event:', JSON.stringify(body, null, 2));
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
  // Validate event structure
  if (!event || !event.sender || !event.sender.id) {
    console.log('Invalid event structure:', JSON.stringify(event, null, 2));
    return;
  }

  const senderId = event.sender.id;
  const message = event.message;
  
  // Skip if no message (could be delivery receipt, read receipt, etc.)
  if (!message) {
    console.log('No message in event, skipping:', JSON.stringify(event, null, 2));
    return;
  }
  
  try {
    // Store interaction in database
    await databaseModule.insertInteraction({
      senderId,
      messageType: (message.attachments && message.attachments.length > 0) ? 'image' : 'text',
      content: message.text || message.quick_reply?.title || 'image',
      timestamp: new Date().toISOString()
    });
    
    // Handle image with OCR (receipts, invoices, inventory photos)
    if (message.attachments && message.attachments.length > 0 && message.attachments[0].type === 'image') {
      await handleImageMessage(senderId, message.attachments[0].payload.url);
    }
    // Handle text messages and quick reply responses
    else if (message.text || message.quick_reply) {
      await handleTextOrQuickReply(senderId, message);
    }
    // Handle other message types (stickers, etc.)
    else {
      console.log('Unsupported message type:', JSON.stringify(message, null, 2));
      await sendWelcomeMessage(senderId);
    }
  } catch (error) {
    console.error('Message handling error:', error);
    console.error('Event that caused error:', JSON.stringify(event, null, 2));
    
    // Don't send error messages for quick reply responses to prevent loops
    if (!message.quick_reply) {
      try {
        await messengerModule.sendTextMessage(senderId, 'Sorry, may problema sa system. Subukan ulit mamaya.');
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  }
}

// Handle image messages with OCR processing
async function handleImageMessage(senderId, imageUrl) {
  try {
    // Send typing indicator
    await messengerModule.sendTypingIndicator(senderId, true);
    
    const extractedResult = await ocrModule.extractTextFromImage(imageUrl);
    const extractedText = extractedResult.text || extractedResult;
    
    // Store OCR result
    await databaseModule.insertOCRResult({
      senderId,
      imageUrl,
      extractedText,
      timestamp: new Date().toISOString()
    });
    
    // Stop typing indicator
    await messengerModule.sendTypingIndicator(senderId, false);
    
    if (extractedText && extractedText !== 'No text detected in the image') {
      await messengerModule.sendTextMessage(senderId, 
        `📸 Nakita ko ang text sa larawan:\n\n"${extractedText}"\n\nAno ang gusto mong gawin?`);
      
      // Send receipt/image processing quick replies
      await messengerModule.sendQuickReplies(senderId, 'Pumili ng aksyon:', [
        { title: '💰 Record Sale', payload: 'RECORD_SALE' },
        { title: '📦 Add to Inventory', payload: 'ADD_INVENTORY' },
        { title: '📋 Get Summary', payload: 'SUMMARY' },
        { title: '🏠 Main Menu', payload: 'MAIN_MENU' }
      ]);
    } else {
      await messengerModule.sendTextMessage(senderId, 
        '📸 Hindi ko nabasa ang text sa larawan. Subukan ang mas malinaw na kuha.');
      await sendMainMenu(senderId);
    }
  } catch (error) {
    console.error('Image processing error:', error);
    await messengerModule.sendTextMessage(senderId, 
      'May problema sa pag-scan ng larawan. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle text messages and quick reply responses
async function handleTextOrQuickReply(senderId, message) {
  const payload = message.quick_reply?.payload;
  const text = message.text?.toLowerCase();
  
  try {
    // Handle quick reply actions
    if (payload) {
      await handleQuickReplyPayload(senderId, payload);
    }
    // Handle text commands and greetings
    else if (text) {
      await handleTextCommands(senderId, text, message.text);
    }
    // Default case
    else {
      await sendWelcomeMessage(senderId);
    }
  } catch (error) {
    console.error('Text/QuickReply handling error:', error);
    await messengerModule.sendTextMessage(senderId, 'May error po. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle quick reply payload actions
async function handleQuickReplyPayload(senderId, payload) {
  switch (payload) {
    case 'MAIN_MENU':
      await sendMainMenu(senderId);
      break;
      
    case 'NEW_ITEM':
      await messengerModule.sendTextMessage(senderId, 
        '📦 Magdagdag ng Bagong Item\n\nI-type ang pangalan ng produkto at presyo:\nHalimbawa: "Coca-Cola 15"');
      break;
      
    case 'SOLD_ITEM':
      await messengerModule.sendTextMessage(senderId, 
        '💰 I-record ang Benta\n\nI-type ang nabenta:\nHalimbawa: "Nabenta: Coca-Cola 2pcs"');
      break;
      
    case 'CHECK_STOCK':
      await messengerModule.sendTextMessage(senderId, 
        '📋 I-type ang produktong gusto mong i-check:\nHalimbawa: "Stock: Coca-Cola"');
      break;
      
    case 'LOW_STOCK':
      await checkLowStockItems(senderId);
      break;
      
    case 'EXPIRY_CHECK':
      await checkExpiringItems(senderId);
      break;
      
    case 'DAILY_SALES':
      await showDailySales(senderId);
      break;
      
    case 'SUMMARY':
      const summary = await queryModule.generateSummary(senderId);
      await messengerModule.sendTextMessage(senderId, summary);
      await sendMainMenu(senderId);
      break;
      
    case 'HISTORY':
      const history = await queryModule.getUserHistory(senderId);
      await messengerModule.sendTextMessage(senderId, history);
      await sendMainMenu(senderId);
      break;
      
    case 'RECORD_SALE':
      await messengerModule.sendTextMessage(senderId, 
        '💰 I-record ang benta mula sa receipt\n\nI-type ang detalye ng benta o mag-send ng bagong larawan ng receipt.');
      break;
      
    case 'ADD_INVENTORY':
      await messengerModule.sendTextMessage(senderId, 
        '📦 Idagdag sa inventory\n\nI-type ang pangalan at dami ng produkto mula sa larawan.');
      break;
      
    case 'HELP':
      await sendHelpMessage(senderId);
      break;
      
    default:
      await sendMainMenu(senderId);
  }
}

// Handle text commands
async function handleTextCommands(senderId, lowerText, originalText) {
  // Greetings
  if (lowerText.includes('hello') || lowerText.includes('hi') || 
      lowerText.includes('kumusta') || lowerText.includes('good') ||
      lowerText.includes('start')) {
    await sendWelcomeMessage(senderId);
  }
  // Add new item commands
  else if (lowerText.includes('add') || lowerText.includes('dagdag') ||
           lowerText.includes('bago') || lowerText.includes('new')) {
    await messengerModule.sendTextMessage(senderId, 
      '📦 Mag-add ng item\n\nI-format: "[Item name] [price] [quantity]"\nHalimbawa: "Coca-Cola 15 20pcs"');
  }
  // Sales/sold commands
  else if (lowerText.includes('sold') || lowerText.includes('nabenta') ||
           lowerText.includes('sale') || lowerText.includes('benta')) {
    await messengerModule.sendTextMessage(senderId, 
      '💰 Record ng benta\n\nI-format: "Sold [item] [quantity]"\nHalimbawa: "Sold Coca-Cola 5pcs"');
  }
  // Stock check commands
  else if (lowerText.includes('stock') || lowerText.includes('check') ||
           lowerText.includes('inventory') || lowerText.includes('tira')) {
    await messengerModule.sendTextMessage(senderId, 
      '📋 Stock Check\n\nI-type ang item na gusto mong i-check:\n"Stock [item name]"');
  }
  // Help commands
  else if (lowerText.includes('help') || lowerText.includes('tulong') ||
           lowerText.includes('commands') || lowerText.includes('?')) {
    await sendHelpMessage(senderId);
  }
  // Menu commands
  else if (lowerText.includes('menu') || lowerText.includes('options') ||
           lowerText.includes('main') || lowerText.includes('home')) {
    await sendMainMenu(senderId);
  }
  // Default response for unrecognized text
  else {
    await messengerModule.sendTextMessage(senderId, 
      `📝 Natanggap: "${originalText}"\n\nHindi ko naintindihan. Subukan ang menu o mag-type ng "help" para sa mga commands.`);
    await sendMainMenu(senderId);
  }
}

// Send welcome message for new users
async function sendWelcomeMessage(senderId) {
  const welcomeText = `🏪 Kumusta! Welcome sa KitaKits! \n\nAko ang inyong inventory assistant para sa sari-sari store, carinderia, at iba pang maliliit na negosyo.\n\n📱 Makakatulong ako sa:\n• 📦 Inventory tracking\n• 💰 Sales recording  \n• 📊 Business insights\n• 📸 Receipt scanning\n\nAno ang gusto ninyong gawin ngayon?`;
  
  await messengerModule.sendTextMessage(senderId, welcomeText);
  await sendMainMenu(senderId);
}

// Send main menu quick replies
async function sendMainMenu(senderId) {
  await messengerModule.sendQuickReplies(senderId, '🏪 Pumili ng aksyon:', [
    { title: '📦 New Item', payload: 'NEW_ITEM' },
    { title: '💰 Sold Item', payload: 'SOLD_ITEM' },
    { title: '📋 Check Stock', payload: 'CHECK_STOCK' },
    { title: '⚠️ Low Stock', payload: 'LOW_STOCK' },
    { title: '📅 Expiry Check', payload: 'EXPIRY_CHECK' },
    { title: '💵 Daily Sales', payload: 'DAILY_SALES' },
    { title: '📊 Summary', payload: 'SUMMARY' },
    { title: '❓ Help', payload: 'HELP' }
  ]);
}

// Send help message
async function sendHelpMessage(senderId) {
  const helpText = `❓ KitaKits Help - Mga Commands\n\n📦 INVENTORY:\n• "Add [item] [price] [qty]" - Magdagdag\n• "Stock [item]" - I-check ang stock\n\n💰 SALES:\n• "Sold [item] [qty]" - Record benta\n• "Daily sales" - Tingnan ang sales\n\n📸 IMAGES:\n• Mag-send ng receipt para sa auto-scan\n• Mag-send ng inventory photo\n\n🏪 QUICK ACTIONS:\nGamitin ang mga buttons sa baba para sa mabilis na aksyon!\n\n📞 Para sa tulong: I-type ang "menu"`;
  
  await messengerModule.sendTextMessage(senderId, helpText);
  await sendMainMenu(senderId);
}

// Check for low stock items (placeholder)
async function checkLowStockItems(senderId) {
  await messengerModule.sendTextMessage(senderId, 
    '⚠️ Low Stock Alert\n\nWalang nakitang low stock items sa ngayon.\n\nTip: Mag-add ng items with quantity para ma-track ang stock levels.');
  await sendMainMenu(senderId);
}

// Check for expiring items (placeholder)
async function checkExpiringItems(senderId) {
  await messengerModule.sendTextMessage(senderId, 
    '📅 Expiry Check\n\nWalang expiring items ngayon.\n\nTip: I-include ang expiry date kapag nag-add ng perishable items.');
  await sendMainMenu(senderId);
}

// Show daily sales (placeholder)
async function showDailySales(senderId) {
  await messengerModule.sendTextMessage(senderId, 
    '💵 Daily Sales Report\n\nToday\'s Sales: ₱0.00\nTransactions: 0\n\nMag-record ng sales para makita ang report!');
  await sendMainMenu(senderId);
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Analytics available at http://localhost:${PORT}/analytics`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
