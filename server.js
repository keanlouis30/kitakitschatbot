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
      const summary = await queryModule.generateBusinessSummary(senderId);
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
  // Smart inventory management - Add item with parsing
  else if (await parseAddItemCommand(senderId, lowerText, originalText)) {
    // Command was processed by parseAddItemCommand
    return;
  }
  // Smart inventory management - Sold item with parsing
  else if (await parseSoldItemCommand(senderId, lowerText, originalText)) {
    // Command was processed by parseSoldItemCommand
    return;
  }
  // Smart inventory management - Stock check with parsing
  else if (await parseStockCheckCommand(senderId, lowerText, originalText)) {
    // Command was processed by parseStockCheckCommand
    return;
  }
  // Add new item commands (fallback)
  else if (lowerText.includes('add') || lowerText.includes('dagdag') ||
           lowerText.includes('bago') || lowerText.includes('new')) {
    await messengerModule.sendTextMessage(senderId, 
      '📦 Mag-add ng item\n\nMga format:\n• "Add Coca-Cola 15 20pcs"\n• "Dagdag Rice 50 10kg"\n• "New Bread 25 15pcs"');
  }
  // Sales/sold commands (fallback)
  else if (lowerText.includes('sold') || lowerText.includes('nabenta') ||
           lowerText.includes('sale') || lowerText.includes('benta')) {
    await messengerModule.sendTextMessage(senderId, 
      '💰 Record ng benta\n\nMga format:\n• "Sold Coca-Cola 5pcs"\n• "Nabenta Rice 2kg"\n• "Sale Bread 3pcs"');
  }
  // Stock check commands (fallback)
  else if (lowerText.includes('stock') || lowerText.includes('check') ||
           lowerText.includes('inventory') || lowerText.includes('tira')) {
    await messengerModule.sendTextMessage(senderId, 
      '📋 Stock Check\n\nMga format:\n• "Stock Coca-Cola"\n• "Check Rice"\n• "Tira ng Bread"');
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
  // List all inventory
  else if (lowerText.includes('list') || lowerText.includes('show all') ||
           lowerText.includes('lahat') || lowerText.includes('inventory')) {
    await showAllInventory(senderId);
  }
  // Default response for unrecognized text
  else {
    await messengerModule.sendQuickReplies(senderId, 
      `📝 Hindi ko naintindihan ang "${originalText}"\n\nSubukan ang mga ito:`, [
      { title: '📦 Add Item', payload: 'NEW_ITEM' },
      { title: '📋 Check Stock', payload: 'CHECK_STOCK' },
      { title: '💰 Record Sale', payload: 'SOLD_ITEM' },
      { title: '❓ Help', payload: 'HELP' }
    ]);
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

// Check for expiring items (enhanced with real data)
async function checkExpiringItems(senderId) {
  try {
    const expiringItems = await databaseModule.getExpiringItems(senderId, 7);
    
    if (expiringItems.length === 0) {
      await messengerModule.sendTextMessage(senderId,
        '📅 Expiry Check\n\n✅ Walang expiring items ngayon!\n\nLahat ng items mo ay hindi pa malapit mag-expire sa loob ng 7 days.\n\n💡 Tip: I-include ang expiry date kapag nag-add ng perishable items para sa mas accurate tracking.');
    } else {
      let expiryMessage = `📅 EXPIRY ALERT! (${expiringItems.length} items)\n\n`;
      
      expiringItems.forEach((item, index) => {
        const expiryDate = new Date(item.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        const urgencyIcon = daysUntilExpiry <= 1 ? '🚨' : daysUntilExpiry <= 3 ? '⚠️' : '📅';
        
        expiryMessage += `${index + 1}. ${urgencyIcon} ${item.item_name}\n`;
        expiryMessage += `   📊 Stock: ${item.quantity} ${item.unit}\n`;
        expiryMessage += `   📅 Expires: ${expiryDate.toLocaleDateString()}`;
        
        if (daysUntilExpiry <= 1) {
          expiryMessage += ' (TODAY/TOMORROW!)';
        } else {
          expiryMessage += ` (${daysUntilExpiry} days)`;
        }
        
        expiryMessage += `\n   💰 Value: ₱${(item.price * item.quantity).toFixed(2)}\n\n`;
      });
      
      expiryMessage += '🛒 Consider selling these items soon or offering discounts!';
      await messengerModule.sendTextMessage(senderId, expiryMessage);
    }
    
    await sendMainMenu(senderId);
  } catch (error) {
    console.error('Expiry check error:', error);
    await messengerModule.sendTextMessage(senderId,
      '❌ May error sa pag-check ng expiring items. Subukan ulit.');
  }
}

// Smart text parsing functions

// Parse Add Item Commands (e.g., "Add Coca-Cola 15 20pcs", "Dagdag Rice 50 10kg")
async function parseAddItemCommand(senderId, lowerText, originalText) {
  const addPatterns = [
    /^(add|dagdag|new|bago)\s+([\w\s-]+?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+)\s*(\w+)?)?/i,
    /^([\w\s-]+?)\s+(\d+(?:\.\d+)?)(?:\s+(\d+)\s*(\w+)?)?$/i
  ];
  
  for (const pattern of addPatterns) {
    const match = originalText.match(pattern);
    if (match) {
      const isExplicitAdd = ['add', 'dagdag', 'new', 'bago'].includes(match[1]?.toLowerCase());
      let itemName, price, quantity, unit;
      
      if (isExplicitAdd) {
        itemName = match[2].trim();
        price = parseFloat(match[3]);
        quantity = parseInt(match[4]) || 1;
        unit = match[5] || 'pcs';
      } else if (match[2] && !isNaN(match[2])) { // Simple format: "ItemName Price Quantity"
        itemName = match[1].trim();
        price = parseFloat(match[2]);
        quantity = parseInt(match[3]) || 1;
        unit = match[4] || 'pcs';
      } else {
        continue; // Try next pattern
      }
      
      if (itemName && price > 0) {
        try {
          const result = await databaseModule.addInventoryItem({
            senderId,
            itemName,
            price,
            quantity,
            unit
          });
          
          if (result.created) {
            await messengerModule.sendTextMessage(senderId,
              `✅ Naidagdag sa inventory:\n\n📦 ${itemName}\n💰 ₱${price} per ${unit}\n📊 Quantity: ${quantity} ${unit}\n\n${itemName} ay nasa inventory mo na!`);
          } else if (result.updated) {
            await messengerModule.sendTextMessage(senderId,
              `✅ Na-update ang inventory:\n\n📦 ${itemName}\n💰 ₱${price} per ${unit}\n📊 New total: ${result.newQuantity} ${unit}\n\nNadagdag ang ${quantity} ${unit}!`);
          }
          
          await sendMainMenu(senderId);
          return true;
        } catch (error) {
          console.error('Add item error:', error);
          await messengerModule.sendTextMessage(senderId,
            `❌ May error sa pag-add ng ${itemName}. Subukan ulit.`);
          return true;
        }
      }
    }
  }
  return false;
}

// Parse Sold Item Commands (e.g., "Sold Coca-Cola 5pcs", "Nabenta Rice 2kg")
async function parseSoldItemCommand(senderId, lowerText, originalText) {
  const soldPatterns = [
    /^(sold|nabenta|sale|benta)\s+([\w\s-]+?)(?:\s+(\d+)\s*(\w+)?)?$/i
  ];
  
  for (const pattern of soldPatterns) {
    const match = originalText.match(pattern);
    if (match) {
      const itemName = match[2].trim();
      const quantity = parseInt(match[3]) || 1;
      const unit = match[4] || 'pcs';
      
      try {
        // Get item from inventory to check if it exists and get price
        const item = await databaseModule.getInventoryItem(senderId, itemName);
        
        if (!item) {
          await messengerModule.sendTextMessage(senderId,
            `❌ Hindi nakita ang "${itemName}" sa inventory mo.\n\nSubukan:\n• "Add ${itemName} [price] [qty]" muna\n• I-check ang spelling\n• "List" para tingnan lahat`);
          return true;
        }
        
        if (item.quantity < quantity) {
          await messengerModule.sendTextMessage(senderId,
            `⚠️ Kulang ang stock!\n\n📦 ${itemName}\n📊 Available: ${item.quantity} ${item.unit}\n🛒 Gusto mo ibenta: ${quantity} ${unit}\n\nHindi pwedeng mag-oversell.`);
          return true;
        }
        
        const totalAmount = item.price * quantity;
        
        // Record the sale
        await databaseModule.recordSale({
          senderId,
          itemName,
          quantitySold: quantity,
          unitPrice: item.price,
          totalAmount
        });
        
        const remainingStock = item.quantity - quantity;
        
        await messengerModule.sendTextMessage(senderId,
          `💰 Sale recorded!\n\n📦 ${itemName}\n🛒 Nabenta: ${quantity} ${item.unit}\n💵 @ ₱${item.price} each\n💸 Total: ₱${totalAmount.toFixed(2)}\n\n📊 Remaining stock: ${remainingStock} ${item.unit}`);
        
        if (remainingStock <= 5) {
          await messengerModule.sendTextMessage(senderId,
            `⚠️ LOW STOCK ALERT!\n\n📦 ${itemName} = ${remainingStock} ${item.unit} na lang\n\nTime to restock!`);
        }
        
        await sendMainMenu(senderId);
        return true;
        
      } catch (error) {
        console.error('Record sale error:', error);
        await messengerModule.sendTextMessage(senderId,
          `❌ May error sa pag-record ng sale. Subukan ulit.`);
        return true;
      }
    }
  }
  return false;
}

// Parse Stock Check Commands (e.g., "Stock Coca-Cola", "Check Rice", "Tira ng Bread")
async function parseStockCheckCommand(senderId, lowerText, originalText) {
  const stockPatterns = [
    /^(stock|check|tira)\s+(?:ng\s+)?([\w\s-]+?)$/i,
    /^([\w\s-]+?)\s+(stock|available|natira)$/i
  ];
  
  for (const pattern of stockPatterns) {
    const match = originalText.match(pattern);
    if (match) {
      let itemName;
      
      if (['stock', 'check', 'tira'].includes(match[1]?.toLowerCase())) {
        itemName = match[2].trim();
      } else {
        itemName = match[1].trim();
      }
      
      try {
        // Try exact match first
        let item = await databaseModule.getInventoryItem(senderId, itemName);
        
        if (!item) {
          // Try partial search if exact match fails
          const searchResults = await databaseModule.searchInventoryItems(senderId, itemName);
          
          if (searchResults.length === 0) {
            await messengerModule.sendTextMessage(senderId,
              `❌ Hindi nakita ang "${itemName}" sa inventory.\n\nSubukan:\n• I-check ang spelling\n• "List" para tingnan lahat\n• "Add ${itemName} [price] [qty]" kung wala pa`);
            return true;
          } else if (searchResults.length === 1) {
            item = searchResults[0];
          } else {
            // Multiple matches found
            let matchList = 'Nakita ko ang mga ito:\n\n';
            searchResults.slice(0, 5).forEach((result, index) => {
              matchList += `${index + 1}. 📦 ${result.item_name} - ${result.quantity} ${result.unit} @ ₱${result.price}\n`;
            });
            
            matchList += `\nI-type ang exact name ng item na gusto mo i-check.`;
            await messengerModule.sendTextMessage(senderId, matchList);
            return true;
          }
        }
        
        // Display item details
        const stockStatus = item.quantity <= 5 ? '⚠️ LOW STOCK' : 
                           item.quantity <= 10 ? '🟡 MEDIUM STOCK' : '✅ GOOD STOCK';
        
        await messengerModule.sendTextMessage(senderId,
          `📦 ${item.item_name}\n\n📊 Stock: ${item.quantity} ${item.unit}\n💰 Price: ₱${item.price} per ${item.unit}\n📈 Status: ${stockStatus}\n🗓️ Last updated: ${new Date(item.updated_at).toLocaleDateString()}`);
        
        await sendMainMenu(senderId);
        return true;
        
      } catch (error) {
        console.error('Stock check error:', error);
        await messengerModule.sendTextMessage(senderId,
          `❌ May error sa pag-check ng stock. Subukan ulit.`);
        return true;
      }
    }
  }
  return false;
}

// Show all inventory items
async function showAllInventory(senderId) {
  try {
    const items = await databaseModule.getAllInventoryItems(senderId, 20);
    
    if (items.length === 0) {
      await messengerModule.sendTextMessage(senderId,
        '📦 Walang items sa inventory mo pa.\n\nMag-add ng items gamit ang:\n"Add [item] [price] [quantity]"\n\nHalimbawa: "Add Coca-Cola 15 24pcs"');
      await sendMainMenu(senderId);
      return;
    }
    
    let inventoryList = `📦 YOUR INVENTORY (${items.length} items)\n\n`;
    let totalValue = 0;
    
    items.forEach((item, index) => {
      const itemValue = item.price * item.quantity;
      totalValue += itemValue;
      const stockStatus = item.quantity <= 5 ? '⚠️' : item.quantity <= 10 ? '🟡' : '✅';
      
      inventoryList += `${index + 1}. ${stockStatus} ${item.item_name}\n`;
      inventoryList += `   📊 ${item.quantity} ${item.unit} @ ₱${item.price}\n`;
      inventoryList += `   💰 Value: ₱${itemValue.toFixed(2)}\n\n`;
    });
    
    inventoryList += `💼 TOTAL INVENTORY VALUE: ₱${totalValue.toFixed(2)}`;
    
    await messengerModule.sendTextMessage(senderId, inventoryList);
    await sendMainMenu(senderId);
    
  } catch (error) {
    console.error('Show inventory error:', error);
    await messengerModule.sendTextMessage(senderId,
      '❌ May error sa pag-display ng inventory. Subukan ulit.');
  }
}

// Update low stock check to use real data
async function checkLowStockItems(senderId) {
  try {
    const lowStockItems = await databaseModule.getLowStockItems(senderId, 10);
    
    if (lowStockItems.length === 0) {
      await messengerModule.sendTextMessage(senderId,
        '✅ Walang low stock items!\n\nLahat ng items mo ay may sapat na stock.');
    } else {
      let alertMessage = `⚠️ LOW STOCK ALERT! (${lowStockItems.length} items)\n\n`;
      
      lowStockItems.forEach((item, index) => {
        alertMessage += `${index + 1}. 📦 ${item.item_name}\n`;
        alertMessage += `   📊 ${item.quantity} ${item.unit} na lang\n`;
        alertMessage += `   💰 ₱${item.price} per ${item.unit}\n\n`;
      });
      
      alertMessage += '🛒 Time to restock these items!';
      await messengerModule.sendTextMessage(senderId, alertMessage);
    }
    
    await sendMainMenu(senderId);
  } catch (error) {
    console.error('Low stock check error:', error);
    await messengerModule.sendTextMessage(senderId,
      '❌ May error sa pag-check ng low stock. Subukan ulit.');
  }
}

// Update daily sales to use real data
async function showDailySales(senderId) {
  try {
    const salesSummary = await databaseModule.getSalesSummary(senderId, 1);
    
    if (salesSummary.length === 0) {
      await messengerModule.sendTextMessage(senderId,
        '💵 Daily Sales Report\n\nToday\'s Sales: ₱0.00\nTransactions: 0\n\n📝 Mag-record ng sales para makita ang detailed report!');
    } else {
      let totalRevenue = salesSummary.reduce((sum, item) => sum + item.total_revenue, 0);
      let totalTransactions = salesSummary.reduce((sum, item) => sum + item.transaction_count, 0);
      
      let salesReport = `💵 TODAY'S SALES REPORT\n\n`;
      salesReport += `💰 Total Revenue: ₱${totalRevenue.toFixed(2)}\n`;
      salesReport += `🛒 Total Transactions: ${totalTransactions}\n\n`;
      salesReport += `📊 TOP SELLERS:\n\n`;
      
      salesSummary.slice(0, 5).forEach((item, index) => {
        salesReport += `${index + 1}. 📦 ${item.item_name}\n`;
        salesReport += `   🛒 Sold: ${item.total_sold} pcs\n`;
        salesReport += `   💰 Revenue: ₱${item.total_revenue.toFixed(2)}\n\n`;
      });
      
      await messengerModule.sendTextMessage(senderId, salesReport);
    }
    
    await sendMainMenu(senderId);
  } catch (error) {
    console.error('Daily sales error:', error);
    await messengerModule.sendTextMessage(senderId,
      '❌ May error sa pag-generate ng sales report. Subukan ulit.');
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Analytics available at http://localhost:${PORT}/analytics`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
