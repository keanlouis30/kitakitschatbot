const ocrModule = require('./ocr');
const databaseModule = require('./database');
const messengerModule = require('./messenger');

/**
 * Onboarding states for new users
 */
const ONBOARDING_STATES = {
  WELCOME: 'welcome',
  CHOOSE_SETUP_TYPE: 'choose_setup_type',
  UPLOAD_INVENTORY: 'upload_inventory',
  UPLOAD_SALES: 'upload_sales',
  CONFIRM_EXTRACTED_DATA: 'confirm_extracted_data',
  MANUAL_CORRECTION: 'manual_correction',
  SETUP_COMPLETE: 'setup_complete'
};

/**
 * Check if user is new (has no inventory items and no sales)
 */
async function isNewUser(senderId) {
  try {
    const inventoryItems = await databaseModule.getAllInventoryItems(senderId, 1);
    const salesTransactions = await databaseModule.getSalesSummary(senderId);
    
    return inventoryItems.length === 0 && (!salesTransactions || salesTransactions.totalSales === 0);
  } catch (error) {
    console.error('Error checking if user is new:', error);
    return true; // Assume new user on error
  }
}

/**
 * Start the onboarding process for new users
 */
async function startOnboarding(senderId) {
  try {
    // Store onboarding state
    await storeOnboardingState(senderId, ONBOARDING_STATES.WELCOME);
    
    const welcomeMessage = `🎉 **Welcome to KitaKits!**\n\n` +
      `I'm here to help you manage your inventory and track your sales. ` +
      `Let's get you set up quickly by using your existing records!\n\n` +
      `📸 **Quick Setup Options:**\n` +
      `• Upload a photo of your current inventory list\n` +
      `• Upload a photo of today's sales records\n` +
      `• Upload multiple photos of receipts/invoices\n\n` +
      `This will automatically populate your inventory and sales data!`;
    
    await messengerModule.sendTextMessage(senderId, welcomeMessage);
    
    await messengerModule.sendQuickReplies(senderId, 
      '📋 What would you like to set up first?', [
        { title: '📦 My Current Inventory', payload: 'ONBOARD_INVENTORY' },
        { title: '💰 Today\'s Sales Record', payload: 'ONBOARD_SALES' },
        { title: '📝 Manual Setup Instead', payload: 'ONBOARD_MANUAL' },
        { title: '❓ How This Works', payload: 'ONBOARD_HELP' }
      ]
    );
    
    return true;
  } catch (error) {
    console.error('Error starting onboarding:', error);
    return false;
  }
}

/**
 * Handle onboarding quick reply responses
 */
async function handleOnboardingResponse(senderId, payload) {
  try {
    switch (payload) {
      case 'ONBOARD_INVENTORY':
        await setupInventoryUpload(senderId);
        break;
        
      case 'ONBOARD_SALES':
        await setupSalesUpload(senderId);
        break;
        
      case 'ONBOARD_MANUAL':
        await completeOnboarding(senderId);
        await messengerModule.sendTextMessage(senderId, 
          '📝 No problem! You can add items manually using commands like:\n\n' +
          '• "Add Rice 50 10kg" - to add inventory\n' +
          '• "Sold Bread 5pcs" - to record sales\n\n' +
          'Let me show you the main menu:');
        break;
        
      case 'ONBOARD_HELP':
        await showOnboardingHelp(senderId);
        break;
        
      default:
        await startOnboarding(senderId);
    }
  } catch (error) {
    console.error('Error handling onboarding response:', error);
    await messengerModule.sendTextMessage(senderId, 
      'Sorry, may problema sa setup. Subukan ulit.');
    await startOnboarding(senderId);
  }
}

/**
 * Setup inventory upload process
 */
async function setupInventoryUpload(senderId) {
  await storeOnboardingState(senderId, ONBOARDING_STATES.UPLOAD_INVENTORY);
  
  const instructionMessage = `📦 **Inventory Setup via Photo**\n\n` +
    `Please upload a photo of your current inventory. This could be:\n\n` +
    `📋 **Good photos to upload:**\n` +
    `• Hand-written inventory list\n` +
    `• Printed inventory sheets\n` +
    `• Store receipt with items you stock\n` +
    `• Product labels or price lists\n` +
    `• Notebook with stock records\n\n` +
    `📸 **Tips for best results:**\n` +
    `• Take photo in good lighting\n` +
    `• Keep text straight and clear\n` +
    `• Include item names, quantities, and prices\n` +
    `• You can upload multiple photos\n\n` +
    `Upload your first inventory photo now! 👇`;
  
  await messengerModule.sendTextMessage(senderId, instructionMessage);
}

/**
 * Setup sales upload process
 */
async function setupSalesUpload(senderId) {
  await storeOnboardingState(senderId, ONBOARDING_STATES.UPLOAD_SALES);
  
  const instructionMessage = `💰 **Sales Record Setup via Photo**\n\n` +
    `Please upload a photo of your sales records. This could be:\n\n` +
    `📋 **Good photos to upload:**\n` +
    `• Today's sales notebook entries\n` +
    `• Cash register receipts\n` +
    `• Hand-written sales log\n` +
    `• Customer receipts you've issued\n` +
    `• Sales summary sheets\n\n` +
    `📸 **Tips for best results:**\n` +
    `• Clear, readable text\n` +
    `• Good lighting\n` +
    `• Include item names, quantities sold, and prices\n` +
    `• Multiple photos are okay\n\n` +
    `Upload your first sales photo now! 👇`;
  
  await messengerModule.sendTextMessage(senderId, instructionMessage);
}

/**
 * Show onboarding help information
 */
async function showOnboardingHelp(senderId) {
  const helpMessage = `❓ **How Photo Setup Works**\n\n` +
    `1️⃣ **You upload photos** of your existing records\n` +
    `2️⃣ **I scan and read** the text from your photos\n` +
    `3️⃣ **I extract** item names, quantities, and prices\n` +
    `4️⃣ **You confirm** the data looks correct\n` +
    `5️⃣ **I automatically add** items to your inventory/sales\n\n` +
    `🔄 **Benefits:**\n` +
    `• Save hours of manual data entry\n` +
    `• Get started immediately\n` +
    `• Reduce typing errors\n` +
    `• Works with handwritten or printed text\n\n` +
    `🔒 **Privacy:** Your photos are processed securely and deleted after text extraction.\n\n` +
    `Ready to try it?`;
  
  await messengerModule.sendTextMessage(senderId, helpMessage);
  
  await messengerModule.sendQuickReplies(senderId, 
    'What would you like to set up?', [
      { title: '📦 Upload Inventory', payload: 'ONBOARD_INVENTORY' },
      { title: '💰 Upload Sales', payload: 'ONBOARD_SALES' },
      { title: '📝 Manual Setup', payload: 'ONBOARD_MANUAL' }
    ]
  );
}

/**
 * Process uploaded image during onboarding
 */
async function processOnboardingImage(senderId, imageUrl) {
  try {
    const currentState = await getOnboardingState(senderId);
    
    if (!currentState || 
        (currentState !== ONBOARDING_STATES.UPLOAD_INVENTORY && 
         currentState !== ONBOARDING_STATES.UPLOAD_SALES)) {
      return false; // Not in onboarding image upload state
    }
    
    // Show processing message
    await messengerModule.sendTextMessage(senderId, 
      '📸 Processing your photo... This may take a moment.');
    await messengerModule.sendTypingIndicator(senderId, true);
    
    // Use smart OCR based on onboarding type
    let ocrResult;
    
    if (currentState === ONBOARDING_STATES.UPLOAD_INVENTORY) {
      // Use intelligent inventory extraction
      ocrResult = await ocrModule.extractInventoryFromImage(imageUrl);
    } else if (currentState === ONBOARDING_STATES.UPLOAD_SALES) {
      // Use intelligent sales extraction
      ocrResult = await ocrModule.extractSalesFromImage(imageUrl);
    } else {
      // Fallback to general text extraction
      ocrResult = await ocrModule.extractTextFromImage(imageUrl);
    }
    
    // Store OCR result
    await databaseModule.insertOCRResult({
      senderId,
      imageUrl,
      extractedText: ocrResult.rawText || ocrResult.text,
      confidence: ocrResult.confidence || (ocrResult.success ? 90 : 50),
      timestamp: new Date().toISOString()
    });
    
    await messengerModule.sendTypingIndicator(senderId, false);
    
    // Process the extracted data based on onboarding type
    if (currentState === ONBOARDING_STATES.UPLOAD_INVENTORY) {
      await processInventoryData(senderId, ocrResult);
    } else if (currentState === ONBOARDING_STATES.UPLOAD_SALES) {
      await processSalesData(senderId, ocrResult);
    }
    
    return true;
  } catch (error) {
    console.error('Error processing onboarding image:', error);
    await messengerModule.sendTextMessage(senderId, 
      '❌ Sorry, I had trouble reading that photo. Please try uploading another one with clear, readable text.');
    return false;
  }
}

/**
 * Process and confirm inventory data from OCR
 */
async function processInventoryData(senderId, ocrResult) {
  try {
    let extractedItems = [];
    
    // Check if Gemini OCR provided structured inventory data
    if (ocrResult.items && Array.isArray(ocrResult.items)) {
      // Use structured data from Gemini OCR
      extractedItems = ocrResult.items.map(item => ({
        name: item.name || item.item_name,
        quantity: parseInt(item.quantity) || 1,
        unit: item.unit || 'pcs',
        price: parseFloat(item.price || item.unit_price || 0),
        category: item.category || guessCategory(item.name || item.item_name)
      }));
    } else {
      // Fallback to text parsing for legacy OCR
      const textToProcess = ocrResult.rawText || ocrResult.text || '';
      extractedItems = parseInventoryFromText(textToProcess);
    }
    
    if (extractedItems.length === 0) {
      const displayText = ocrResult.rawText || ocrResult.text || 'No text extracted';
      await messengerModule.sendTextMessage(senderId, 
        `📸 I scanned your photo but couldn't find any inventory items.\n\n` +
        `**Text I found:**\n"${displayText}"\n\n` +
        `Please try another photo with clearer text showing item names, quantities, and prices.`);
      return;
    }
    
    // Store extracted items temporarily for confirmation
    await storeTemporaryData(senderId, 'inventory', extractedItems);
    await storeOnboardingState(senderId, ONBOARDING_STATES.CONFIRM_EXTRACTED_DATA);
    
    let confirmMessage = `📦 **Found ${extractedItems.length} inventory items:**\n\n`;
    
    extractedItems.slice(0, 10).forEach((item, index) => {
      confirmMessage += `${index + 1}. ${item.name} - ${item.quantity} ${item.unit} @ ₱${item.price}\n`;
    });
    
    if (extractedItems.length > 10) {
      confirmMessage += `\n... and ${extractedItems.length - 10} more items\n`;
    }
    
    confirmMessage += `\n**Confidence:** ${Math.round(ocrResult.confidence)}%\n\n`;
    confirmMessage += `Is this data correct?`;
    
    await messengerModule.sendTextMessage(senderId, confirmMessage);
    
    await messengerModule.sendQuickReplies(senderId, 
      'Confirm the extracted inventory data:', [
        { title: '✅ Yes, Add All Items', payload: 'ONBOARD_CONFIRM_INVENTORY' },
        { title: '📝 Let Me Review/Edit', payload: 'ONBOARD_REVIEW_INVENTORY' },
        { title: '📸 Try Another Photo', payload: 'ONBOARD_RETRY_PHOTO' },
        { title: '❌ Skip This Step', payload: 'ONBOARD_SKIP' }
      ]
    );
    
  } catch (error) {
    console.error('Error processing inventory data:', error);
    await messengerModule.sendTextMessage(senderId, 
      'Error processing inventory data. Please try another photo.');
  }
}

/**
 * Process and confirm sales data from OCR
 */
async function processSalesData(senderId, ocrResult) {
  try {
    let extractedSales = [];
    
    // Check if Gemini OCR provided structured sales data
    if (ocrResult.sales && Array.isArray(ocrResult.sales)) {
      // Use structured data from Gemini OCR
      extractedSales = ocrResult.sales.map(sale => ({
        itemName: sale.item_name || sale.product_name || sale.name,
        quantity: parseInt(sale.quantity) || 1,
        price: parseFloat(sale.unit_price || sale.price || 0),
        unit: sale.unit || 'pcs'
      }));
    } else if (ocrResult.items && Array.isArray(ocrResult.items)) {
      // Handle cases where sales are returned as items array
      extractedSales = ocrResult.items.map(item => ({
        itemName: item.name || item.item_name,
        quantity: parseInt(item.quantity_sold || item.quantity || 1),
        price: parseFloat(item.unit_price || item.price || 0),
        unit: item.unit || 'pcs'
      }));
    } else {
      // Fallback to text parsing for legacy OCR
      const textToProcess = ocrResult.rawText || ocrResult.text || '';
      extractedSales = parseSalesFromText(textToProcess);
    }
    
    if (extractedSales.length === 0) {
      const displayText = ocrResult.rawText || ocrResult.text || 'No text extracted';
      await messengerModule.sendTextMessage(senderId, 
        `📸 I scanned your photo but couldn't find any sales data.\n\n` +
        `**Text I found:**\n"${displayText}"\n\n` +
        `Please try another photo with clearer sales information.`);
      return;
    }
    
    // Store extracted sales temporarily for confirmation
    await storeTemporaryData(senderId, 'sales', extractedSales);
    await storeOnboardingState(senderId, ONBOARDING_STATES.CONFIRM_EXTRACTED_DATA);
    
    let confirmMessage = `💰 **Found ${extractedSales.length} sales transactions:**\n\n`;
    
    const totalAmount = extractedSales.reduce((sum, sale) => sum + (sale.quantity * sale.price), 0);
    
    extractedSales.slice(0, 10).forEach((sale, index) => {
      confirmMessage += `${index + 1}. ${sale.itemName} - ${sale.quantity} ${sale.unit || 'pcs'} @ ₱${sale.price} = ₱${sale.quantity * sale.price}\n`;
    });
    
    if (extractedSales.length > 10) {
      confirmMessage += `\n... and ${extractedSales.length - 10} more transactions\n`;
    }
    
    confirmMessage += `\n**Total Sales:** ₱${totalAmount.toFixed(2)}\n`;
    confirmMessage += `**Confidence:** ${Math.round(ocrResult.confidence)}%\n\n`;
    confirmMessage += `Is this sales data correct?`;
    
    await messengerModule.sendTextMessage(senderId, confirmMessage);
    
    await messengerModule.sendQuickReplies(senderId, 
      'Confirm the extracted sales data:', [
        { title: '✅ Yes, Record All Sales', payload: 'ONBOARD_CONFIRM_SALES' },
        { title: '📝 Let Me Review/Edit', payload: 'ONBOARD_REVIEW_SALES' },
        { title: '📸 Try Another Photo', payload: 'ONBOARD_RETRY_PHOTO' },
        { title: '❌ Skip This Step', payload: 'ONBOARD_SKIP' }
      ]
    );
    
  } catch (error) {
    console.error('Error processing sales data:', error);
    await messengerModule.sendTextMessage(senderId, 
      'Error processing sales data. Please try another photo.');
  }
}

/**
 * Parse inventory items from extracted text
 */
function parseInventoryFromText(text) {
  const items = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const item = parseInventoryLine(line);
    if (item) {
      items.push(item);
    }
  }
  
  return items;
}

/**
 * Parse individual inventory line
 */
function parseInventoryLine(line) {
  // Common patterns for inventory:
  // "Rice 5kg - 10pcs @ P50 each"
  // "Coca Cola 250ml x20 P15.00"
  // "Bread loaf 15 @ 25.00"
  // "Sugar 1kg - 5 units P65"
  
  const cleanLine = line.trim().replace(/[₱P]/g, '');
  
  // Pattern: Item name + quantity + price
  const patterns = [
    /^(.+?)\s+(\d+)\s*(?:pcs?|units?|kg|g|L|ml|bottles?|cans?|packs?)\s*[@x-]?\s*([\d.]+)/i,
    /^(.+?)\s*[-x@]\s*(\d+)\s*(?:pcs?|units?)?\s*[@x-]?\s*([\d.]+)/i,
    /^(.+?)\s+([\d.]+)\s*(?:pcs?|units?|kg|g|L|ml|bottles?|cans?|packs?)\s*([\d.]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanLine.match(pattern);
    if (match) {
      const name = match[1].trim();
      const quantity = parseInt(match[2]) || 1;
      const price = parseFloat(match[3]) || 0;
      
      if (name && price > 0) {
        return {
          name: name,
          quantity: quantity,
          unit: extractUnit(line) || 'pcs',
          price: price,
          category: guessCategory(name)
        };
      }
    }
  }
  
  return null;
}

/**
 * Parse sales from extracted text
 */
function parseSalesFromText(text) {
  const sales = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const sale = parseSalesLine(line);
    if (sale) {
      sales.push(sale);
    }
  }
  
  return sales;
}

/**
 * Parse individual sales line
 */
function parseSalesLine(line) {
  // Common patterns for sales:
  // "Sold Rice 2kg @ P50"
  // "Coca Cola x3 = P45"
  // "Bread 5pcs P125"
  
  const cleanLine = line.trim().replace(/[₱P]/g, '').replace(/sold|nabenta/gi, '');
  
  const patterns = [
    /^(.+?)\s+(\d+)\s*(?:pcs?|units?|kg|g|L|ml|bottles?|cans?|packs?)\s*[@=]?\s*([\d.]+)/i,
    /^(.+?)\s*[x@-]\s*(\d+)\s*(?:pcs?|units?)?\s*[=@]?\s*([\d.]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanLine.match(pattern);
    if (match) {
      const itemName = match[1].trim();
      const quantity = parseInt(match[2]) || 1;
      const totalOrUnitPrice = parseFloat(match[3]) || 0;
      
      if (itemName && totalOrUnitPrice > 0) {
        // Assume it's unit price if reasonable, otherwise total
        const unitPrice = totalOrUnitPrice > (quantity * 100) ? 
          totalOrUnitPrice / quantity : totalOrUnitPrice;
        
        return {
          itemName: itemName,
          quantity: quantity,
          price: unitPrice,
          unit: extractUnit(line) || 'pcs'
        };
      }
    }
  }
  
  return null;
}

/**
 * Extract unit from text line
 */
function extractUnit(line) {
  const units = ['kg', 'g', 'L', 'ml', 'pcs', 'piece', 'pieces', 'bottles', 'cans', 'packs', 'units'];
  
  for (const unit of units) {
    if (line.toLowerCase().includes(unit)) {
      return unit === 'piece' || unit === 'pieces' ? 'pcs' : unit;
    }
  }
  
  return 'pcs';
}

/**
 * Guess category based on item name
 */
function guessCategory(name) {
  const nameLower = name.toLowerCase();
  
  const categories = {
    'staples': ['rice', 'sugar', 'salt', 'flour'],
    'beverages': ['coke', 'coca cola', 'pepsi', 'juice', 'coffee', 'tea', 'soft drink'],
    'snacks': ['chips', 'biscuit', 'cookie', 'candy'],
    'household': ['soap', 'shampoo', 'detergent', 'toothpaste'],
    'dairy': ['milk', 'cheese', 'yogurt'],
    'fresh': ['bread', 'egg', 'vegetable', 'fruit'],
    'processed': ['noodles', 'sardines', 'corned beef', 'spam']
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => nameLower.includes(keyword))) {
      return category;
    }
  }
  
  return 'general';
}

/**
 * Handle confirmation of extracted data
 */
async function handleDataConfirmation(senderId, payload) {
  try {
    switch (payload) {
      case 'ONBOARD_CONFIRM_INVENTORY':
        await confirmAndAddInventory(senderId);
        break;
        
      case 'ONBOARD_CONFIRM_SALES':
        await confirmAndAddSales(senderId);
        break;
        
      case 'ONBOARD_RETRY_PHOTO':
        const state = await getOnboardingState(senderId);
        if (state === ONBOARDING_STATES.CONFIRM_EXTRACTED_DATA) {
          // Get the previous upload type from temporary data
          const tempData = await getTemporaryData(senderId);
          if (tempData && tempData.type === 'inventory') {
            await setupInventoryUpload(senderId);
          } else {
            await setupSalesUpload(senderId);
          }
        }
        break;
        
      case 'ONBOARD_SKIP':
        await completeOnboarding(senderId);
        break;
        
      default:
        break;
    }
  } catch (error) {
    console.error('Error handling data confirmation:', error);
    await messengerModule.sendTextMessage(senderId, 
      'Sorry, may problema sa confirmation. Subukan ulit.');
  }
}

/**
 * Confirm and add inventory items
 */
async function confirmAndAddInventory(senderId) {
  try {
    const tempData = await getTemporaryData(senderId);
    
    if (!tempData || tempData.type !== 'inventory') {
      throw new Error('No inventory data found');
    }
    
    const items = tempData.data;
    let successCount = 0;
    let errors = [];
    
    for (const item of items) {
      try {
        await databaseModule.addInventoryItem({
          senderId,
          itemName: item.name,
          price: item.price,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category
        });
        successCount++;
      } catch (error) {
        errors.push(`${item.name}: ${error.message}`);
      }
    }
    
    // Clear temporary data
    await clearTemporaryData(senderId);
    
    let resultMessage = `✅ **Inventory Setup Complete!**\n\n`;
    resultMessage += `📦 Successfully added ${successCount} items to your inventory.\n\n`;
    
    if (errors.length > 0) {
      resultMessage += `⚠️ ${errors.length} items had issues:\n`;
      resultMessage += errors.slice(0, 3).join('\n') + '\n\n';
    }
    
    resultMessage += `🎉 You're all set! You can now:\n`;
    resultMessage += `• Record sales: "Sold Rice 2kg"\n`;
    resultMessage += `• Check stock: "Stock Coca Cola"\n`;
    resultMessage += `• Add more items: "Add Bread 25 10pcs"\n`;
    resultMessage += `• View summary: Send "Summary"`;
    
    await messengerModule.sendTextMessage(senderId, resultMessage);
    
    // Ask if they want to upload sales data too
    await messengerModule.sendQuickReplies(senderId, 
      'Would you like to set up your sales records too?', [
        { title: '💰 Yes, Upload Sales Photo', payload: 'ONBOARD_SALES' },
        { title: '🏠 Go to Main Menu', payload: 'ONBOARD_COMPLETE' }
      ]
    );
    
  } catch (error) {
    console.error('Error confirming inventory:', error);
    await messengerModule.sendTextMessage(senderId, 
      'Sorry, there was an error adding your inventory items. Please try again.');
  }
}

/**
 * Confirm and add sales transactions
 */
async function confirmAndAddSales(senderId) {
  try {
    const tempData = await getTemporaryData(senderId);
    
    if (!tempData || tempData.type !== 'sales') {
      throw new Error('No sales data found');
    }
    
    const sales = tempData.data;
    let successCount = 0;
    let totalAmount = 0;
    let errors = [];
    
    for (const sale of sales) {
      try {
        await databaseModule.recordSale({
          senderId,
          itemName: sale.itemName,
          quantitySold: sale.quantity,
          unitPrice: sale.price,
          totalAmount: sale.quantity * sale.price
        });
        successCount++;
        totalAmount += sale.quantity * sale.price;
      } catch (error) {
        errors.push(`${sale.itemName}: ${error.message}`);
      }
    }
    
    // Clear temporary data
    await clearTemporaryData(senderId);
    
    let resultMessage = `✅ **Sales Setup Complete!**\n\n`;
    resultMessage += `💰 Successfully recorded ${successCount} sales transactions.\n`;
    resultMessage += `📊 Total sales amount: ₱${totalAmount.toFixed(2)}\n\n`;
    
    if (errors.length > 0) {
      resultMessage += `⚠️ ${errors.length} items had issues:\n`;
      resultMessage += errors.slice(0, 3).join('\n') + '\n\n';
    }
    
    resultMessage += `🎉 Great! Your sales are now tracked. You can:\n`;
    resultMessage += `• Record more sales: "Sold Bread 3pcs"\n`;
    resultMessage += `• View daily sales: "Daily sales"\n`;
    resultMessage += `• Check inventory: "List all items"\n`;
    resultMessage += `• Get reports: "Summary"`;
    
    await messengerModule.sendTextMessage(senderId, resultMessage);
    
    await completeOnboarding(senderId);
    
  } catch (error) {
    console.error('Error confirming sales:', error);
    await messengerModule.sendTextMessage(senderId, 
      'Sorry, there was an error recording your sales. Please try again.');
  }
}

/**
 * Complete the onboarding process
 */
async function completeOnboarding(senderId) {
  try {
    await storeOnboardingState(senderId, ONBOARDING_STATES.SETUP_COMPLETE);
    await clearTemporaryData(senderId);
    
    const completionMessage = `🎊 **Welcome to KitaKits!**\n\n` +
      `You're now ready to manage your inventory and track sales efficiently!\n\n` +
      `📱 **Quick Commands:**\n` +
      `• "Add [item] [price] [quantity]" - Add inventory\n` +
      `• "Sold [item] [quantity]" - Record sale\n` +
      `• "Stock [item]" - Check quantity\n` +
      `• "Summary" - View reports\n` +
      `• "Help" - See all commands\n\n` +
      `💡 **Pro Tip:** You can always upload photos of receipts or inventory lists, and I'll help you process them!`;
    
    await messengerModule.sendTextMessage(senderId, completionMessage);
    
    // The main menu will be called by server.js after consent completion
    // This completes the onboarding process
    
  } catch (error) {
    console.error('Error completing onboarding:', error);
  }
}

/**
 * Store onboarding state in memory/database
 */
async function storeOnboardingState(senderId, state) {
  // For now, store in memory. In production, use database or Redis
  global.onboardingStates = global.onboardingStates || {};
  global.onboardingStates[senderId] = {
    state: state,
    timestamp: Date.now()
  };
}

/**
 * Get onboarding state
 */
async function getOnboardingState(senderId) {
  global.onboardingStates = global.onboardingStates || {};
  const stateData = global.onboardingStates[senderId];
  
  if (!stateData) return null;
  
  // Clear expired states (older than 1 hour)
  if (Date.now() - stateData.timestamp > 60 * 60 * 1000) {
    delete global.onboardingStates[senderId];
    return null;
  }
  
  return stateData.state;
}

/**
 * Store temporary data during onboarding
 */
async function storeTemporaryData(senderId, type, data) {
  global.tempOnboardingData = global.tempOnboardingData || {};
  global.tempOnboardingData[senderId] = {
    type: type,
    data: data,
    timestamp: Date.now()
  };
}

/**
 * Get temporary data
 */
async function getTemporaryData(senderId) {
  global.tempOnboardingData = global.tempOnboardingData || {};
  const tempData = global.tempOnboardingData[senderId];
  
  if (!tempData) return null;
  
  // Clear expired data (older than 1 hour)
  if (Date.now() - tempData.timestamp > 60 * 60 * 1000) {
    delete global.tempOnboardingData[senderId];
    return null;
  }
  
  return tempData;
}

/**
 * Clear temporary data
 */
async function clearTemporaryData(senderId) {
  global.tempOnboardingData = global.tempOnboardingData || {};
  delete global.tempOnboardingData[senderId];
}

module.exports = {
  isNewUser,
  startOnboarding,
  handleOnboardingResponse,
  processOnboardingImage,
  handleDataConfirmation,
  completeOnboarding,
  getOnboardingState,
  ONBOARDING_STATES
};
