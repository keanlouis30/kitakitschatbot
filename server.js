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
      
    // NEW HANDLERS
    case 'ADD_ITEM_TO_INVENTORY':
      await handleAddItemToInventory(senderId);
      break;
      
    case 'ADD_STOCK_TO_ITEM':
      await handleAddStockToItem(senderId);
      break;
      
    case 'CHANGE_ITEM_PRICE':
      await handleChangeItemPrice(senderId);
      break;
      
    case 'ITEM_SOLD':
      await handleItemSold(senderId);
      break;
      
    case 'READ_RECEIPT':
      await handleReadReceipt(senderId);
      break;
      
    case 'SUMMARY':
      const summary = await queryModule.generateBusinessSummary(senderId);
      await messengerModule.sendTextMessage(senderId, summary);
      await sendMainMenu(senderId);
      break;
      
    // LEGACY HANDLERS (kept for backward compatibility)
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
      // Handle item selection for add stock, change price, or item sold
      if (payload.startsWith('ADD_STOCK_')) {
        await handleAddStockSelected(senderId, payload.replace('ADD_STOCK_', ''));
      } else if (payload.startsWith('CHANGE_PRICE_')) {
        await handleChangePriceSelected(senderId, payload.replace('CHANGE_PRICE_', ''));
      } else if (payload.startsWith('ITEM_SOLD_')) {
        await handleItemSoldSelected(senderId, payload.replace('ITEM_SOLD_', ''));
      } else {
        await sendMainMenu(senderId);
      }
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
  // Handle numeric inputs (price changes, stock additions, sales quantities)
  else if (await parseNumericInput(senderId, lowerText, originalText)) {
    // Command was processed by parseNumericInput
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
    { title: '📦 Add Item to Inventory', payload: 'ADD_ITEM_TO_INVENTORY' },
    { title: '➕ Add Stock to Item', payload: 'ADD_STOCK_TO_ITEM' },
    { title: '💰 Change Item Price', payload: 'CHANGE_ITEM_PRICE' },
    { title: '📤 Item Sold', payload: 'ITEM_SOLD' },
    { title: '📊 Summary', payload: 'SUMMARY' },
    { title: '🧾 Read Receipt', payload: 'READ_RECEIPT' }
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

// Parse numeric inputs for price changes, stock additions, and sales quantities
async function parseNumericInput(senderId, lowerText, originalText) {
  // Check if input is purely numeric (with optional decimal point)
  const numericPattern = /^(\d+(?:\.\d+)?)$/;
  const match = originalText.trim().match(numericPattern);
  
  if (match) {
    const numericValue = parseFloat(match[1]);
    
    if (numericValue > 0) {
      // Get the user's last few interactions to understand context
      try {
        const recentInteractions = await databaseModule.getUserInteractions(senderId, 5);
        
        // Look for recent context clues in the last interactions
        for (const interaction of recentInteractions) {
          const content = interaction.content?.toLowerCase();
          
          // Check for price change context
          if (content?.includes('change price') || content?.includes('bagong price')) {
            // Find the most recent item ID from ADD_STOCK_, CHANGE_PRICE_, or ITEM_SOLD_ pattern
            const itemIdMatch = content.match(/(add_stock_|change_price_|item_sold_)(\d+)/);
            if (itemIdMatch) {
              const itemId = itemIdMatch[2];
              return await handleNumericPriceChange(senderId, itemId, numericValue);
            }
          }
          
          // Check for add stock context
          else if (content?.includes('adding stock') || content?.includes('quantity na idadagdag')) {
            const itemIdMatch = content.match(/(add_stock_|change_price_|item_sold_)(\d+)/);
            if (itemIdMatch) {
              const itemId = itemIdMatch[2];
              return await handleNumericStockAddition(senderId, itemId, numericValue);
            }
          }
          
          // Check for sales context
          else if (content?.includes('record sale') || content?.includes('quantity na nabenta')) {
            const itemIdMatch = content.match(/(add_stock_|change_price_|item_sold_)(\d+)/);
            if (itemIdMatch) {
              const itemId = itemIdMatch[2];
              return await handleNumericSalesRecord(senderId, itemId, numericValue);
            }
          }
        }
        
        // If no clear context found, provide helpful suggestions
        await messengerModule.sendTextMessage(senderId,
          `🔢 Nakita ko ang number "${numericValue}" pero hindi ko alam kung para saan ito.\n\nPwede mo gamitin ang:\n• Quick Reply buttons para sa specific actions\n• "Menu" para sa main options\n• O i-describe mo kung ano ang gusto mong gawin`);
        
        await sendMainMenu(senderId);
        return true;
        
      } catch (error) {
        console.error('Numeric input parsing error:', error);
        return false;
      }
    }
  }
  
  return false;
}

// Handle numeric input for price changes
async function handleNumericPriceChange(senderId, itemId, newPrice) {
  try {
    const updatedItem = await databaseModule.updateItemPrice(senderId, itemId, newPrice);
    
    await messengerModule.sendTextMessage(senderId,
      `✅ Price updated successfully!\n\n📦 ${updatedItem.item_name}\n💰 New Price: ₱${newPrice}\n📊 Current Stock: ${updatedItem.quantity} ${updatedItem.unit}\n\n✨ Updated na ang price!`);
    
    await sendMainMenu(senderId);
    return true;
    
  } catch (error) {
    console.error('Price update error:', error);
    await messengerModule.sendTextMessage(senderId,
      `❌ May error sa pag-update ng price. Siguro hindi mo item o may problema sa database.`);
    await sendMainMenu(senderId);
    return true;
  }
}

// Handle numeric input for stock additions
async function handleNumericStockAddition(senderId, itemId, quantityToAdd) {
  try {
    const updatedItem = await databaseModule.addStockToItem(senderId, itemId, quantityToAdd);
    
    await messengerModule.sendTextMessage(senderId,
      `✅ Stock added successfully!\n\n📦 ${updatedItem.item_name}\n➕ Added: ${quantityToAdd} ${updatedItem.unit}\n📊 New Total Stock: ${updatedItem.quantity} ${updatedItem.unit}\n💰 Price: ₱${updatedItem.price} per ${updatedItem.unit}\n\n🎉 Stock updated!`);
    
    await sendMainMenu(senderId);
    return true;
    
  } catch (error) {
    console.error('Stock addition error:', error);
    await messengerModule.sendTextMessage(senderId,
      `❌ May error sa pag-add ng stock. Siguro hindi mo item o may problema sa database.`);
    await sendMainMenu(senderId);
    return true;
  }
}

// Handle numeric input for sales recording
async function handleNumericSalesRecord(senderId, itemId, quantitySold) {
  try {
    const saleResult = await databaseModule.recordSaleById(senderId, itemId, quantitySold);
    
    await messengerModule.sendTextMessage(senderId,
      `💰 Sale recorded successfully!\n\n📦 ${saleResult.itemName}\n🛒 Sold: ${quantitySold} units\n💵 Unit Price: ₱${saleResult.unitPrice}\n💸 Total Amount: ₱${saleResult.totalAmount.toFixed(2)}\n\n📊 Remaining Stock: ${saleResult.remainingStock} units`);
    
    // Low stock warning
    if (saleResult.remainingStock <= 5) {
      await messengerModule.sendTextMessage(senderId,
        `⚠️ LOW STOCK ALERT!\n\n📦 ${saleResult.itemName} = ${saleResult.remainingStock} units na lang\n\nTime to restock!`);
    }
    
    await sendMainMenu(senderId);
    return true;
    
  } catch (error) {
    console.error('Sales recording error:', error);
    
    if (error.message === 'Insufficient stock') {
      await messengerModule.sendTextMessage(senderId,
        `❌ Kulang ang stock! Hindi pwedeng mag-oversell.\n\nI-check muna ang available stock gamit ang "List" command.`);
    } else {
      await messengerModule.sendTextMessage(senderId,
        `❌ May error sa pag-record ng sale. Subukan ulit.`);
    }
    
    await sendMainMenu(senderId);
    return true;
  }
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

// NEW HANDLER FUNCTIONS

// Handle Add Item to Inventory
async function handleAddItemToInventory(senderId) {
  await messengerModule.sendTextMessage(senderId, 
    '📦 *Add New Item to Inventory*\n\nI-type ang item details sa format na ito:\n\n**Format:** "[Item Name] [Price] [Quantity] [Unit]"\n\n**Examples:**\n• "Coca-Cola 15 24 pcs"\n• "Rice 50 10 kg"\n• "Bread 25 20 pcs"\n\nO kaya i-type lang ang:\n• Item name at price: "Shampoo 120"\n• System ay mag-assume ng 1 pcs');
}

// Handle Add Stock to Item (shows item selection menu)
async function handleAddStockToItem(senderId) {
  try {
    const items = await databaseModule.getAllInventoryItems(senderId, 10);
    
    if (items.length === 0) {
      await messengerModule.sendTextMessage(senderId,
        '📦 Walang items sa inventory mo pa.\n\nMag-add ng items muna using "Add Item to Inventory"');
      await sendMainMenu(senderId);
      return;
    }
    
    // Create quick replies for each item (max 13 for Messenger limits)
    const quickReplies = items.slice(0, 10).map(item => ({
      title: `${item.item_name} (${item.quantity} ${item.unit})`,
      payload: `ADD_STOCK_${item.id}`
    }));
    
    // Add back to main menu option
    quickReplies.push({ title: '🏠 Main Menu', payload: 'MAIN_MENU' });
    
    await messengerModule.sendQuickReplies(senderId, 
      '➕ *Add Stock to Item*\n\nPiliin ang item na gusto mong dagdagan ng stock:', 
      quickReplies);
      
  } catch (error) {
    console.error('Add stock to item error:', error);
    await messengerModule.sendTextMessage(senderId, 
      '❌ May error sa pag-load ng items. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle when user selects an item to add stock to
async function handleAddStockSelected(senderId, itemId) {
  try {
    // Get the item details
    const item = await databaseModule.getInventoryItem(senderId, '', itemId); // We need to modify this function to accept ID
    
    if (!item) {
      await messengerModule.sendTextMessage(senderId,
        '❌ Item not found. Returning to main menu.');
      await sendMainMenu(senderId);
      return;
    }
    
    // Store the selected item ID in a temporary way (we'll use text parsing)
    await messengerModule.sendTextMessage(senderId,
      `➕ *Adding Stock to: ${item.item_name}*\n\nCurrent Stock: ${item.quantity} ${item.unit}\nPrice: ₱${item.price} per ${item.unit}\n\n**I-type ang quantity na idadagdag:**\n\nExample: "5" (para mag-add ng 5 ${item.unit})\n\nNote: I-type lang ang number`);
    
    // We'll handle the response in text parsing by checking for numbers and matching with recent context
    
  } catch (error) {
    console.error('Add stock selected error:', error);
    await messengerModule.sendTextMessage(senderId, 
      '❌ May error. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle Change Item Price (shows item selection menu)
async function handleChangeItemPrice(senderId) {
  try {
    const items = await databaseModule.getAllInventoryItems(senderId, 10);
    
    if (items.length === 0) {
      await messengerModule.sendTextMessage(senderId,
        '📦 Walang items sa inventory mo pa.\n\nMag-add ng items muna using "Add Item to Inventory"');
      await sendMainMenu(senderId);
      return;
    }
    
    // Create quick replies for each item
    const quickReplies = items.slice(0, 10).map(item => ({
      title: `${item.item_name} (₱${item.price})`,
      payload: `CHANGE_PRICE_${item.id}`
    }));
    
    // Add back to main menu option
    quickReplies.push({ title: '🏠 Main Menu', payload: 'MAIN_MENU' });
    
    await messengerModule.sendQuickReplies(senderId, 
      '💰 *Change Item Price*\n\nPiliin ang item na gusto mong baguhin ang price:', 
      quickReplies);
      
  } catch (error) {
    console.error('Change item price error:', error);
    await messengerModule.sendTextMessage(senderId, 
      '❌ May error sa pag-load ng items. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle when user selects an item to change price
async function handleChangePriceSelected(senderId, itemId) {
  try {
    // Similar to add stock, we'll use text parsing to handle the price change
    await messengerModule.sendTextMessage(senderId,
      `💰 *Change Price*\n\n**I-type ang bagong price:**\n\nExample: "25" (para maging ₱25)\n"15.50" (para maging ₱15.50)\n\nNote: I-type lang ang number/amount`);
    
  } catch (error) {
    console.error('Change price selected error:', error);
    await messengerModule.sendTextMessage(senderId, 
      '❌ May error. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle Item Sold (shows item selection menu)
async function handleItemSold(senderId) {
  try {
    const items = await databaseModule.getAllInventoryItems(senderId, 10);
    
    if (items.length === 0) {
      await messengerModule.sendTextMessage(senderId,
        '📦 Walang items sa inventory mo pa.\n\nMag-add ng items muna using "Add Item to Inventory"');
      await sendMainMenu(senderId);
      return;
    }
    
    // Create quick replies for each item with stock info
    const quickReplies = items.slice(0, 10).map(item => ({
      title: `${item.item_name} (${item.quantity} ${item.unit})`,
      payload: `ITEM_SOLD_${item.id}`
    }));
    
    // Add back to main menu option
    quickReplies.push({ title: '🏠 Main Menu', payload: 'MAIN_MENU' });
    
    await messengerModule.sendQuickReplies(senderId, 
      '📤 *Record Item Sold*\n\nPiliin ang item na nabenta:', 
      quickReplies);
      
  } catch (error) {
    console.error('Item sold error:', error);
    await messengerModule.sendTextMessage(senderId, 
      '❌ May error sa pag-load ng items. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle when user selects an item that was sold
async function handleItemSoldSelected(senderId, itemId) {
  try {
    await messengerModule.sendTextMessage(senderId,
      `📤 *Record Sale*\n\n**I-type ang quantity na nabenta:**\n\nExample: "3" (para sa 3 pieces)\n"2.5" (para sa 2.5 kg)\n\nNote: I-type lang ang number/amount`);
    
  } catch (error) {
    console.error('Item sold selected error:', error);
    await messengerModule.sendTextMessage(senderId, 
      '❌ May error. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle Read Receipt (placeholder)
async function handleReadReceipt(senderId) {
  await messengerModule.sendTextMessage(senderId,
    '🧾 *Read Receipt*\n\n📸 Mag-send ng larawan ng receipt para ma-scan at ma-extract ang information.\n\nFeature coming soon! 🚧');
  await sendMainMenu(senderId);
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Analytics available at http://localhost:${PORT}/analytics`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
