import os
import sqlite3
import json
import hashlib
import hmac
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import pandas as pd
from flask import Flask, request, jsonify
import requests
from werkzeug.security import generate_password_hash, check_password_hash

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FacebookMessengerBot:
    def __init__(self, verify_token: str, access_token: str, app_secret: str):
        self.verify_token = verify_token
        self.access_token = access_token
        self.app_secret = app_secret
        self.db_path = 'messenger_bot.db'
        self.init_database()
        
    def init_database(self):
        """Initialize SQLite database with required tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                facebook_id TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_authenticated INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        ''')
        
        # Items table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Command logs table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS command_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                facebook_id TEXT NOT NULL,
                command TEXT NOT NULL,
                parameters TEXT,
                success INTEGER DEFAULT 0,
                error_message TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # User sessions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                facebook_id TEXT NOT NULL,
                session_token TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create default admin user if not exists
        cursor.execute('SELECT COUNT(*) FROM users WHERE username = ?', ('admin',))
        if cursor.fetchone()[0] == 0:
            admin_hash = generate_password_hash('admin123')
            cursor.execute('''
                INSERT INTO users (facebook_id, username, password_hash) 
                VALUES (?, ?, ?)
            ''', ('admin_fb_id', 'admin', admin_hash))
        
        conn.commit()
        conn.close()
        logger.info("Database initialized successfully")
    
    def verify_webhook_signature(self, payload: str, signature: str) -> bool:
        """Verify webhook signature for security"""
        if not signature:
            return False
        
        expected_signature = hmac.new(
            self.app_secret.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(f"sha256={expected_signature}", signature)
    
    def log_command(self, facebook_id: str, command: str, parameters: str = None, 
                   success: bool = True, error_message: str = None):
        """Log command execution to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO command_logs (facebook_id, command, parameters, success, error_message)
            VALUES (?, ?, ?, ?, ?)
        ''', (facebook_id, command, parameters, int(success), error_message))
        
        conn.commit()
        conn.close()
    
    def is_user_authenticated(self, facebook_id: str) -> bool:
        """Check if user is authenticated"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT us.expires_at FROM user_sessions us
            JOIN users u ON us.facebook_id = u.facebook_id
            WHERE us.facebook_id = ? AND us.expires_at > CURRENT_TIMESTAMP
            ORDER BY us.created_at DESC LIMIT 1
        ''', (facebook_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        return result is not None
    
    def authenticate_user(self, facebook_id: str, username: str, password: str) -> Tuple[bool, str]:
        """Authenticate user and create session"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT password_hash FROM users 
            WHERE username = ?
        ''', (username,))
        
        result = cursor.fetchone()
        
        if not result or not check_password_hash(result[0], password):
            conn.close()
            return False, "Invalid credentials"
        
        # Update or insert user's Facebook ID
        cursor.execute('''
            UPDATE users SET facebook_id = ?, last_login = CURRENT_TIMESTAMP
            WHERE username = ?
        ''', (facebook_id, username))
        
        # Create session
        session_token = hashlib.sha256(f"{facebook_id}{datetime.now()}".encode()).hexdigest()
        expires_at = datetime.now() + timedelta(hours=24)
        
        cursor.execute('''
            INSERT INTO user_sessions (facebook_id, session_token, expires_at)
            VALUES (?, ?, ?)
        ''', (facebook_id, session_token, expires_at))
        
        conn.commit()
        conn.close()
        
        return True, "Authentication successful"
    
    def get_item_count(self, item_id: str) -> Optional[int]:
        """Get current count for an item"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT count FROM items WHERE item_id = ?', (item_id,))
        result = cursor.fetchone()
        conn.close()
        
        return result[0] if result else None
    
    def modify_item_count(self, item_id: str, operation: str, amount: int = 1) -> Tuple[bool, str, int]:
        """Add or subtract from item count"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Check if item exists
        cursor.execute('SELECT count FROM items WHERE item_id = ?', (item_id,))
        result = cursor.fetchone()
        
        if not result:
            # Create new item
            cursor.execute('''
                INSERT INTO items (item_id, name, count) 
                VALUES (?, ?, ?)
            ''', (item_id, item_id, 1 if operation == 'add' else 0))
            new_count = 1 if operation == 'add' else 0
        else:
            current_count = result[0]
            
            if operation == 'add':
                new_count = current_count + amount
            else:  # subtract
                new_count = max(0, current_count - amount)
            
            cursor.execute('''
                UPDATE items SET count = ?, updated_at = CURRENT_TIMESTAMP
                WHERE item_id = ?
            ''', (new_count, item_id))
        
        conn.commit()
        conn.close()
        
        return True, f"Item {item_id} {operation}ed successfully", new_count
    
    def generate_statistics_report(self, facebook_id: str) -> str:
        """Generate Excel statistics report"""
        conn = sqlite3.connect(self.db_path)
        
        # Get items data
        items_df = pd.read_sql_query('''
            SELECT item_id, name, count, created_at, updated_at 
            FROM items ORDER BY updated_at DESC
        ''', conn)
        
        # Get command logs
        logs_df = pd.read_sql_query('''
            SELECT command, COUNT(*) as usage_count, 
                   MAX(timestamp) as last_used,
                   SUM(success) as success_count,
                   COUNT(*) - SUM(success) as error_count
            FROM command_logs 
            GROUP BY command
            ORDER BY usage_count DESC
        ''', conn)
        
        # Get user activity
        activity_df = pd.read_sql_query('''
            SELECT DATE(timestamp) as date, 
                   COUNT(*) as commands_executed,
                   COUNT(DISTINCT facebook_id) as unique_users
            FROM command_logs 
            WHERE timestamp >= datetime('now', '-30 days')
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
        ''', conn)
        
        conn.close()
        
        # Create Excel file
        filename = f"statistics_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        filepath = os.path.join('reports', filename)
        
        # Create reports directory if it doesn't exist
        os.makedirs('reports', exist_ok=True)
        
        with pd.ExcelWriter(filepath, engine='openpyxl') as writer:
            items_df.to_excel(writer, sheet_name='Items', index=False)
            logs_df.to_excel(writer, sheet_name='Command Usage', index=False)
            activity_df.to_excel(writer, sheet_name='Daily Activity', index=False)
            
            # Add summary sheet
            summary_data = {
                'Metric': [
                    'Total Items',
                    'Total Commands Executed',
                    'Unique Users',
                    'Report Generated'
                ],
                'Value': [
                    len(items_df),
                    logs_df['usage_count'].sum() if not logs_df.empty else 0,
                    'N/A',  # Would need user tracking
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ]
            }
            summary_df = pd.DataFrame(summary_data)
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
        
        return filepath
    
    def send_message(self, recipient_id: str, message_text: str):
        """Send message to user via Facebook Messenger"""
        url = f"https://graph.facebook.com/v18.0/me/messages?access_token={self.access_token}"
        
        data = {
            "recipient": {"id": recipient_id},
            "message": {"text": message_text}
        }
        
        response = requests.post(url, json=data)
        if response.status_code != 200:
            logger.error(f"Failed to send message: {response.text}")
    
    def send_file(self, recipient_id: str, file_path: str):
        """Send file to user via Facebook Messenger"""
        url = f"https://graph.facebook.com/v18.0/me/messages?access_token={self.access_token}"
        
        with open(file_path, 'rb') as f:
            files = {'filedata': f}
            data = {
                'recipient': json.dumps({"id": recipient_id}),
                'message': json.dumps({
                    "attachment": {
                        "type": "file",
                        "payload": {}
                    }
                })
            }
            
            response = requests.post(url, data=data, files=files)
            if response.status_code != 200:
                logger.error(f"Failed to send file: {response.text}")
    
    def process_command(self, facebook_id: str, message_text: str) -> str:
        """Process incoming command and return response"""
        message_text = message_text.strip()
        
        # Help command
        if message_text == '[help]':
            self.log_command(facebook_id, 'help', success=True)
            return """Available commands:
[help] - Show this help message
[username] [password] - Login (e.g., [admin] [admin123])
[itemID] - Set target item for operations
[add] - Add 1 to current item count
[subtract] - Subtract 1 from current item count
[count] - Get current count for item
[statistics] - Generate and send Excel report

Note: You must be authenticated to use commands other than [help]."""
        
        # Authentication commands
        if message_text.startswith('[') and message_text.endswith(']'):
            # Parse potential username/password
            content = message_text[1:-1]
            
            # Check if this looks like a login attempt
            if not self.is_user_authenticated(facebook_id):
                # Try to authenticate
                success, message = self.authenticate_user(facebook_id, content, content)
                if success:
                    self.log_command(facebook_id, 'login', content, success=True)
                    return message
                else:
                    # Could be a command that requires auth
                    return "Please authenticate first. Use [username] followed by [password] or use [help] for instructions."
        
        # Check authentication for other commands
        if not self.is_user_authenticated(facebook_id):
            return "You must be authenticated to use this command. Please login first."
        
        # Parse authenticated commands
        if message_text.startswith('[') and message_text.endswith(']'):
            command = message_text[1:-1].lower()
            
            if command == 'statistics':
                try:
                    report_path = self.generate_statistics_report(facebook_id)
                    self.send_file(facebook_id, report_path)
                    self.log_command(facebook_id, 'statistics', success=True)
                    return "Statistics report generated and sent!"
                except Exception as e:
                    self.log_command(facebook_id, 'statistics', success=False, error_message=str(e))
                    return f"Error generating report: {str(e)}"
            
            elif command == 'add':
                # For simplicity, using a default item. In practice, you'd track current item per user
                success, message, new_count = self.modify_item_count('default_item', 'add')
                self.log_command(facebook_id, 'add', 'default_item', success=success)
                return f"{message}. New count: {new_count}"
            
            elif command == 'subtract':
                success, message, new_count = self.modify_item_count('default_item', 'subtract')
                self.log_command(facebook_id, 'subtract', 'default_item', success=success)
                return f"{message}. New count: {new_count}"
            
            elif command == 'count':
                count = self.get_item_count('default_item')
                count = count if count is not None else 0
                self.log_command(facebook_id, 'count', 'default_item', success=True)
                return f"Current count for default_item: {count}"
            
            else:
                # Treat as item ID
                # Store current item for user (simplified - in practice, use session storage)
                self.log_command(facebook_id, 'set_item', command, success=True)
                return f"Item '{command}' selected. Use [add], [subtract], or [count] to interact with it."
        
        # Unknown command
        self.log_command(facebook_id, 'unknown', message_text, success=False, error_message="Unknown command")
        return "Unknown command. Use [help] to see available commands."

# Flask application
app = Flask(__name__)

# Configuration - Replace with your actual tokens
VERIFY_TOKEN = os.getenv('FACEBOOK_VERIFY_TOKEN', 'your_verify_token_here')
ACCESS_TOKEN = os.getenv('FACEBOOK_ACCESS_TOKEN', 'your_access_token_here')
APP_SECRET = os.getenv('FACEBOOK_APP_SECRET', 'your_app_secret_here')

# Initialize bot
bot = FacebookMessengerBot(VERIFY_TOKEN, ACCESS_TOKEN, APP_SECRET)

@app.route('/webhook', methods=['GET'])
def verify_webhook():
    """Verify webhook with Facebook"""
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    if mode == 'subscribe' and token == VERIFY_TOKEN:
        logger.info("Webhook verified successfully")
        return challenge
    else:
        logger.warning("Webhook verification failed")
        return 'Verification failed', 403

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    """Handle incoming messages from Facebook"""
    # Verify signature
    signature = request.headers.get('X-Hub-Signature-256')
    if not bot.verify_webhook_signature(request.get_data(as_text=True), signature):
        logger.warning("Invalid webhook signature")
        return 'Invalid signature', 403
    
    data = request.get_json()
    
    if data.get('object') == 'page':
        for entry in data.get('entry', []):
            for messaging_event in entry.get('messaging', []):
                if 'message' in messaging_event:
                    sender_id = messaging_event['sender']['id']
                    message_text = messaging_event['message'].get('text', '')
                    
                    logger.info(f"Received message from {sender_id}: {message_text}")
                    
                    # Process command and send response
                    response = bot.process_command(sender_id, message_text)
                    bot.send_message(sender_id, response)
    
    return 'OK', 200

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })

if __name__ == '__main__':
    # Create reports directory
    os.makedirs('reports', exist_ok=True)
    
    # Run the Flask app - Render will provide the PORT environment variable
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)