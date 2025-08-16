require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

// Import modules
const messengerModule = require('./modules/messenger');
const databaseModule = require('./modules/database');
const ocrModule = require('./modules/ocr');
const onboardingModule = require('./modules/onboarding');
const queryModule = require('./modules/query');
const analyticsModule = require('./modules/analytics');

const app = express();
const PORT = process.env.PORT || 3000;

// Session state management for user commands
const userSessions = new Map();

// Session state structure:
// {
//   action: 'stock_add' | 'price_change' | 'record_sale' | null,
//   itemId: string | null,
//   itemName: string | null,
//   awaitingInput: 'quantity' | 'price' | null,
//   timestamp: Date
// }

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS middleware - MUST be before any routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

// Initialize database on startup
databaseModule.initializeDB();

// Helper functions for session management
function getUserSession(senderId) {
  if (!userSessions.has(senderId)) {
    userSessions.set(senderId, {
      action: null,
      itemId: null,
      itemName: null,
      awaitingInput: null,
      timestamp: new Date()
    });
  }
  return userSessions.get(senderId);
}

function setUserSession(senderId, sessionData) {
  const currentSession = getUserSession(senderId);
  const updatedSession = { 
    ...currentSession, 
    ...sessionData, 
    timestamp: new Date() 
  };
  userSessions.set(senderId, updatedSession);
  console.log(`[SESSION] User ${senderId}: ${JSON.stringify(updatedSession)}`);
}

function clearUserSession(senderId) {
  userSessions.set(senderId, {
    action: null,
    itemId: null,
    itemName: null,
    awaitingInput: null,
    timestamp: new Date()
  });
  console.log(`[SESSION] Cleared session for user ${senderId}`);
}

function isSessionExpired(session, maxAgeMinutes = 30) {
  const now = new Date();
  const sessionAge = (now - session.timestamp) / (1000 * 60);
  return sessionAge > maxAgeMinutes;
}

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

// Analytics endpoint - legacy compatible format for existing dashboards
app.get('/analytics', async (req, res) => {
  try {
    console.log('[ANALYTICS] Generating legacy-compatible analytics with filters:', req.query);
    
    // Use legacy-compatible format that maintains backwards compatibility
    const analytics = await analyticsModule.generateLegacyCompatibleAnalytics(req.query);
    
    // Enhanced response that maintains existing API contract while adding new data
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      api_version: '2.1.0-compatible',
      request_info: {
        filters: req.query,
        user_agent: req.get('User-Agent'),
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      },
      data_disclaimer: {
        purpose: 'This data includes both traditional business analytics and new urban planning insights',
        privacy: 'All individual user data has been anonymized and aggregated',
        accuracy: 'Data accuracy depends on user input quality and system processing capabilities',
        usage_rights: 'Data may be used for research, planning, and decision-making purposes',
        compatibility: 'This response maintains backwards compatibility while providing enhanced urban planning data'
      },
      // Direct analytics object for legacy compatibility
      ...analytics
    };
    
    // Add CORS headers for cross-origin requests
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Set appropriate content type
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    console.log('[ANALYTICS] Successfully generated legacy-compatible analytics response with', Object.keys(analytics).length, 'main sections');
    
    res.json(response);
  } catch (error) {
    console.error('Analytics error:', error);
    
    // Enhanced error response
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: {
        message: 'Failed to generate analytics',
        code: 'ANALYTICS_GENERATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      },
      request_info: {
        filters: req.query,
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    });
  }
});

// Demo data injection endpoint (for demo purposes only)
app.post('/admin/inject-demo-data', async (req, res) => {
  try {
    console.log('[ADMIN] Demo data injection requested');
    
    // Security check - only allow in development or with specific token
    const authToken = req.headers['x-demo-token'] || req.query.token;
    if (authToken !== 'demo-kitakits-2024') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized - Demo token required'
      });
    }
    
    // Import the injection script
    const { injectDemoData } = require('./inject-demo-data');
    
    // Run the injection
    await injectDemoData();
    
    // Get updated stats
    const stats = await databaseModule.getDatabaseStats();
    
    res.json({
      success: true,
      message: 'Demo data injected successfully',
      stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[ADMIN] Demo data injection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to inject demo data',
      details: error.message
    });
  }
});

// Urban planning focused analytics endpoint
app.get('/analytics/urban-planning/full', async (req, res) => {
  try {
    console.log('[ANALYTICS] Generating full urban planning analytics with filters:', req.query);
    
    // Use the dedicated urban planning analytics function
    const urbanAnalytics = await analyticsModule.generateUrbanPlanningAnalytics(req.query);
    
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      api_version: '2.1.0-urban-planning',
      endpoint: '/analytics/urban-planning/full',
      request_info: {
        filters: req.query,
        user_agent: req.get('User-Agent'),
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      },
      data_disclaimer: {
        purpose: 'This endpoint provides comprehensive urban planning and community science analytics',
        privacy: 'All individual user data has been anonymized and aggregated',
        accuracy: 'Data accuracy depends on user input quality and system processing capabilities',
        usage_rights: 'Data specifically formatted for urban planning, research, and policy-making purposes'
      },
      data: urbanAnalytics
    };
    
    // Add CORS headers for cross-origin requests
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Set appropriate content type
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    console.log('[ANALYTICS] Successfully generated urban planning analytics response with', Object.keys(urbanAnalytics).length, 'main sections');
    
    res.json(response);
  } catch (error) {
    console.error('Urban planning analytics error:', error);
    
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: {
        message: 'Failed to generate urban planning analytics',
        code: 'URBAN_ANALYTICS_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      },
      request_info: {
        filters: req.query,
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    });
  }
});

// Additional endpoint for specific analytics sections
app.get('/analytics/:section', async (req, res) => {
  try {
    const { section } = req.params;
    console.log(`[ANALYTICS] Requesting specific section: ${section}`);
    
    const fullAnalytics = await analyticsModule.generateAnalytics(req.query);
    
    // Map section names to analytics properties
    const sectionMap = {
      'geographic': fullAnalytics.geographicData,
      'community': fullAnalytics.communityProfile,
      'economic': fullAnalytics.economicActivity,
      'heatmap': fullAnalytics.heatMapData,
      'temporal': fullAnalytics.temporalPatterns,
      'urban-planning': fullAnalytics.urbanPlanningInsights,
      'community-science': fullAnalytics.communityScienceData,
      'overview': fullAnalytics.overview
    };
    
    if (!sectionMap[section]) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Analytics section '${section}' not found`,
          available_sections: Object.keys(sectionMap)
        }
      });
    }
    
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      section,
      data: sectionMap[section],
      metadata: fullAnalytics.metadata
    };
    
    res.header('Access-Control-Allow-Origin', '*');
    res.json(response);
    
  } catch (error) {
    console.error(`Analytics section error:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to generate analytics section',
        section: req.params.section
      }
    });
  }
});

// Helper function to collect and store geographic data for analytics
async function collectGeographicData(senderId, event) {
  try {
    // Check for location data in the message
    const message = event.message;
    let locationData = null;
    
    // Check if message contains location attachment
    if (message && message.attachments) {
      const locationAttachment = message.attachments.find(att => att.type === 'location');
      if (locationAttachment && locationAttachment.payload) {
        const coords = locationAttachment.payload.coordinates;
        if (coords) {
          locationData = {
            senderId,
            latitude: coords.lat,
            longitude: coords.long,
            locationSource: 'gps',
            isPrimary: false // Will be updated based on user settings
          };
        }
      }
    }
    
    // Try to extract location from text content
    if (!locationData && message && message.text) {
      const locationPatterns = [
        // Address patterns
        /(?:address|location|lugar)[:=]?\s*([\w\s,.-]+(?:city|manila|cebu|davao|quezon|makati|taguig|pasig|marikina)[\w\s,.-]*)/i,
        // City/Municipality patterns
        /(manila|quezon\s+city|makati|taguig|pasig|marikina|cebu\s+city|davao\s+city|caloocan|las\s+piñas|muntinlupa|parañaque|pasay|valenzuela|malabon|navotas|san\s+juan)/i,
        // Province patterns with "sa" or "taga"
        /(?:sa|taga|from)\s+(metro\s+manila|ncr|calabarzon|central\s+luzon|bicol|western\s+visayas|central\s+visayas|eastern\s+visayas|zamboanga|northern\s+mindanao|davao)/i
      ];
      
      for (const pattern of locationPatterns) {
        const match = message.text.match(pattern);
        if (match) {
          const locationString = match[1] || match[0];
          locationData = {
            senderId,
            address: locationString.trim(),
            locationSource: 'manual',
            isPrimary: false
          };
          break;
        }
      }
    }
    
    // If we have location data, try to geocode it and store it
    if (locationData) {
      // For addresses without coordinates, try to extract city/region info
      if (locationData.address && !locationData.latitude) {
        const addressParts = parseAddressParts(locationData.address);
        locationData = { ...locationData, ...addressParts };
      }
      
      // Store location data
      try {
        await databaseModule.insertUserLocation(locationData);
        console.log(`[LOCATION] Stored location data for user ${senderId}:`, locationData);
        
        // Store analytics data point for location collection
        await databaseModule.insertAnalyticsData({
          dataType: 'location_collection',
          category: locationData.locationSource,
          value: locationData.address || `${locationData.latitude},${locationData.longitude}`,
          metadata: {
            source: locationData.locationSource,
            city: locationData.city,
            region: locationData.region
          },
          senderId
        });
      } catch (locationError) {
        console.error('Error storing location data:', locationError);
      }
    }
    
    // Always try to get IP-based location for new users (fallback)
    await tryCollectIPLocation(senderId);
    
  } catch (error) {
    console.error('Error in collectGeographicData:', error);
  }
}

// Parse address parts from text
function parseAddressParts(addressText) {
  const parts = {
    city: null,
    region: null,
    country: 'Philippines' // Default for Filipino users
  };
  
  const lowerAddress = addressText.toLowerCase();
  
  // Extract city
  const cityPatterns = [
    /(manila|quezon\s+city|makati|taguig|pasig|marikina|cebu\s+city|davao\s+city|caloocan|las\s+piñas|muntinlupa|parañaque|pasay|valenzuela|malabon|navotas|san\s+juan)/i,
    /(angeles|baguio|bacolod|cagayan\s+de\s+oro|iloilo|zamboanga)/i
  ];
  
  for (const pattern of cityPatterns) {
    const match = lowerAddress.match(pattern);
    if (match) {
      parts.city = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      break;
    }
  }
  
  // Extract region based on city or direct mention
  if (lowerAddress.includes('manila') || lowerAddress.includes('quezon city') || lowerAddress.includes('makati') || 
      lowerAddress.includes('taguig') || lowerAddress.includes('pasig') || lowerAddress.includes('marikina')) {
    parts.region = 'Metro Manila';
  } else if (lowerAddress.includes('cebu')) {
    parts.region = 'Central Visayas';
  } else if (lowerAddress.includes('davao')) {
    parts.region = 'Davao Region';
  } else if (lowerAddress.includes('baguio')) {
    parts.region = 'Cordillera Administrative Region';
  } else if (lowerAddress.includes('iloilo') || lowerAddress.includes('bacolod')) {
    parts.region = 'Western Visayas';
  }
  
  return parts;
}

// Try to collect IP-based location (simplified implementation)
async function tryCollectIPLocation(senderId) {
  try {
    // Check if user already has a location
    const existingLocation = await databaseModule.getUserLocation(senderId);
    if (existingLocation) {
      return; // User already has location data
    }
    
    // For MVP, we'll use a simple Philippines-based default
    // In production, this would use IP geolocation services
    const defaultLocation = {
      senderId,
      country: 'Philippines',
      locationSource: 'ip',
      isPrimary: false,
      accuracyMeters: 50000 // Low accuracy for IP-based
    };
    
    await databaseModule.insertUserLocation(defaultLocation);
    console.log(`[LOCATION] Stored default location for user ${senderId}`);
    
  } catch (error) {
    console.error('Error in tryCollectIPLocation:', error);
  }
}

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
    // Collect geographic data for analytics and urban planning
    await collectGeographicData(senderId, event);
    
    // Store interaction in database with enhanced metadata
    await databaseModule.insertInteraction({
      senderId,
      messageType: (message.attachments && message.attachments.length > 0) ? 'image' : 'text',
      content: message.text || message.quick_reply?.title || 'image',
      timestamp: new Date().toISOString()
    });
    
    // Store analytics data point for interaction
    await databaseModule.insertAnalyticsData({
      dataType: 'user_interaction',
      category: (message.attachments && message.attachments.length > 0) ? 'image' : 'text',
      value: message.text || message.quick_reply?.title || 'image_message',
      metadata: {
        hasAttachment: !!(message.attachments && message.attachments.length > 0),
        messageLength: message.text ? message.text.length : 0,
        interactionType: message.quick_reply ? 'quick_reply' : 'free_text'
      },
      senderId
    });
    
    // Handle image with OCR (receipts, invoices, inventory photos)
    if (message.attachments && message.attachments.length > 0 && message.attachments[0].type === 'image') {
      // Check if user is in onboarding process first
      const isProcessed = await onboardingModule.processOnboardingImage(senderId, message.attachments[0].payload.url);
      
      if (!isProcessed) {
        // Normal OCR processing if not in onboarding
        await handleImageMessage(senderId, message.attachments[0].payload.url);
      }
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
  const originalText = message.text;
  
  try {
    // Get current session state
    const session = getUserSession(senderId);
    
    // Check if session is expired and clear if needed
    if (session.action && isSessionExpired(session)) {
      console.log(`[SESSION] Session expired for user ${senderId}, clearing...`);
      clearUserSession(senderId);
    }
    
    // Priority 1: Handle session-based numeric inputs
    if (session.action && session.awaitingInput && originalText && /^\d+(\.\d+)?$/.test(originalText.trim())) {
      const numericValue = parseFloat(originalText.trim());
      
      if (numericValue > 0) {
        const success = await handleSessionBasedNumericInput(senderId, session, numericValue);
        if (success) {
          clearUserSession(senderId);
          return;
        }
      }
    }
    
    // Priority 2: Handle quick reply actions (these might set up sessions)
    if (payload) {
      await handleQuickReplyPayload(senderId, payload);
    }
    // Priority 3: Handle text commands and greetings
    else if (text) {
      await handleTextCommands(senderId, text, originalText);
    }
    // Default case
    else {
      await sendWelcomeMessage(senderId);
    }
  } catch (error) {
    console.error('Text/QuickReply handling error:', error);
    clearUserSession(senderId); // Clear session on error
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
      
    case 'SCAN_DOCUMENT':
      await handleScanDocument(senderId);
      break;
      
    case 'SCAN_DOC_ADD_INVENTORY':
      await handleScanDocAddInventory(senderId);
      break;

    case 'SCAN_DOC_SALES':
      await handleScanDocSales(senderId);
      break;

    case 'SCAN_DOC_ONBOARD_ALL':
      await handleScanDocOnboardAll(senderId);
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
      
    // CONSENT FLOW HANDLERS
    case 'CONSENT_YES':
      await handleConsentStep(senderId, 'consent', true);
      break;
      
    case 'CONSENT_NO':
      await handleConsentRejection(senderId);
      break;
      
    case 'DATA_HANDLING_YES':
      await handleConsentStep(senderId, 'data_handling', true);
      break;
      
    case 'DATA_HANDLING_NO':
      await handleConsentRejection(senderId);
      break;
      
    case 'DATA_SHARING_YES':
      await handleConsentStep(senderId, 'data_sharing', true);
      break;
      
    case 'DATA_SHARING_NO':
      await handleConsentRejection(senderId);
      break;
      
    case 'EULA_YES':
      await handleConsentStep(senderId, 'eula', true);
      break;
      
    case 'EULA_NO':
      await handleConsentRejection(senderId);
      break;
      
    // ONBOARDING FLOW HANDLERS
    case 'ONBOARD_INVENTORY':
    case 'ONBOARD_SALES':
    case 'ONBOARD_MANUAL':
    case 'ONBOARD_HELP':
      await onboardingModule.handleOnboardingResponse(senderId, payload);
      break;
      
    case 'ONBOARD_CONFIRM_INVENTORY':
    case 'ONBOARD_CONFIRM_SALES':
    case 'ONBOARD_REVIEW_INVENTORY':
    case 'ONBOARD_REVIEW_SALES':
    case 'ONBOARD_RETRY_PHOTO':
    case 'ONBOARD_SKIP':
    case 'ONBOARD_COMPLETE':
      await onboardingModule.handleDataConfirmation(senderId, payload);
      break;
      
    default:
      // Handle onboarding pagination
      if (payload.startsWith('ONBOARD_INVENTORY_PAGE_')) {
        const pageIndex = parseInt(payload.replace('ONBOARD_INVENTORY_PAGE_', ''));
        await onboardingModule.handleInventoryPagination(senderId, pageIndex);
      }
      // Handle item selection for add stock, change price, or item sold
      else if (payload.startsWith('ADD_STOCK_')) {
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

// CONSENT AND POLICY FUNCTIONS

// Send consent notice (first step)
async function sendConsentNotice(senderId) {
  const consentText = `🏪 Welcome to Kitakita! \n\nBefore we can assist you with your inventory management needs, we need your consent to collect and process your data to provide our services.\n\n📋 **Data Collection Notice**\n\nWe collect and process your:\n• Messages and interactions\n• Inventory data you provide\n• Sales transaction records\n• OCR/image processing results\n\n🔒 Your data is used exclusively to:\n• Provide inventory management services\n• Generate business insights\n• Improve our chatbot functionality\n\n**Do you consent to data collection and processing?**`;
  
  await messengerModule.sendQuickReplies(senderId, consentText, [
    { title: '✅ Yes, I Consent', payload: 'CONSENT_YES' },
    { title: '❌ No, I Decline', payload: 'CONSENT_NO' }
  ]);
}

// Send data handling policy
async function sendDataHandlingPolicy(senderId) {
  const policyText = `📋 **Data Handling Policy**\n\n**What data do we collect?**\n• Your messages and command inputs\n• Inventory items, prices, and quantities\n• Sales transactions and dates\n• Images you send for OCR processing\n\n**How do we use your data?**\n• Process your inventory management requests\n• Generate sales reports and analytics\n• Provide business insights and summaries\n• Improve chatbot responses and features\n\n**Data Security:**\n• Your data is stored securely in our database\n• We use industry-standard encryption\n• Data is only accessible to authorized systems\n• We do not sell your personal data to third parties\n\n**Do you agree to our Data Handling Policy?**`;
  
  await messengerModule.sendQuickReplies(senderId, policyText, [
    { title: '✅ I Agree', payload: 'DATA_HANDLING_YES' },
    { title: '❌ I Decline', payload: 'DATA_HANDLING_NO' }
  ]);
}

// Send data sharing policy
async function sendDataSharingPolicy(senderId) {
  const policyText = `🤝 **Data Sharing Policy**\n\n**Analytics and Insights:**\n• We may share anonymized, aggregated data for business insights\n• Individual user data is never shared in identifiable form\n• Analytics data helps improve our services\n\n**Third-Party Services:**\n• OCR processing may use external image processing services\n• These services are bound by strict confidentiality agreements\n• No personal identification data is shared\n\n**Data Sharing Restrictions:**\n• We never sell your personal data\n• We don't share individual inventory details\n• Your business information remains confidential\n• Only anonymized usage patterns may be analyzed\n\n**Legal Requirements:**\n• Data may be shared if required by law\n• We will notify you if legally possible\n\n**Do you agree to our Data Sharing Policy?**`;
  
  await messengerModule.sendQuickReplies(senderId, policyText, [
    { title: '✅ I Agree', payload: 'DATA_SHARING_YES' },
    { title: '❌ I Decline', payload: 'DATA_SHARING_NO' }
  ]);
}

// Send End User License Agreement (EULA)
async function sendEULA(senderId) {
  const eulaText = `📄 **End User License Agreement (EULA)**\n\n**License Grant:**\n• You are granted a limited, non-exclusive license to use Kitakita\n• This license is for personal/business inventory management only\n• The license is revocable at any time\n\n**User Responsibilities:**\n• Provide accurate inventory information\n• Use the service responsibly and legally\n• Do not attempt to harm or misuse the system\n• Respect other users and system resources\n\n**Service Limitations:**\n• Kitakita is provided "as is" without warranties\n• We are not liable for business decisions based on our reports\n• Service availability is not guaranteed 100% uptime\n\n**Termination:**\n• You may stop using the service at any time\n• We reserve the right to terminate accounts for misuse\n• Upon termination, your data will be deleted per our retention policy\n\n**Do you accept the End User License Agreement?**`;
  
  await messengerModule.sendQuickReplies(senderId, eulaText, [
    { title: '✅ I Accept', payload: 'EULA_YES' },
    { title: '❌ I Decline', payload: 'EULA_NO' }
  ]);
}

// Send completion message and proceed to main features
async function completeConsentFlow(senderId) {
  const completionText = `🎉 **Consent Process Complete!**\n\nThank you for agreeing to our policies. You now have full access to Kitakita features!\n\n🏪 **Kitakita** - Your Inventory Assistant\n\n📱 I can help you with:\n• 📦 Inventory tracking and management\n• 💰 Sales recording and reporting\n• 📊 Business analytics and insights\n• 📸 Receipt scanning and OCR\n\nLet's get started with managing your inventory!`;
  
  await messengerModule.sendTextMessage(senderId, completionText);
  
  // Check if user is new and start onboarding
  const isNew = await onboardingModule.isNewUser(senderId);
  if (isNew) {
    await onboardingModule.startOnboarding(senderId);
  } else {
    await sendMainMenu(senderId);
  }
}

// Handle consent step progression
async function handleConsentStep(senderId, consentType, accepted) {
  try {
    if (!accepted) {
      await handleConsentRejection(senderId);
      return;
    }
    
    // Update the specific consent in database
    await databaseModule.updateUserConsent(senderId, consentType, accepted);
    
    // Get updated consent status
    const userConsent = await databaseModule.getUserConsent(senderId);
    
    // Determine next step based on consent type
    switch (consentType) {
      case 'consent':
        if (accepted) {
          await sendDataHandlingPolicy(senderId);
        }
        break;
        
      case 'data_handling':
        if (accepted) {
          await sendDataSharingPolicy(senderId);
        }
        break;
        
      case 'data_sharing':
        if (accepted) {
          await sendEULA(senderId);
        }
        break;
        
      case 'eula':
        if (accepted) {
          // Complete the consent flow
          await databaseModule.completeUserConsent(senderId);
          await completeConsentFlow(senderId);
        }
        break;
        
      default:
        console.error('Unknown consent type:', consentType);
        await sendConsentNotice(senderId);
    }
    
  } catch (error) {
    console.error('Error in handleConsentStep:', error);
    await messengerModule.sendTextMessage(senderId, 
      'Sorry, there was an error processing your consent. Please try again.');
    await sendConsentNotice(senderId);
  }
}

// Handle consent flow rejection
async function handleConsentRejection(senderId) {
  const rejectionText = `Thank you for your interest in Kitakita.\n\nSince you have not agreed to our data policies, we cannot provide our inventory management services at this time.\n\n🔒 Your privacy is important to us, and we respect your decision.\n\nIf you change your mind in the future, you can always restart the conversation by sending "hello" or "start".\n\nThank you for considering Kitakita!`;
  
  await messengerModule.sendTextMessage(senderId, rejectionText);
}

// Send welcome message for new users (now starts consent flow)
async function sendWelcomeMessage(senderId) {
  try {
    // Initialize user consent record
    await databaseModule.initializeUserConsent(senderId);
    
    // Check if user has already completed consent
    const userConsent = await databaseModule.getUserConsent(senderId);
    
    if (userConsent && userConsent.all_policies_accepted) {
      // User has already completed consent, go directly to main menu
      const welcomeText = `🏪 Welcome back to Kitakita! \n\nYour inventory assistant is ready to help you manage your sari-sari store, carinderia, or small business.\n\n📱 I can help you with:\n• 📦 Inventory tracking\n• 💰 Sales recording\n• 📊 Business insights\n• 📸 Receipt scanning\n\nWhat would you like to do today?`;
      
      await messengerModule.sendTextMessage(senderId, welcomeText);
      await sendMainMenu(senderId);
    } else {
      // New user or incomplete consent, start consent flow
      await sendConsentNotice(senderId);
    }
  } catch (error) {
    console.error('Error in sendWelcomeMessage:', error);
    // Fallback to consent flow
    await sendConsentNotice(senderId);
  }
}

// Send main menu quick replies
async function sendMainMenu(senderId) {
  try {
    // Check if user has completed consent before showing main menu
    const userConsent = await databaseModule.getUserConsent(senderId);
    
    if (!userConsent || !userConsent.all_policies_accepted) {
      // User hasn't completed consent, redirect to consent flow
      await sendWelcomeMessage(senderId);
      return;
    }
    
    // User has completed consent, show main menu
    await messengerModule.sendQuickReplies(senderId, '🏪 Pumili ng aksyon:', [
      { title: '📦 Add Item to Inventory', payload: 'ADD_ITEM_TO_INVENTORY' },
      { title: '➕ Add Stock to Item', payload: 'ADD_STOCK_TO_ITEM' },
      { title: '💰 Change Item Price', payload: 'CHANGE_ITEM_PRICE' },
      { title: '📤 Item Sold', payload: 'ITEM_SOLD' },
      { title: '📊 Summary', payload: 'SUMMARY' },
      { title: '📄 Scan Document', payload: 'SCAN_DOCUMENT' }
    ]);
    
  } catch (error) {
    console.error('Error in sendMainMenu:', error);
    // Fallback to consent flow if there's an error
    await sendWelcomeMessage(senderId);
  }
}

// Send help message
async function sendHelpMessage(senderId) {
  const helpText = `❓ Kitakita Help - Mga Commands\n\n📦 INVENTORY:\n• "Add [item] [price] [qty]" - Magdagdag\n• "Stock [item]" - I-check ang stock\n\n💰 SALES:\n• "Sold [item] [qty]" - Record benta\n• "Daily sales" - Tingnan ang sales\n\n📸 IMAGES:\n• Mag-send ng receipt para sa auto-scan\n• Mag-send ng inventory photo\n\n🏪 QUICK ACTIONS:\nGamitin ang mga buttons sa baba para sa mabilis na aksyon!\n\n📞 Para sa tulong: I-type ang "menu"`;
  
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
        const recentInteractions = await databaseModule.getUserInteractions(senderId, 15);
        
        let contextFound = false;
        let recentItemName = null;
        let recentItemId = null;
        let actionType = null;
        let contextInteraction = null;
        
        console.log(`[DEBUG] Analyzing ${recentInteractions.length} recent interactions for context`);
        
        // Analyze recent interactions to determine context and item
        for (let i = 0; i < recentInteractions.length; i++) {
          const interaction = recentInteractions[i];
          const content = interaction.content?.toLowerCase();
          
          console.log(`[DEBUG] Interaction ${i}: "${content}"`);
          
          // Look for explicit quick reply payloads (HIGHEST PRIORITY)
          if (content?.includes('change_price_')) {
            actionType = 'price_change';
            const itemIdMatch = content.match(/change_price_(\d+)/);
            if (itemIdMatch) {
              recentItemId = itemIdMatch[1];
              contextFound = true;
              contextInteraction = interaction;
              console.log(`[DEBUG] Found price change context: itemId=${recentItemId}`);
              break;
            }
          }
          
          else if (content?.includes('add_stock_')) {
            actionType = 'add_stock';
            const itemIdMatch = content.match(/add_stock_(\d+)/);
            if (itemIdMatch) {
              recentItemId = itemIdMatch[1];
              contextFound = true;
              contextInteraction = interaction;
              console.log(`[DEBUG] Found add stock context: itemId=${recentItemId}`);
              break;
            }
          }
          
          else if (content?.includes('item_sold_')) {
            actionType = 'record_sale';
            const itemIdMatch = content.match(/item_sold_(\d+)/);
            if (itemIdMatch) {
              recentItemId = itemIdMatch[1];
              contextFound = true;
              contextInteraction = interaction;
              console.log(`[DEBUG] Found item sold context: itemId=${recentItemId}`);
              break;
            }
          }
          
          // Look for contextual phrases (MEDIUM PRIORITY)
          else if (content?.includes('i-type ang bagong price') || content?.includes('change price')) {
            actionType = 'price_change';
            // Try to find the most recent item ID from previous interactions
            for (let j = i + 1; j < recentInteractions.length; j++) {
              const prevContent = recentInteractions[j].content?.toLowerCase();
              const itemIdMatch = prevContent?.match(/change_price_(\d+)/);
              if (itemIdMatch) {
                recentItemId = itemIdMatch[1];
                contextFound = true;
                contextInteraction = recentInteractions[j];
                console.log(`[DEBUG] Found price change context from phrase: itemId=${recentItemId}`);
                break;
              }
            }
            if (contextFound) break;
          }
          
          else if (content?.includes('i-type ang quantity na idadagdag') || content?.includes('adding stock')) {
            actionType = 'add_stock';
            // Try to find the most recent item ID from previous interactions
            for (let j = i + 1; j < recentInteractions.length; j++) {
              const prevContent = recentInteractions[j].content?.toLowerCase();
              const itemIdMatch = prevContent?.match(/add_stock_(\d+)/);
              if (itemIdMatch) {
                recentItemId = itemIdMatch[1];
                contextFound = true;
                contextInteraction = recentInteractions[j];
                console.log(`[DEBUG] Found add stock context from phrase: itemId=${recentItemId}`);
                break;
              }
            }
            if (contextFound) break;
          }
          
          else if (content?.includes('i-type ang quantity na nabenta') || content?.includes('record sale')) {
            actionType = 'record_sale';
            // Try to find the most recent item ID from previous interactions
            for (let j = i + 1; j < recentInteractions.length; j++) {
              const prevContent = recentInteractions[j].content?.toLowerCase();
              const itemIdMatch = prevContent?.match(/item_sold_(\d+)/);
              if (itemIdMatch) {
                recentItemId = itemIdMatch[1];
                contextFound = true;
                contextInteraction = recentInteractions[j];
                console.log(`[DEBUG] Found record sale context from phrase: itemId=${recentItemId}`);
                break;
              }
            }
            if (contextFound) break;
          }
          
          // Look for stock check context (LOW PRIORITY - implies user wants to add stock)
          else if (!contextFound) {
            // Enhanced stock check patterns
            const stockCheckPatterns = [
              /^stock\s+([\w\s-]+)$/i,
              /^check\s+([\w\s-]+)$/i,
              /^tira\s+ng\s+([\w\s-]+)$/i,
              /^([\w\s-]+)\s+stock$/i,
              /stock:\s*([\w\s-]+)/i,
              /📦\s+([\w\s-]+)\s*\n/i  // From stock display responses
            ];
            
            for (const pattern of stockCheckPatterns) {
              const itemMatch = content?.match(pattern);
              if (itemMatch) {
                recentItemName = itemMatch[1].trim();
                actionType = 'add_stock_from_check';
                contextFound = true;
                contextInteraction = interaction;
                console.log(`[DEBUG] Found stock check context: itemName=${recentItemName}`);
                break;
              }
            }
            
            if (contextFound) break;
          }
        }
        
        console.log(`[DEBUG] Context analysis result: found=${contextFound}, type=${actionType}, itemId=${recentItemId}, itemName=${recentItemName}`);
        
        // Execute based on determined context
        if (contextFound) {
          if (actionType === 'price_change' && recentItemId) {
            return await handleNumericPriceChange(senderId, recentItemId, numericValue);
          }
          
          else if (actionType === 'add_stock' && recentItemId) {
            return await handleNumericStockAddition(senderId, recentItemId, numericValue);
          }
          
          else if (actionType === 'record_sale' && recentItemId) {
            return await handleNumericSalesRecord(senderId, recentItemId, numericValue);
          }
          
          else if (actionType === 'add_stock_from_check' && recentItemName) {
            return await handleNumericStockAdditionByName(senderId, recentItemName, numericValue);
          }
        }
        
        // Enhanced fallback with more helpful context
        console.log(`[DEBUG] No context found for numeric input: ${numericValue}`);
        
        // Show recent interactions for debugging
        let debugMessage = `🔢 Nakita ko ang number "${numericValue}" pero hindi ko alam kung para saan ito.\n\n`;
        debugMessage += `📋 Recent actions:\n`;
        
        recentInteractions.slice(0, 3).forEach((interaction, index) => {
          const content = interaction.content;
          if (content && !content.includes(numericValue.toString())) {
            debugMessage += `${index + 1}. ${content.substring(0, 30)}...\n`;
          }
        });
        
        debugMessage += `\n💡 Para sa mas specific na action:\n• Use Quick Reply buttons\n• "Menu" para sa main options\n• Stock check → number = add stock\n• Price change → number = new price`;
        
        await messengerModule.sendTextMessage(senderId, debugMessage);
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

// Handle numeric input for stock addition by item name (from stock check context)
async function handleNumericStockAdditionByName(senderId, itemName, quantityToAdd) {
  try {
    // First, get the item by name to get its ID
    const item = await databaseModule.getInventoryItem(senderId, itemName);
    
    if (!item) {
      await messengerModule.sendTextMessage(senderId,
        `❌ Hindi nakita ang "${itemName}" sa inventory mo.\n\nSubukan:\n• I-check ang spelling\n• "List" para tingnan lahat\n• "Add ${itemName} [price] [qty]" kung wala pa`);
      await sendMainMenu(senderId);
      return true;
    }
    
    // Use the existing addStockToItem function with the item's ID
    const updatedItem = await databaseModule.addStockToItem(senderId, item.id, quantityToAdd);
    
    await messengerModule.sendTextMessage(senderId,
      `✅ Stock added successfully!\n\n📦 ${updatedItem.item_name}\n➕ Added: ${quantityToAdd} ${updatedItem.unit}\n📊 New Total Stock: ${updatedItem.quantity} ${updatedItem.unit}\n💰 Price: ₱${updatedItem.price} per ${updatedItem.unit}\n\n🎉 Stock updated from stock check!`);
    
    await sendMainMenu(senderId);
    return true;
    
  } catch (error) {
    console.error('Stock addition by name error:', error);
    await messengerModule.sendTextMessage(senderId,
      `❌ May error sa pag-add ng stock para sa "${itemName}". Subukan ulit.`);
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
    const item = await databaseModule.getInventoryItemById(senderId, itemId);
    
    if (!item) {
      await messengerModule.sendTextMessage(senderId,
        '❌ Item not found. Returning to main menu.');
      await sendMainMenu(senderId);
      return;
    }
    
    // Set session state for command chaining
    setUserSession(senderId, {
      action: 'stock_add',
      itemId: itemId,
      itemName: item.item_name,
      awaitingInput: 'quantity'
    });
    
    await messengerModule.sendTextMessage(senderId,
      `➕ *Adding Stock to: ${item.item_name}*\n\nCurrent Stock: ${item.quantity} ${item.unit}\nPrice: ₱${item.price} per ${item.unit}\n\n**I-type ang quantity na idadagdag:**\n\nExample: "5" (para mag-add ng 5 ${item.unit})\n\nNote: I-type lang ang number`);
    
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
    // Get the item details
    const item = await databaseModule.getInventoryItemById(senderId, itemId);
    
    if (!item) {
      await messengerModule.sendTextMessage(senderId,
        '❌ Item not found. Returning to main menu.');
      await sendMainMenu(senderId);
      return;
    }
    
    // Set session state for command chaining
    setUserSession(senderId, {
      action: 'price_change',
      itemId: itemId,
      itemName: item.item_name,
      awaitingInput: 'price'
    });
    
    await messengerModule.sendTextMessage(senderId,
      `💰 *Change Price for: ${item.item_name}*\n\nCurrent Price: ₱${item.price} per ${item.unit}\nStock: ${item.quantity} ${item.unit}\n\n**I-type ang bagong price:**\n\nExample: "25" (para maging ₱25)\n"15.50" (para maging ₱15.50)\n\nNote: I-type lang ang number/amount`);
    
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
    // Get the item details
    const item = await databaseModule.getInventoryItemById(senderId, itemId);
    
    if (!item) {
      await messengerModule.sendTextMessage(senderId,
        '❌ Item not found. Returning to main menu.');
      await sendMainMenu(senderId);
      return;
    }
    
    // Set session state for command chaining
    setUserSession(senderId, {
      action: 'record_sale',
      itemId: itemId,
      itemName: item.item_name,
      awaitingInput: 'quantity'
    });
    
    await messengerModule.sendTextMessage(senderId,
      `📤 *Record Sale for: ${item.item_name}*\n\nCurrent Stock: ${item.quantity} ${item.unit}\nPrice: ₱${item.price} per ${item.unit}\n\n**I-type ang quantity na nabenta:**\n\nExample: "3" (para sa 3 ${item.unit})\n"2.5" (para sa 2.5 ${item.unit})\n\nNote: I-type lang ang number/amount`);
    
  } catch (error) {
    console.error('Item sold selected error:', error);
    await messengerModule.sendTextMessage(senderId, 
      '❌ May error. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle session-based numeric inputs
async function handleSessionBasedNumericInput(senderId, session, numericValue) {
  console.log(`[SESSION] Handling numeric input: ${numericValue} for action: ${session.action}`);
  
  try {
    switch (session.action) {
      case 'stock_add':
        if (session.itemId) {
          const updatedItem = await databaseModule.addStockToItem(senderId, session.itemId, numericValue);
          await messengerModule.sendTextMessage(senderId,
            `✅ Stock added successfully!\n\n📦 ${updatedItem.item_name}\n➕ Added: ${numericValue} ${updatedItem.unit}\n📊 New Total Stock: ${updatedItem.quantity} ${updatedItem.unit}\n💰 Price: ₱${updatedItem.price} per ${updatedItem.unit}\n\n🎉 Stock updated!`);
          await sendMainMenu(senderId);
          return true;
        }
        break;
        
      case 'price_change':
        if (session.itemId) {
          const updatedItem = await databaseModule.updateItemPrice(senderId, session.itemId, numericValue);
          await messengerModule.sendTextMessage(senderId,
            `✅ Price updated successfully!\n\n📦 ${updatedItem.item_name}\n💰 New Price: ₱${numericValue}\n📊 Current Stock: ${updatedItem.quantity} ${updatedItem.unit}\n\n✨ Updated na ang price!`);
          await sendMainMenu(senderId);
          return true;
        }
        break;
        
      case 'record_sale':
        if (session.itemId) {
          const saleResult = await databaseModule.recordSaleById(senderId, session.itemId, numericValue);
          await messengerModule.sendTextMessage(senderId,
            `💰 Sale recorded successfully!\n\n📦 ${saleResult.itemName}\n🛒 Sold: ${numericValue} units\n💵 Unit Price: ₱${saleResult.unitPrice}\n💸 Total Amount: ₱${saleResult.totalAmount.toFixed(2)}\n\n📊 Remaining Stock: ${saleResult.remainingStock} units`);
          
          // Low stock warning
          if (saleResult.remainingStock <= 5) {
            await messengerModule.sendTextMessage(senderId,
              `⚠️ LOW STOCK ALERT!\n\n📦 ${saleResult.itemName} = ${saleResult.remainingStock} units na lang\n\nTime to restock!`);
          }
          
          await sendMainMenu(senderId);
          return true;
        }
        break;
        
      default:
        console.log(`[SESSION] Unknown action: ${session.action}`);
        return false;
    }
    
  } catch (error) {
    console.error('[SESSION] Error handling numeric input:', error);
    
    if (error.message === 'Insufficient stock') {
      await messengerModule.sendTextMessage(senderId,
        `❌ Kulang ang stock! Hindi pwedeng mag-oversell.\n\nI-check muna ang available stock gamit ang "List" command.`);
    } else {
      await messengerModule.sendTextMessage(senderId,
        `❌ May error sa pag-process ng ${numericValue}. Subukan ulit.`);
    }
    
    await sendMainMenu(senderId);
    return true;
  }
  
  return false;
}

// Handle Scan Document - provides options for document scanning
async function handleScanDocument(senderId) {
  try {
    await messengerModule.sendQuickReplies(senderId, '📄 *Scan Document* - Ano ang nais mong gawin?', [
      { title: '📦 Add Items to Inventory', payload: 'SCAN_DOC_ADD_INVENTORY' },
      { title: '💰 Sales (e.g., [item] [quantity])', payload: 'SCAN_DOC_SALES' },
      { title: '📋 Onboard All Existing Items', payload: 'SCAN_DOC_ONBOARD_ALL' },
      { title: '🏠 Main Menu', payload: 'MAIN_MENU' }
    ]);
  } catch (error) {
    console.error('Error showing Scan Document options:', error);
    await messengerModule.sendTextMessage(senderId, 'May error sa pagpapakita ng options. Subukan ulit.');
    await sendMainMenu(senderId);
  }
}

// Handle Scan Document Add Inventory option
async function handleScanDocAddInventory(senderId) {
  // Start inventory upload onboarding step (reuse onboarding module)
  await onboardingModule.setupInventoryUpload(senderId);
}

// Handle Scan Document Sales option
async function handleScanDocSales(senderId) {
  // Start sales upload onboarding step (reuse onboarding module)
  await onboardingModule.setupSalesUpload(senderId);
}

// Handle Scan Document Onboard All option
async function handleScanDocOnboardAll(senderId) {
  // This will start the full onboarding process
  await onboardingModule.startOnboarding(senderId);
}

// Handle Read Receipt (placeholder - deprecated)
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
