const axios = require('axios');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GRAPH_API_URL = 'https://graph.facebook.com/v18.0/me/messages';

/**
 * Send a text message to user
 */
async function sendTextMessage(recipientId, text) {
  try {
    const response = await axios.post(
      GRAPH_API_URL,
      {
        recipient: { id: recipientId },
        message: { text }
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
    
    console.log('Message sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send quick reply buttons to user
 */
async function sendQuickReplies(recipientId, text, quickReplies) {
  try {
    const response = await axios.post(
      GRAPH_API_URL,
      {
        recipient: { id: recipientId },
        message: {
          text,
          quick_replies: quickReplies.map(reply => ({
            content_type: 'text',
            title: reply.title,
            payload: reply.payload
          }))
        }
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
    
    console.log('Quick replies sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending quick replies:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Process incoming messages and extract relevant data
 */
function processMessage(message) {
  const processedMessage = {
    type: null,
    content: null,
    payload: null
  };
  
  // Check for quick reply
  if (message.quick_reply) {
    processedMessage.type = 'quick_reply';
    processedMessage.payload = message.quick_reply.payload;
    processedMessage.content = message.text;
  }
  // Check for attachments (images)
  else if (message.attachments && message.attachments.length > 0) {
    const attachment = message.attachments[0];
    processedMessage.type = attachment.type;
    
    if (attachment.type === 'image') {
      processedMessage.content = attachment.payload.url;
    }
  }
  // Regular text message
  else if (message.text) {
    processedMessage.type = 'text';
    processedMessage.content = message.text;
  }
  
  return processedMessage;
}

/**
 * Send typing indicator
 */
async function sendTypingIndicator(recipientId, on = true) {
  try {
    await axios.post(
      'https://graph.facebook.com/v18.0/me/messages',
      {
        recipient: { id: recipientId },
        sender_action: on ? 'typing_on' : 'typing_off'
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
  } catch (error) {
    console.error('Error sending typing indicator:', error.message);
  }
}

/**
 * Send image to user
 */
async function sendImage(recipientId, imageUrl) {
  try {
    const response = await axios.post(
      GRAPH_API_URL,
      {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'image',
            payload: {
              url: imageUrl,
              is_reusable: true
            }
          }
        }
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
    
    console.log('Image sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending image:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  sendTextMessage,
  sendQuickReplies,
  processMessage,
  sendTypingIndicator,
  sendImage
};
