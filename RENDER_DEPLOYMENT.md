# KitaKits Chatbot Deployment on Render

This guide walks you through deploying your KitaKits chatbot to Render.com for production use.

## 🚀 Quick Deployment Steps

### Step 1: Prepare Your Repository

Your repository should already have these files (✅ already present):
- `package.json` - Node.js dependencies
- `server.js` - Main application file
- `.env.example` - Environment template
- All modules in `/modules/` folder

### Step 2: Push to GitHub (if not already)

```bash
# If you haven't committed recent changes:
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 3: Create Render Account & Deploy

1. **Sign up**: Go to [render.com](https://render.com) and sign up (free tier available)

2. **Connect GitHub**: Link your GitHub account to Render

3. **Create Web Service**: 
   - Click "New +" → "Web Service"
   - Select your `kitakitschatbot` repository
   - Configure as follows:

#### Render Configuration

| Setting | Value |
|---------|-------|
| **Name** | `kitakits-chatbot` (or your preferred name) |
| **Environment** | `Node` |
| **Region** | `Oregon` (or closest to Philippines) |
| **Branch** | `main` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | `Free` (for testing) |

### Step 4: Configure Environment Variables

In Render dashboard, add these environment variables:

```env
NODE_ENV=production
PORT=10000
PAGE_ACCESS_TOKEN=your_facebook_page_access_token
VERIFY_TOKEN=your_webhook_verify_token
APP_SECRET=your_facebook_app_secret
OCR_LANGUAGE=eng
OCR_CONFIDENCE_THRESHOLD=75
ENABLE_ANALYTICS=true
DEBUG=false
LOG_LEVEL=info
```

**Important**: Replace the Facebook tokens with your real values from Facebook Developer Console.

### Step 5: Deploy & Get URL

1. Click **"Create Web Service"**
2. Render will build and deploy automatically
3. You'll get a URL like: `https://kitakits-chatbot-abc123.onrender.com`

### Step 6: Configure Facebook Webhook

1. Go to your Facebook App Developer Console
2. Navigate to **Messenger → Settings**
3. In **Webhooks** section:
   - **Callback URL**: `https://your-render-url.onrender.com/webhook`
   - **Verify Token**: Use the same `VERIFY_TOKEN` you set in Render
   - **Subscription Fields**: Select `messages` and `messaging_postbacks`
4. Click **"Verify and Save"**

## 🧪 Testing Your Deployed Chatbot

### Test Endpoints

Replace `YOUR_RENDER_URL` with your actual Render URL:

```bash
# Test webhook verification
curl "https://YOUR_RENDER_URL.onrender.com/webhook?hub.mode=subscribe&hub.verify_token=your_verify_token&hub.challenge=test123"

# Test analytics
curl "https://YOUR_RENDER_URL.onrender.com/analytics"

# Test via PowerShell
Invoke-RestMethod -Uri "https://YOUR_RENDER_URL.onrender.com/analytics" -Method Get
```

### Test Facebook Integration

1. Go to your Facebook Page
2. Send a message to the page
3. Upload an image to test OCR functionality
4. Check Render logs for processing activity

## 📊 Monitoring Your Deployment

### Render Dashboard Features

- **Logs**: Real-time application logs
- **Metrics**: CPU, memory usage
- **Events**: Deployment history
- **Settings**: Environment variables, scaling

### View Logs
```bash
# In Render dashboard, click on your service → "Logs" tab
# You'll see real-time logs including:
# - Server startup messages
# - Incoming webhook requests
# - OCR processing status
# - Database operations
```

## 🔧 Production Optimizations

### Database Persistence

For production, consider upgrading to persistent storage:

1. In Render dashboard → Your service → "Settings"
2. Add a **Persistent Disk**:
   - Name: `kitakits-database`
   - Mount Path: `/opt/render/project/src/data`
   - Size: 1GB (free tier)

3. Update your database path in production:
   ```javascript
   const DB_PATH = process.env.NODE_ENV === 'production' 
     ? '/opt/render/project/src/data/chatbot.db'
     : './chatbot.db';
   ```

### Environment-Specific Configuration

Add to your `server.js`:

```javascript
// Production-specific settings
if (process.env.NODE_ENV === 'production') {
  // Trust proxy for proper IP handling
  app.set('trust proxy', 1);
  
  // Enhanced logging
  const morgan = require('morgan');
  app.use(morgan('combined'));
}
```

## 🛡️ Security Considerations

### Environment Variables Security
- Never commit real tokens to GitHub
- Use Render's environment variable encryption
- Rotate tokens periodically

### Webhook Security
Your app already includes webhook signature verification:
```javascript
// In server.js - verify Facebook webhook signature
if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
  return res.send(req.query['hub.challenge']);
}
```

## 🚨 Troubleshooting Common Issues

### Deployment Fails
- Check build logs in Render dashboard
- Ensure `package.json` has all dependencies
- Verify Node.js version compatibility

### Facebook Webhook Fails
- Check webhook URL is publicly accessible
- Verify `VERIFY_TOKEN` matches in both Facebook and Render
- Check Render logs for incoming requests

### OCR Not Working
- Ensure network connectivity from Render
- Check image URLs are accessible
- Monitor logs for Tesseract.js errors

### Database Issues
- For production, set up persistent disk
- Check file permissions on Render
- Consider upgrading to PostgreSQL for scale

## 📈 Scaling Considerations

### Free Tier Limitations
- Sleeps after 15 minutes of inactivity
- 750 hours/month limit
- Limited CPU/memory

### Upgrade Options
- **Starter Plan** ($7/month): Always on, custom domain
- **Standard Plan** ($25/month): More resources, faster builds
- **Pro Plan** ($85/month): Priority support, advanced features

## 🔄 Auto-Deployment Setup

Enable automatic deployments when you push to GitHub:

1. In Render dashboard → Your service → "Settings"
2. **Auto-Deploy**: Set to `Yes`
3. **Branch**: `main`

Now every push to main branch triggers automatic redeployment.

## 📱 Testing with Real Users

Once deployed:

1. **Share your Facebook Page** with test users
2. **Monitor Analytics**: Visit `https://your-url.onrender.com/analytics`
3. **Check Database Growth**: Monitor user interactions
4. **OCR Performance**: Test with various image types

## 🎯 Next Steps After Deployment

1. **Custom Domain** (optional): Add your own domain in Render
2. **SSL Certificate**: Automatically provided by Render
3. **Performance Monitoring**: Set up alerts for downtime
4. **Database Backup**: Regular backups of SQLite file
5. **Scale Planning**: Monitor usage for upgrade timing

## 📞 Support Resources

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Facebook Messenger Platform**: [developers.facebook.com/docs/messenger-platform](https://developers.facebook.com/docs/messenger-platform)
- **Your App Logs**: Render Dashboard → Your Service → Logs

---

## ✅ Deployment Checklist

- [ ] Repository pushed to GitHub
- [ ] Render account created and connected to GitHub
- [ ] Web service configured with correct build/start commands
- [ ] Environment variables set (especially Facebook tokens)
- [ ] Service deployed successfully
- [ ] Public URL obtained
- [ ] Facebook webhook configured with Render URL
- [ ] Webhook verification successful
- [ ] Test message sent through Facebook Page
- [ ] Analytics endpoint accessible
- [ ] Logs showing proper operation

**Your KitaKits chatbot will be live and ready to serve Philippine MSMEs!** 🇵🇭
