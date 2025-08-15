import os

class Config:
    # Facebook API Configuration
    FACEBOOK_VERIFY_TOKEN = os.getenv('FACEBOOK_VERIFY_TOKEN')
    FACEBOOK_ACCESS_TOKEN = os.getenv('FACEBOOK_ACCESS_TOKEN')
    FACEBOOK_APP_SECRET = os.getenv('FACEBOOK_APP_SECRET')
    
    # Database Configuration
    DATABASE_PATH = 'messenger_bot.db'
    
    # Application Configuration
    DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'
    PORT = int(os.getenv('PORT', 5000))
    HOST = os.getenv('HOST', '0.0.0.0')
    
    # Session Configuration
    SESSION_DURATION_HOURS = 24
    
    # Report Configuration
    REPORTS_DIRECTORY = 'reports'
    MAX_REPORT_AGE_DAYS = 30