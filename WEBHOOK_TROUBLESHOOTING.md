# 🚨 Facebook Webhook Troubleshooting Guide

## Issue: Chatbot Not Receiving User Messages

If your KitaKits chatbot isn't responding to Facebook messages, follow these troubleshooting steps:

## 🔍 Step 1: Check Your Render Deployment

### Verify Your App is Running
1. Go to your **Render Dashboard**
2. Check your service status - should show **"Live"** in green
3. Click on your service → **Logs** tab
4. Look for these startup messages:
   ```
   🚀 Server running on port 10000
   📊 Analytics available at...
   🔗 Webhook endpoint at...
   Connected to SQLite database
   ```

### Test Your Render URL
Replace `YOUR-RENDER-URL` with your actual Render URL:

```bash
# Test if your server responds
curl "https://YOUR-RENDER-URL.onrender.com/analytics"

# Or in PowerShell:
Invoke-RestMethod -Uri "https://YOUR-RENDER-URL.onrender.com/analytics" -Method Get
```

**Expected**: Should return analytics JSON data

## 🔧 Step 2: Verify Facebook Webhook Configuration

### Check Facebook Developer Console
1. Go to **[Facebook Developers](https://developers.facebook.com)**
2. Select your KitaKits app
3. Go to **Messenger** → **Settings**
4. In **Webhooks** section, verify:

| Setting | Should Be |
|---------|-----------|
| **Callback URL** | `https://your-render-url.onrender.com/webhook` |
| **Verify Token** | Must match your `VERIFY_TOKEN` in Render |
| **Webhook Fields** | `messages` and `messaging_postbacks` checked ✅ |

### Test Webhook Verification
Replace with your actual values:
```bash
curl "https://YOUR-RENDER-URL.onrender.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

**Expected**: Should return `test123`

## ⚙️ Step 3: Check Environment Variables in Render

### Verify Your Render Environment Variables
In Render Dashboard → Your Service → Environment:

```env
PAGE_ACCESS_TOKEN=EAAxxxxx... (your Facebook page token)
VERIFY_TOKEN=your_verify_token (matches Facebook webhook)
APP_SECRET=your_app_secret (from Facebook app)
NODE_ENV=production
PORT=10000
```

### Common Issues:
- ❌ **Missing `PAGE_ACCESS_TOKEN`** → Can't send responses
- ❌ **Wrong `VERIFY_TOKEN`** → Webhook verification fails
- ❌ **Spaces in tokens** → Copy/paste errors

## 📱 Step 4: Test Facebook Page Setup

### Check Your Facebook Page
1. **Page Status**: Must be **Published** (not in draft)
2. **App Connection**: App must be connected to the page
3. **Page Role**: You must be admin/editor of the page
4. **Messaging**: Page messaging must be enabled

### Generate New Page Access Token
If messages aren't working:
1. Facebook Developers → Your App → Messenger → Settings
2. **Access Tokens** section
3. Select your page → **Generate Token**
4. Copy the new token to Render environment variables
5. **Redeploy** your Render service

## 🔍 Step 5: Debug with Render Logs

### Monitor Real-Time Logs
1. Render Dashboard → Your Service → **Logs**
2. Send a test message to your Facebook page
3. Look for these log entries:

**✅ Good Logs:**
```
POST /webhook - 200
Message handling for user: 1234567890
Stored interaction in database
Sending text message to user
```

**❌ Problem Logs:**
```
Error: Invalid access token
Error: Connection refused
Webhook verification failed
```

## 🧪 Step 6: Manual Testing Steps

### Test 1: Webhook Verification
```bash
curl "https://YOUR-RENDER-URL.onrender.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

### Test 2: Analytics Endpoint  
```bash
curl "https://YOUR-RENDER-URL.onrender.com/analytics"
```

### Test 3: Facebook Page Messaging
1. Open your Facebook page in a browser
2. Send a message as a different user (or test user)
3. Check Render logs immediately for webhook activity

## 🚨 Common Problems & Solutions

### Problem 1: "Webhook Verification Failed"
**Solution:**
- Double-check `VERIFY_TOKEN` matches exactly between Facebook and Render
- No extra spaces or characters
- Case-sensitive match

### Problem 2: "Invalid Access Token" 
**Solution:**
- Generate new `PAGE_ACCESS_TOKEN` from Facebook
- Update Render environment variable
- Redeploy service

### Problem 3: "Page Not Found" or 404
**Solution:**
- Verify webhook URL: `https://YOUR-URL.onrender.com/webhook`
- Check if Render service is running
- Ensure webhook endpoint exists in code

### Problem 4: Messages Sent But No Response
**Solution:**
- Check `PAGE_ACCESS_TOKEN` is valid
- Verify page permissions
- Check Render logs for error messages

### Problem 5: Render Service Sleeping
**Solution:**
- Free tier sleeps after 15min inactivity
- Send a request to wake it up
- Consider upgrading to paid tier for always-on

## 🔧 Quick Fix Commands

### Wake Up Render Service
```bash
curl "https://YOUR-RENDER-URL.onrender.com/analytics"
```

### Test Full Webhook Flow
```bash
# 1. Test server
curl "https://YOUR-RENDER-URL.onrender.com/analytics"

# 2. Test webhook verification  
curl "https://YOUR-RENDER-URL.onrender.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"

# 3. Test POST webhook (simulate Facebook)
curl -X POST "https://YOUR-RENDER-URL.onrender.com/webhook" \
  -H "Content-Type: application/json" \
  -d '{"object":"page","entry":[{"messaging":[{"sender":{"id":"test"},"message":{"text":"test"}}]}]}'
```

## 📋 Debugging Checklist

- [ ] Render service shows "Live" status
- [ ] Render logs show server startup messages  
- [ ] Analytics endpoint returns data
- [ ] Webhook verification returns challenge token
- [ ] Facebook webhook URL is correct
- [ ] VERIFY_TOKEN matches in both systems
- [ ] PAGE_ACCESS_TOKEN is valid and current
- [ ] Facebook page is published
- [ ] Webhook fields (messages, messaging_postbacks) are subscribed
- [ ] App has necessary permissions

## 🆘 If Still Not Working

### Share These Details for Further Help:
1. **Render URL**: `https://your-app.onrender.com`
2. **Render Logs**: Copy recent log entries
3. **Facebook Webhook Status**: Screenshot of webhook config
4. **Test Results**: Results from curl commands above
5. **Error Messages**: Any specific errors you're seeing

### Emergency Reset Steps:
1. **Regenerate** Facebook page access token
2. **Update** all environment variables in Render
3. **Redeploy** the service
4. **Retest** webhook verification
5. **Send test message** to Facebook page

Most webhook issues are resolved by ensuring the `VERIFY_TOKEN` and `PAGE_ACCESS_TOKEN` are correctly configured and match between Facebook and Render!
