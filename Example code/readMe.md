# Facebook Messenger Bot Backend Setup Guide

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.8+
- A Facebook Developer Account
- A Facebook Page
- ngrok (for local development) or a public server

### 2. Facebook App Setup

#### Create Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app (Business type)
3. Add "Messenger" product to your app

#### Configure Webhook
1. In Messenger settings, add webhook URL: `https://your-domain.com/webhook`
2. Set verify token (save this for later)
3. Subscribe to `messages` events

#### Get Tokens
- **Page Access Token**: Generate from Messenger > Settings
- **App Secret**: Found in App Settings > Basic
- **Verify Token**: The one you set in webhook configuration

### 3. Installation

```bash
# Clone or create project directory
mkdir facebook-messenger-bot
cd facebook-messenger-bot

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export FACEBOOK_VERIFY_TOKEN="your_verify_token"
export FACEBOOK_ACCESS_TOKEN="your_page_access_token"
export FACEBOOK_APP_SECRET="your_app_secret"

# Or create .env file
echo "FACEBOOK_VERIFY_TOKEN=your_verify_token" > .env
echo "FACEBOOK_ACCESS_TOKEN=your_page_access_token" >> .env
echo "FACEBOOK_APP_SECRET=your_app_secret" >> .env
```

### 4. Run the Application

```bash
# Development
python app.py

# Production (with gunicorn)
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## 📋 Available Commands

### Authentication Commands
- `[help]` - Show available commands (no auth required)
- `[username]` `[password]` - Login (default: admin/admin123)

### Item Management Commands (requires authentication)
- `[itemID]` - Select item for operations
- `[add]` - Add 1 to item count
- `[subtract]` - Subtract 1 from item count
- `[count]` - Get current item count
- `[statistics]` - Generate and send Excel report

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facebook_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_authenticated INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
```

### Items Table
```sql
CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Command Logs Table
```sql
CREATE TABLE command_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facebook_id TEXT NOT NULL,
    command TEXT NOT NULL,
    parameters TEXT,
    success INTEGER DEFAULT 0,
    error_message TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### User Sessions Table
```sql
CREATE TABLE user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facebook_id TEXT NOT NULL,
    session_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 📊 Excel Report Features

The statistics report includes:
- **Items Sheet**: All items with counts and timestamps
- **Command Usage Sheet**: Command frequency and success rates
- **Daily Activity Sheet**: Usage statistics over the last 30 days
- **Summary Sheet**: Key metrics and report metadata

## 🔒 Security Features

- **Webhook Signature Verification**: Validates requests from Facebook
- **Password Hashing**: Uses Werkzeug's secure password hashing
- **Session Management**: Token-based authentication with expiration
- **Command Logging**: Comprehensive audit trail
- **SQL Injection Protection**: Parameterized queries

## 🚀 Deployment Options

### Option 1: Heroku
```bash
# Install Heroku CLI
# Create Procfile
echo "web: gunicorn app:app" > Procfile

# Deploy
heroku create your-bot-name
heroku config:set FACEBOOK_VERIFY_TOKEN=your_token
heroku config:set FACEBOOK_ACCESS_TOKEN=your_token
heroku config:set FACEBOOK_APP_SECRET=your_secret
git push heroku main
```

### Option 2: Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway add
railway deploy
```

### Option 3: DigitalOcean App Platform
1. Connect your GitHub repository
2. Set environment variables in the dashboard
3. Deploy with automatic builds

### Option 4: Docker
```bash
# Build and run
docker build -t facebook-bot .
docker run -p 5000:5000 --env-file .env facebook-bot

# Using docker-compose
docker-compose up -d
```

## 🛠️ Customization Options

### Adding New Commands
```python
def process_command(self, facebook_id: str, message_text: str) -> str:
    # Add your custom command logic here
    if command == 'your_custom_command':
        # Your implementation
        return "Response message"
```

### Custom Authentication
```python
def custom_auth_method(self, facebook_id: str, token: str) -> bool:
    # Implement custom authentication logic
    pass
```

### Enhanced Reporting
```python
def generate_custom_report(self, facebook_id: str, report_type: str) -> str:
    # Generate custom Excel reports
    pass
```

## 🧪 Testing

### Test Webhook Locally
```bash
# Install ngrok
# Run your app
python app.py

# In another terminal
ngrok http 5000

# Use ngrok URL in Facebook webhook settings
```

### Test Commands
1. Send message to your Facebook Page
2. Try commands: `[help]`, `[admin]`, `[admin123]`, `[add]`, etc.
3. Check logs and database

## 📱 Production Considerations

### Performance
- Use connection pooling for database
- Implement caching for frequent queries
- Consider Redis for session storage

### Monitoring
- Add application monitoring (New Relic, Datadog)
- Set up error alerts
- Monitor webhook delivery rates

### Backup
- Regular database backups
- Report file cleanup
- Log rotation

### Security
- Use environment variables for secrets
- Implement rate limiting
- Add IP whitelisting if needed
- Regular security updates

## 🔧 Troubleshooting

### Common Issues
1. **Webhook verification fails**: Check verify token matches
2. **Messages not received**: Verify webhook subscription
3. **File upload fails**: Check file permissions and disk space
4. **Authentication issues**: Verify password hashing

### Debug Mode
```python
app.run(host='0.0.0.0', port=5000, debug=True)
```

### Logs
Check application logs for errors:
```bash
tail -f app.log
```

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review Facebook Messenger Platform documentation
3. Check application logs
4. Test webhook with Facebook's testing tools