from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore, auth
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import hashlib
import uuid
import datetime
import os
import json
import qrcode
import io
import base64
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import threading
import time
import logging
from flask import render_template
from google.cloud.firestore_v1 import FieldFilter
from flask import jsonify
from flask import session

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = '12345678'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
CORS(app)

# Email Configuration
EMAIL_CONFIG = {
    'smtp_server': 'smtp.gmail.com',
    'smtp_port': 587,
    'email': 'printqsystem@gmail.com',  # Change this
    'password': 'sppt mulz koph islp ',  # Change this to your app password
}

# Firebase Configuration
# Initialize Firebase (you need to add your service account key)
def initialize_firebase():
    try:
        if os.environ.get('FIREBASE_CREDENTIALS'):
            # For production (Render) - use env variable with full JSON key
            service_account_info = json.loads(os.environ['FIREBASE_CREDENTIALS'])
            cred = credentials.Certificate(service_account_info)
            logger.info("Using Firebase credentials from environment")
        else:
            # For local development - use the local JSON file
            cred = credentials.Certificate('printq-a315a-firebase-adminsdk-fbsvc-9cd890e3ae.json')
            logger.info("Using Firebase credentials from local file")

        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
            logger.info("Firebase initialized successfully")

        return firestore.client()

    except Exception as e:
        logger.error(f"Firebase initialization failed: {e}")
        # Optionally stop execution if Firebase is critical
        # exit(1)

db = initialize_firebase()

# Default admin credentials
DEFAULT_ADMIN = {
    'email': 'PRINTQadmin@gmail.com',
    'password': 'admin1234',
    'username': 'Admin',
    'created_at': datetime.datetime.now(),
    'is_default': True
}

# Pricing configuration
PRICING = {
    'bw_single': 1.05,
    'bw_duplex': 2.08,
    'color_single': 3.30,
    'color_duplex': 5.25,
    'binding': 4.00,
    'a3_multiplier': 2.5
}

class PrintQBackend:
    def __init__(self):
        self.initialize_default_admin()
        self.initialize_printers()
    
    def initialize_default_admin(self):
        """Initialize default admin if not exists"""
        try:
            admins_ref = db.collection('admins')
            default_admin_query = admins_ref.where('email', '==', DEFAULT_ADMIN['email']).limit(1)
            docs = default_admin_query.get()
            
            if not docs:
                admin_data = DEFAULT_ADMIN.copy()
                admin_data['password'] = generate_password_hash(admin_data['password'])
                admin_data['id'] = str(uuid.uuid4())
                
                admins_ref.document(admin_data['id']).set(admin_data)
                logger.info("Default admin created successfully")
            else:
                logger.info("Default admin already exists")
        except Exception as e:
            logger.error(f"Error initializing default admin: {e}")
    
    def initialize_printers(self):
        """Initialize default printers"""
        try:
            printers_ref = db.collection('printers')
            existing_printers = printers_ref.get()
            
            if not existing_printers:
                default_printers = [
                    {
                        'id': str(uuid.uuid4()),
                        'name': 'Library Printer 1',
                        'location': 'Main Library - Ground Floor',
                        'type': 'multifunc',
                        'status': 'online',
                        'paper_level': 85,
                        'toner_level': 70,
                        'created_at': datetime.datetime.now()
                    },
                    {
                        'id': str(uuid.uuid4()),
                        'name': 'Student Center Printer',
                        'location': 'Student Center - 2nd Floor',
                        'type': 'color',
                        'status': 'online',
                        'paper_level': 90,
                        'toner_level': 45,
                        'created_at': datetime.datetime.now()
                    }
                ]
                
                for printer in default_printers:
                    printers_ref.document(printer['id']).set(printer)
                logger.info("Default printers created successfully")
        except Exception as e:
            logger.error(f"Error initializing printers: {e}")
            
def normalize_timestamp(ts):
    if not ts:
        return None
    if isinstance(ts, datetime.datetime):
        return ts
    if hasattr(ts, "to_datetime"):
        return ts.to_datetime()
    return None

# Initialize backend
backend = PrintQBackend()

# Email Templates
def get_email_template(template_type, data):
    """Generate modern HTML email templates with enhanced PrintQ branding"""
    
    base_style = """
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 0;
            background: #f5f5f5;
            color: #2d3748;
            line-height: 1.6;
        }
        
        .email-wrapper {
            background: #f5f5f5;
            padding: 20px;
            min-height: 100vh;
        }
        
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            border: 1px solid #e2e8f0;
        }
        
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px; 
            text-align: center; 
            position: relative;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" patternUnits="userSpaceOnUse" width="100" height="100"><circle cx="25" cy="25" r="1" fill="white" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.1"/><circle cx="50" cy="10" r="1" fill="white" opacity="0.1"/><circle cx="10" cy="50" r="1" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
            opacity: 0.3;
        }
        
        .logo { 
            font-size: 24px; 
            font-weight: 700; 
            color: #ffffff; 
            margin-bottom: 10px;
            position: relative;
            z-index: 2;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .logo-icon {
            width: 32px;
            height: 32px;
            background: rgba(255,255,255,0.2);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            backdrop-filter: blur(10px);
        }
        
        .header h2 {
            color: #ffffff;
            font-weight: 600;
            font-size: 20px;
            position: relative;
            z-index: 2;
            margin: 0;
        }
        
        .content { 
            padding: 30px; 
            background: #ffffff;
        }
        
        .greeting {
            font-size: 16px;
            font-weight: 500;
            margin-bottom: 16px;
            color: #2d3748;
        }
        
        .message {
            font-size: 15px;
            color: #4a5568;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            border-radius: 20px;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
        }
        
        .status-pending { 
            background: linear-gradient(135deg, #ff9500, #ff6b00);
            color: #ffffff; 
        }
        .status-approved { 
            background: linear-gradient(135deg, #48bb78, #38a169);
            color: #ffffff; 
        }
        .status-printing { 
            background: linear-gradient(135deg, #4299e1, #3182ce);
            color: #ffffff; 
        }
        .status-completed { 
            background: linear-gradient(135deg, #48bb78, #38a169);
            color: #ffffff; 
        }
        .status-failed { 
            background: linear-gradient(135deg, #f56565, #e53e3e);
            color: #ffffff; 
        }
        
        .job-details {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
        }
        
        .job-details h3 {
            color: #2d3748;
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .detail-row:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }
        
        .detail-label {
            font-weight: 500;
            color: #4a5568;
            font-size: 14px;
        }
        
        .detail-value {
            font-weight: 600;
            color: #2d3748;
            font-size: 14px;
        }
        
        .pickup-pin {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 24px;
            font-weight: 700;
            text-align: center;
            letter-spacing: 1px;
            margin: 16px 0;
            font-family: 'Courier New', monospace;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        
        .cta-button {
            display: inline-block;
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 16px 0;
            text-align: center;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            transition: all 0.2s ease;
        }
        
        .cta-button:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
            text-decoration: none;
            color: white;
        }
        
        .eco-tip {
            background: linear-gradient(135deg, #c6f6d5, #9ae6b4);
            border: 1px solid #68d391;
            padding: 16px;
            border-radius: 8px;
            margin: 20px 0;
            color: #22543d;
            font-weight: 500;
            font-size: 14px;
        }
        
        .eco-tip-header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            margin-bottom: 6px;
        }
        
        .highlight-box {
            background: linear-gradient(135deg, #fff5f5, #fed7d7);
            border: 1px solid #fc8181;
            border-left: 4px solid #f56565;
            padding: 16px;
            border-radius: 8px;
            margin: 16px 0;
        }
        
        .balance-display {
            font-size: 28px;
            font-weight: 700;
            color: #f56565;
            text-align: center;
            margin: 16px 0;
        }
        
        .footer { 
            background: linear-gradient(135deg, #2d3748, #4a5568);
            color: #a0aec0;
            padding: 20px; 
            text-align: center; 
            font-size: 13px;
        }
        
        .footer-brand {
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 6px;
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, #e2e8f0, transparent);
            margin: 20px 0;
        }
        
        /* Mobile Responsiveness */
        @media (max-width: 600px) {
            .email-wrapper {
                padding: 10px;
            }
            
            .container {
                border-radius: 12px;
            }
            
            .header {
                padding: 20px;
            }
            
            .content {
                padding: 20px;
            }
            
            .logo {
                font-size: 20px;
            }
            
            .header h2 {
                font-size: 18px;
            }
            
            .pickup-pin {
                font-size: 20px;
                padding: 10px 16px;
            }
            
            .detail-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
            }
        }
        
        /* Outlook specific fixes */
        table {
            border-collapse: collapse;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }
        
        img {
            border: 0;
            height: auto;
            line-height: 100%;
            outline: none;
            text-decoration: none;
            -ms-interpolation-mode: bicubic;
        }
    </style>
    """
    
    if template_type == 'welcome':
        return f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PrintQ - Welcome to PrintQ!</title>
            {base_style}
        </head>
        <body>
            <div class="email-wrapper">
                <div class="container">
                    <div class="header">
                        <div class="logo">
                            <div class="logo-icon">🎉</div>
                            PrintQ
                        </div>
                        <h2>Welcome to PrintQ!</h2>
                    </div>
                    <div class="content">
                        <div class="greeting">Hi {data.get('student_name', 'Student')}! 👋</div>
                        <div class="message">
                            Welcome to PrintQ - Smart Campus Printing! We're excited to have you on board. Your account has been successfully created and you're ready to start printing.
                        </div>
                        
                        <div class="job-details">
                            <h3>👤 Your Account Details</h3>
                            <div class="detail-row">
                                <span class="detail-label">Student ID</span>
                                <span class="detail-value">{data.get('student_id', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Email</span>
                                <span class="detail-value">{data.get('email', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Initial Balance</span>
                                <span class="detail-value">${data.get('initial_balance', 0):.2f}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Account Status</span>
                                <span class="detail-value">
                                    <span class="status-badge status-approved">✅ ACTIVE</span>
                                </span>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="{data.get('app_link', '#')}" class="cta-button">
                                📱 Start Printing Now
                            </a>
                        </div>
                        
                        <div class="eco-tip">
                            <div class="eco-tip-header">
                                🌟 Getting Started Tips
                            </div>
                            <ul style="margin: 8px 0 0 20px; padding: 0;">
                                <li style="margin-bottom: 4px;">Upload your documents through our mobile app or website</li>
                                <li style="margin-bottom: 4px;">Choose your preferred printer location on campus</li>
                                <li style="margin-bottom: 4px;">Get notified when your print job is ready for pickup</li>
                                <li>Use your student ID and pickup PIN to collect your documents</li>
                            </ul>
                        </div>
                        
                        <div class="divider"></div>
                        <p style="color: #4a5568; font-size: 14px; text-align: center;">
                            Need help? Visit our support center or contact us at <strong>support@printq.com</strong>
                        </p>
                    </div>
                    <div class="footer">
                        <div class="footer-brand">PrintQ - Smart Campus Printing</div>
                        <div>© 2024 • Welcome aboard!</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
    
    elif template_type == 'job_submitted':
        return f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PrintQ - Job Submitted</title>
            {base_style}
        </head>
        <body>
            <div class="email-wrapper">
                <div class="container">
                    <div class="header">
                        <div class="logo">
                            <div class="logo-icon">📱</div>
                            PrintQ
                        </div>
                        <h2>Job Submitted Successfully!</h2>
                    </div>
                    <div class="content">
                        <div class="greeting">Hi {data.get('student_name', 'Student')}! 👋</div>
                        <div class="message">
                            Your print job has been submitted and is now waiting for approval. We'll notify you as soon as it's ready!
                        </div>
                        
                        <div class="job-details">
                            <h3>📄 Job Details</h3>
                            <div class="detail-row">
                                <span class="detail-label">Job ID</span>
                                <span class="detail-value">{data.get('job_id', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">File Name</span>
                                <span class="detail-value">{data.get('file_name', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Pages</span>
                                <span class="detail-value">{data.get('pages', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Cost</span>
                                <span class="detail-value">${data.get('cost', 0):.2f}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Status</span>
                                <span class="detail-value">
                                    <span class="status-badge status-pending">⏳ PENDING APPROVAL</span>
                                </span>
                            </div>
                        </div>
                        
                        {f'''<div class="eco-tip">
                            <div class="eco-tip-header">
                                🌱 Eco-Friendly Choice!
                            </div>
                            Great choice on double-sided printing! You're helping save trees and reduce waste.
                        </div>''' if data.get('duplex') else ''}
                        
                        <div class="divider"></div>
                        <p style="color: #4a5568; font-size: 14px; text-align: center;">
                            You'll receive another notification once your job is approved and ready for pickup.
                        </p>
                    </div>
                    <div class="footer">
                        <div class="footer-brand">PrintQ - Smart Campus Printing</div>
                        <div>© 2024 • This is an automated message, please do not reply.</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
    
    elif template_type == 'job_approved':
        return f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PrintQ - Job Approved</title>
            {base_style}
        </head>
        <body>
            <div class="email-wrapper">
                <div class="container">
                    <div class="header">
                        <div class="logo">
                            <div class="logo-icon">✅</div>
                            PrintQ
                        </div>
                        <h2>Job Approved - Ready to Print!</h2>
                    </div>
                    <div class="content">
                        <div class="greeting">Hi {data.get('student_name', 'Student')}! 🎉</div>
                        <div class="message">
                            Great news! Your print job has been approved and is now in the printing queue.
                        </div>
                        
                        <div class="job-details">
                            <h3>📄 Job Details</h3>
                            <div class="detail-row">
                                <span class="detail-label">Job ID</span>
                                <span class="detail-value">{data.get('job_id', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Printer</span>
                                <span class="detail-value">{data.get('printer_name', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Location</span>
                                <span class="detail-value">{data.get('printer_location', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Status</span>
                                <span class="detail-value">
                                    <span class="status-badge status-approved">✅ APPROVED</span>
                                </span>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 24px 0;">
                            <div style="color: #4a5568; margin-bottom: 8px; font-weight: 500; font-size: 14px;">Your Pickup PIN</div>
                            <div class="pickup-pin">{data.get('pickup_pin', 'N/A')}</div>
                            <div style="color: #718096; font-size: 12px; margin-top: 8px;">Keep this PIN safe - you'll need it to collect your prints!</div>
                        </div>
                        
                        <div class="divider"></div>
                        <p style="color: #4a5568; font-size: 14px; text-align: center;">
                            📍 Head to <strong>{data.get('printer_location', 'the printer location')}</strong> when your job is completed!
                        </p>
                    </div>
                    <div class="footer">
                        <div class="footer-brand">PrintQ - Smart Campus Printing</div>
                        <div>© 2024</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
    
    elif template_type == 'job_completed':
        return f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PrintQ - Job Completed</title>
            {base_style}
        </head>
        <body>
            <div class="email-wrapper">
                <div class="container">
                    <div class="header">
                        <div class="logo">
                            <div class="logo-icon">🎉</div>
                            PrintQ
                        </div>
                        <h2>Print Job Completed!</h2>
                    </div>
                    <div class="content">
                        <div class="greeting">Hi {data.get('student_name', 'Student')}! 🎉</div>
                        <div class="message">
                            Your print job is ready for pickup! Don't forget to collect your documents.
                        </div>
                        
                        <div class="job-details">
                            <h3>📄 Job Details</h3>
                            <div class="detail-row">
                                <span class="detail-label">Job ID</span>
                                <span class="detail-value">{data.get('job_id', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Printer</span>
                                <span class="detail-value">{data.get('printer_name', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Location</span>
                                <span class="detail-value">{data.get('printer_location', 'N/A')}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Status</span>
                                <span class="detail-value">
                                    <span class="status-badge status-completed">🎉 COMPLETED</span>
                                </span>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 24px 0;">
                            <div style="color: #4a5568; margin-bottom: 8px; font-weight: 500; font-size: 14px;">Your Pickup PIN</div>
                            <div class="pickup-pin">{data.get('pickup_pin', 'N/A')}</div>
                        </div>
                        
                        <div class="highlight-box" style="text-align: center;">
                            <div style="font-size: 16px; font-weight: 600; color: #2d3748; margin-bottom: 6px;">
                                🏃‍♂️ Ready for Pickup!
                            </div>
                            <div style="color: #4a5568; font-size: 14px;">
                                Head to <strong>{data.get('printer_location', 'the printer location')}</strong> now to collect your documents!<br>
                                Remember to bring your student ID and use the pickup PIN above.
                            </div>
                        </div>
                        
                        {f'''<div class="eco-tip">
                            <div class="eco-tip-header">
                                🌱 Eco Points Earned!
                            </div>
                            Thanks for choosing eco-friendly printing options! You earned <strong>{data.get("eco_points", 0)} eco points</strong>!
                        </div>''' if data.get('eco_points') else ''}
                    </div>
                    <div class="footer">
                        <div class="footer-brand">PrintQ - Smart Campus Printing</div>
                        <div>© 2024</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
    
    elif template_type == 'low_balance':
        return f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PrintQ - Low Balance Alert</title>
            {base_style}
        </head>
        <body>
            <div class="email-wrapper">
                <div class="container">
                    <div class="header">
                        <div class="logo">
                            <div class="logo-icon">⚠️</div>
                            PrintQ
                        </div>
                        <h2>Low Wallet Balance Alert</h2>
                    </div>
                    <div class="content">
                        <div class="greeting">Hi {data.get('student_name', 'Student')}! 👋</div>
                        <div class="message">
                            Your PrintQ wallet balance is running low. Add money now to ensure uninterrupted printing services.
                        </div>
                        
                        <div class="highlight-box" style="text-align: center;">
                            <div style="color: #4a5568; margin-bottom: 12px; font-weight: 500; font-size: 14px;">Current Balance</div>
                            <div class="balance-display">${data.get('balance', 0):.2f}</div>
                            <div style="color: #718096; font-size: 12px;">Recommended top-up: $10.00 or more</div>
                        </div>
                        
                        <div class="job-details">
                            <h3>💰 Wallet Status</h3>
                            <div class="detail-row">
                                <span class="detail-label">Current Balance</span>
                                <span class="detail-value" style="color: #f56565;">${data.get('balance', 0):.2f}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Recommended Top-up</span>
                                <span class="detail-value">$10.00 or more</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Status</span>
                                <span class="detail-value" style="color: #f56565; font-weight: 600;">⚠️ Low Balance</span>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="{data.get('top_up_link', '#')}" class="cta-button">
                                💳 Add Money to Wallet
                            </a>
                        </div>
                        
                        <div style="color: #718096; font-size: 12px; text-align: center;">
                            💡 Pro tip: Set up automatic top-ups to never run out of balance again!
                        </div>
                    </div>
                    <div class="footer">
                        <div class="footer-brand">PrintQ - Smart Campus Printing</div>
                        <div>© 2024</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
    
    else:
        return f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PrintQ Notification</title>
            {base_style}
        </head>
        <body>
            <div class="email-wrapper">
                <div class="container">
                    <div class="header">
                        <div class="logo">
                            <div class="logo-icon">📱</div>
                            PrintQ
                        </div>
                        <h2>Notification</h2>
                    </div>
                    <div class="content">
                        <div class="message">
                            Thank you for using PrintQ - Smart Campus Printing!
                        </div>
                    </div>
                    <div class="footer">
                        <div class="footer-brand">PrintQ - Smart Campus Printing</div>
                        <div>© 2024</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """

def send_email(to_email, subject, template_type, data):
    """Send email notification"""
    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = EMAIL_CONFIG['email']
        msg['To'] = to_email
        msg['Subject'] = f"PrintQ - {subject}"
        
        html_body = get_email_template(template_type, data)
        msg.attach(MIMEText(html_body, 'html'))
        
        server = smtplib.SMTP(EMAIL_CONFIG['smtp_server'], EMAIL_CONFIG['smtp_port'])
        server.starttls()
        server.login(EMAIL_CONFIG['email'], EMAIL_CONFIG['password'])
        server.send_message(msg)
        server.quit()
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False

def generate_qr_code(data):
    """Generate QR code for job pickup"""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(json.dumps(data))
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    return base64.b64encode(buffer.getvalue()).decode()

def calculate_cost(pages, is_color=False, is_duplex=False, paper_size='A4', binding=False, copies=1):
    """Calculate printing cost"""
    base_cost = PRICING['color_single'] if is_color else PRICING['bw_single']
    if is_duplex:
        base_cost = PRICING['color_duplex'] if is_color else PRICING['bw_duplex']
    
    cost = pages * base_cost * copies
    
    if paper_size == 'A3':
        cost *= PRICING['a3_multiplier']
    
    if binding:
        cost += PRICING['binding']
    
    return round(cost, 2)

def generate_pickup_pin():
    """Generate 6-digit pickup PIN"""
    return str(uuid.uuid4().int)[:6]


# Serve student page
@app.route('/')
def student_home():
    return render_template('student.html')

# Serve admin page
@app.route('/admin')
def admin_home():
    return render_template('admin.html')

def validate_token(auth_header):
    """Validate authentication token"""
    try:
        if not auth_header:
            return None, "No authorization header"
        
        if not auth_header.startswith('Bearer '):
            return None, "Invalid authorization format"
        
        token = auth_header[7:]  # Remove 'Bearer '
        
        # Parse custom token format: student_<id>_<timestamp> or admin_<id>_<timestamp>
        parts = token.split('_')
        if len(parts) < 3:
            return None, "Invalid token format"
        
        user_type = parts[0]
        user_id = parts[1]
        # timestamp can be used for expiry validation
        
        if user_type not in ['student', 'admin']:
            return None, "Invalid user type"
        
        # Check if user exists
        collection = 'students' if user_type == 'student' else 'admins'
        user_doc = db.collection(collection).document(user_id).get()
        
        if not user_doc.exists:
            return None, "User not found"
        
        return {
            'user_type': user_type,
            'user_id': user_id,
            'user_data': user_doc.to_dict()
        }, None
    
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        return None, f"Token validation error: {str(e)}"

def require_auth(f):
    """Decorator to require authentication"""
    from functools import wraps
    
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        auth_data, error = validate_token(auth_header)
        
        if error:
            return jsonify({'success': False, 'message': error}), 401
        
        # Add auth data to request context
        request.auth = auth_data
        return f(*args, **kwargs)
    
    return decorated_function

# API Routes

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Handle user login"""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    user_type = data.get('user_type', 'student')  # 'student' or 'admin'
    
    try:
        if user_type == 'admin':
            # Admin login
            admins_ref = db.collection('admins')
            admin_query = admins_ref.where('email', '==', email).limit(1)
            docs = admin_query.get()
            
            if docs and check_password_hash(docs[0].to_dict()['password'], password):
                admin_data = docs[0].to_dict()
                return jsonify({
                    'success': True,
                    'user': {
                        'id': docs[0].id,
                        'email': admin_data['email'],
                        'username': admin_data['username'],
                        'type': 'admin'
                    },
                    'token': f"admin_{docs[0].id}_{int(time.time())}"
                })
        else:
            # Student login
            students_ref = db.collection('students')
            student_query = students_ref.where('email', '==', email).limit(1)
            docs = student_query.get()
            
            if docs and check_password_hash(docs[0].to_dict()['password'], password):
                student_data = docs[0].to_dict()
                return jsonify({
                    'success': True,
                    'user': {
                        'id': docs[0].id,
                        'email': student_data['email'],
                        'username': student_data['username'],
                        'student_id': student_data['student_id'],
                        'wallet_balance': student_data.get('wallet_balance', 0.0),
                        'eco_points': student_data.get('eco_points', 0),
                        'type': 'student'
                    },
                    'token': f"student_{docs[0].id}_{int(time.time())}"
                })
        
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'success': False, 'message': 'Login failed'}), 500

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Handle user registration"""
    data = request.get_json()
    
    try:
        user_type = data.get('user_type', 'student')
        
        if user_type == 'admin':
            # Admin registration
            admin_code = data.get('admin_code')
            if admin_code != 'PRINTQ2024ADMIN':  # Change this to your desired admin code
                return jsonify({'success': False, 'message': 'Invalid admin code'}), 400
            
            # Check if admin email already exists
            admins_ref = db.collection('admins')
            existing = admins_ref.where('email', '==', data['email']).get()
            if existing:
                return jsonify({'success': False, 'message': 'Admin email already exists'}), 400
            
            admin_data = {
                'id': str(uuid.uuid4()),
                'username': data['username'],
                'email': data['email'],
                'password': generate_password_hash(data['password']),
                'created_at': datetime.datetime.now(),
                'is_default': False
            }
            
            admins_ref.document(admin_data['id']).set(admin_data)
            
            return jsonify({
                'success': True,
                'message': 'Admin registered successfully',
                'user_id': admin_data['id']
            })
        
        else:
            # Student registration
            students_ref = db.collection('students')
            
            # Check if email or student_id already exists
            existing_email = students_ref.where('email', '==', data['email']).get()
            existing_student_id = students_ref.where('student_id', '==', data['student_id']).get()
            
            if existing_email:
                return jsonify({'success': False, 'message': 'Email already exists'}), 400
            if existing_student_id:
                return jsonify({'success': False, 'message': 'Student ID already exists'}), 400
            
            student_data = {
                'id': str(uuid.uuid4()),
                'username': data['username'],
                'email': data['email'],
                'student_id': data['student_id'],
                'password': generate_password_hash(data['password']),
                'wallet_balance': 0.0,
                'eco_points': 0,
                'total_jobs': 0,
                'total_pages': 0,
                'total_spent': 0.0,
                'created_at': datetime.datetime.now(),
                'email_notifications': True,
                'eco_tips': True,
                'auto_duplex': True
            }
            
            students_ref.document(student_data['id']).set(student_data)
            
            # Send welcome email
            threading.Thread(target=send_email, args=(
                data['email'],
                'Welcome to PrintQ!',
                'job_submitted',  # Reusing template
                {
                    'student_name': data['username'],
                    'job_id': 'WELCOME',
                    'file_name': 'Welcome to PrintQ Campus Printing',
                    'pages': 1,
                    'cost': 0.00
                }
            )).start()
            
            return jsonify({
                'success': True,
                'message': 'Student registered successfully',
                'user_id': student_data['id']
            })
    
    except Exception as e:
        logger.error(f"Registration error: {e}")
        return jsonify({'success': False, 'message': 'Registration failed'}), 500

@app.route('/api/jobs/submit', methods=['POST'])
@require_auth  # Add authentication middleware
def submit_job():
    """Submit a new print job"""
    try:
        # Check if file is uploaded
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'}), 400
        
        # Get student ID from authenticated user (not form data)
        student_id = request.auth['user_id']  # Fixed: Get from auth context
        
        # Get form data
        pages = int(request.form.get('pages', 1))
        is_color = request.form.get('color', 'false').lower() == 'true'
        is_duplex = request.form.get('duplex', 'false').lower() == 'true'
        paper_size = request.form.get('paper_size', 'A4')
        copies = int(request.form.get('copies', 1))
        binding = request.form.get('binding', 'false').lower() == 'true'
        scheduled_time = request.form.get('scheduled_time')

        # Validate file type
        allowed_extensions = {'.pdf', '.docx', '.ppt', '.pptx', '.doc'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            return jsonify({'success': False, 'message': 'Unsupported file type'}), 400

        # Save uploaded file
        filename = secure_filename(file.filename)
        file_id = str(uuid.uuid4())
        file_path = f"uploads/{file_id}_{filename}"
        os.makedirs('uploads', exist_ok=True)
        file.save(file_path)

        # Calculate cost
        total_cost = calculate_cost(pages, is_color, is_duplex, paper_size, binding, copies)

        # Get student using auth context
        student_ref = db.collection('students').document(student_id)
        student_doc = student_ref.get()
        if not student_doc.exists:
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({'success': False, 'message': 'Student not found'}), 404

        student_data = student_doc.to_dict()
        if student_data.get('wallet_balance', 0) < total_cost:
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({'success': False, 'message': 'Insufficient wallet balance'}), 400

        # Create job
        job_id = str(uuid.uuid4())
        pickup_pin = generate_pickup_pin()
        job_data = {
            'id': job_id,
            'student_id': student_id,
            'student_email': student_data['email'],
            'student_name': student_data['username'],
            'file_name': filename,
            'file_path': file_path,
            'pages': pages,
            'is_color': is_color,
            'is_duplex': is_duplex,
            'paper_size': paper_size,
            'copies': copies,
            'binding': binding,
            'total_cost': total_cost,
            'status': 'pending',
            'pickup_pin': pickup_pin,
            'scheduled_time': scheduled_time,
            'created_at': datetime.datetime.now(),
            'updated_at': datetime.datetime.now()
        }

        # Deduct balance + update stats
        new_balance = student_data.get('wallet_balance', 0) - total_cost
        student_ref.update({
            'wallet_balance': new_balance,
            'total_jobs': student_data.get('total_jobs', 0) + 1
        })

        # Save job
        db.collection('jobs').document(job_id).set(job_data)

        # Send email (non-blocking)
        try:
            if student_data.get('email_notifications', True):
                threading.Thread(target=send_email, args=(
                    student_data['email'],
                    'Print Job Submitted',
                    'job_submitted',
                    {
                        'student_name': student_data['username'],
                        'job_id': job_id,
                        'file_name': filename,
                        'pages': pages,
                        'cost': total_cost,
                        'duplex': is_duplex
                    }
                )).start()
        except Exception as e:
            logger.warning(f"Email sending failed: {e}")

        # Generate QR code (optional)
        qr_code = None
        try:
            qr_data = {'job_id': job_id, 'pickup_pin': pickup_pin, 'student_id': student_id}
            qr_code = generate_qr_code(qr_data)
        except Exception as e:
            logger.warning(f"QR code generation failed: {e}")

        return jsonify({
            'success': True,
            'job_id': job_id,
            'pickup_pin': pickup_pin,
            'total_cost': total_cost,
            'new_balance': new_balance,
            'qr_code': qr_code,
            'message': 'Job submitted successfully'
        }), 200

    except Exception as e:
        logger.error(f"Job submission error: {e}")
        return jsonify({'success': False, 'message': 'Failed to submit job'}), 500

@app.route('/api/jobs/<job_id>/approve', methods=['POST'])
@require_auth
def approve_job(job_id):
    """Approve a print job (Admin only)"""
    try:
        # Ensure only admins can approve jobs
        if request.auth['user_type'] != 'admin':
            return jsonify({'success': False, 'message': 'Admin access required'}), 403
        
        data = request.get_json() or {}
        printer_id = data.get('printer_id')
        
        logger.info(f"Admin {request.auth['user_id']} approving job {job_id}")
        
        # Get job details
        job_ref = db.collection('jobs').document(job_id)
        job_doc = job_ref.get()
        
        if not job_doc.exists:
            return jsonify({'success': False, 'message': 'Job not found'}), 404
        
        job_data = job_doc.to_dict()
        
        # Check if job is already approved
        if job_data.get('status') != 'pending':
            return jsonify({'success': False, 'message': f'Job is already {job_data.get("status")}'}), 400
        
        # Auto-assign printer if not provided
        if not printer_id:
            printers_ref = db.collection('printers')
            available_printers = printers_ref.where('status', '==', 'online').limit(1).get()
            
            if not available_printers:
                return jsonify({'success': False, 'message': 'No available printers online'}), 400
            
            printer_doc = available_printers[0]
            printer_id = printer_doc.id
            printer_data = printer_doc.to_dict()
            logger.info(f"Auto-assigned printer {printer_id} to job {job_id}")
        else:
            # Get specified printer details
            printer_ref = db.collection('printers').document(printer_id)
            printer_doc = printer_ref.get()
            
            if not printer_doc.exists:
                return jsonify({'success': False, 'message': 'Specified printer not found'}), 404
            
            printer_data = printer_doc.to_dict()
            
            if printer_data.get('status') != 'online':
                return jsonify({'success': False, 'message': 'Specified printer is not online'}), 400
        
        # Update job status
        update_data = {
            'status': 'approved',
            'printer_id': printer_id,
            'printer_name': printer_data['name'],
            'printer_location': printer_data['location'],
            'approved_at': datetime.datetime.now(),
            'approved_by': request.auth['user_id'],
            'updated_at': datetime.datetime.now()
        }
        
        job_ref.update(update_data)
        
        # Send approval email (non-blocking)
        try:
            email_data = {
                'student_name': job_data['student_name'],
                'job_id': job_id,
                'printer_name': printer_data['name'],
                'printer_location': printer_data['location'],
                'pickup_pin': job_data['pickup_pin']
            }
            
            threading.Thread(target=send_email, args=(
                job_data['student_email'],
                'Job Approved - Ready to Print',
                'job_approved',
                email_data
            )).start()
            
            logger.info(f"Approval email queued for {job_data['student_email']}")
            
        except Exception as e:
            logger.warning(f"Email notification failed for job {job_id}: {e}")
        
        logger.info(f"Job {job_id} approved successfully by admin {request.auth['user_id']}")
        
        return jsonify({
            'success': True, 
            'message': 'Job approved successfully',
            'printer_name': printer_data['name'],
            'printer_location': printer_data['location']
        })
    
    except Exception as e:
        logger.error(f"Job approval error for {job_id}: {e}")
        return jsonify({'success': False, 'message': f'Failed to approve job: {str(e)}'}), 500
    

@app.route('/api/jobs/bulk-approve', methods=['POST'])
@require_auth
def bulk_approve_jobs():
    """Bulk approve multiple jobs (Admin only)"""
    try:
        if request.auth['user_type'] != 'admin':
            return jsonify({'success': False, 'message': 'Admin access required'}), 403
        
        data = request.get_json()
        job_ids = data.get('job_ids', [])
        
        if not job_ids:
            return jsonify({'success': False, 'message': 'No jobs specified'}), 400
        
        logger.info(f"Bulk approving {len(job_ids)} jobs by admin {request.auth['user_id']}")
        
        approved_count = 0
        failed_jobs = []
        
        # Get available printer for all jobs
        printers_ref = db.collection('printers')
        available_printers = printers_ref.where('status', '==', 'online').limit(1).get()
        
        if not available_printers:
            return jsonify({'success': False, 'message': 'No available printers online'}), 400
        
        printer_doc = available_printers[0]
        printer_data = printer_doc.to_dict()
        
        for job_id in job_ids:
            try:
                # Get job
                job_ref = db.collection('jobs').document(job_id)
                job_doc = job_ref.get()
                
                if not job_doc.exists:
                    failed_jobs.append({'id': job_id, 'reason': 'Job not found'})
                    continue
                
                job_data = job_doc.to_dict()
                
                if job_data.get('status') != 'pending':
                    failed_jobs.append({'id': job_id, 'reason': f'Job is {job_data.get("status")}'})
                    continue
                
                # Approve job
                job_ref.update({
                    'status': 'approved',
                    'printer_id': printer_doc.id,
                    'printer_name': printer_data['name'],
                    'printer_location': printer_data['location'],
                    'approved_at': datetime.datetime.now(),
                    'approved_by': request.auth['user_id'],
                    'updated_at': datetime.datetime.now()
                })
                
                approved_count += 1
                
                # Queue email notification
                threading.Thread(target=send_email, args=(
                    job_data['student_email'],
                    'Job Approved - Ready to Print',
                    'job_approved',
                    {
                        'student_name': job_data['student_name'],
                        'job_id': job_id,
                        'printer_name': printer_data['name'],
                        'printer_location': printer_data['location'],
                        'pickup_pin': job_data['pickup_pin']
                    }
                )).start()
                
            except Exception as e:
                logger.error(f"Failed to approve job {job_id}: {e}")
                failed_jobs.append({'id': job_id, 'reason': str(e)})
        
        return jsonify({
            'success': True,
            'message': f'Approved {approved_count} jobs',
            'approved_count': approved_count,
            'failed_jobs': failed_jobs
        })
        
    except Exception as e:
        logger.error(f"Bulk approval error: {e}")
        return jsonify({'success': False, 'message': f'Bulk approval failed: {str(e)}'}), 500

@app.route('/api/jobs/<job_id>/complete', methods=['POST'])
def complete_job(job_id):
    """Mark job as completed"""
    try:
        # Get job details
        job_ref = db.collection('jobs').document(job_id)
        job_doc = job_ref.get()
        
        if not job_doc.exists:
            return jsonify({'success': False, 'message': 'Job not found'}), 404
        
        job_data = job_doc.to_dict()
        
        # Calculate eco points for duplex printing
        eco_points = 0
        if job_data.get('is_duplex'):
            eco_points = job_data.get('pages', 0) * 2  # 2 points per duplex page
        
        # Update job status
        job_ref.update({
            'status': 'completed',
            'completed_at': datetime.datetime.now(),
            'updated_at': datetime.datetime.now()
        })
        
        # Update student statistics
        student_ref = db.collection('students').document(job_data['student_id'])
        student_doc = student_ref.get()
        student_data = student_doc.to_dict()
        
        student_ref.update({
            'total_pages': student_data.get('total_pages', 0) + job_data.get('pages', 0),
            'total_spent': student_data.get('total_spent', 0) + job_data.get('total_cost', 0),
            'eco_points': student_data.get('eco_points', 0) + eco_points
        })
        
        # Send completion email
        threading.Thread(target=send_email, args=(
            job_data['student_email'],
            'Print Job Completed - Ready for Pickup!',
            'job_completed',
            {
                'student_name': job_data['student_name'],
                'job_id': job_id,
                'printer_name': job_data.get('printer_name', 'Unknown'),
                'printer_location': job_data.get('printer_location', 'Unknown'),
                'pickup_pin': job_data['pickup_pin'],
                'eco_points': eco_points
            }
        )).start()
        
        return jsonify({
            'success': True,
            'message': 'Job completed successfully',
            'eco_points_earned': eco_points
        })
    
    except Exception as e:
        logger.error(f"Job completion error: {e}")
        return jsonify({'success': False, 'message': 'Failed to complete job'}), 500

@app.route('/api/jobs/student/<student_id>', methods=['GET'])
@require_auth
def get_student_jobs(student_id):
    """Get all jobs for a student"""
    try:
        jobs_ref = db.collection('jobs')
        jobs_query = jobs_ref.where(filter=FieldFilter('student_id', '==', student_id))
        
        status_filter = request.args.get('status')
        if status_filter and status_filter != 'all':
            jobs_query = jobs_query.where('status', '==', status_filter)
        
        jobs = []
        for doc in jobs_query.get():
            job_data = doc.to_dict()
            job_data['id'] = doc.id
            jobs.append(job_data)
        
        return jsonify({'success': True, 'jobs': jobs})
    
    except Exception as e:
        logger.error(f"Get student jobs error: {e}")@app.route('/api/jobs', methods=['GET'])
        
    
@app.route('/api/jobs', methods=['GET'])
@require_auth
def get_all_jobs():
    """Get all jobs (Admin only)"""
    try:
        # Ensure only admins can access this endpoint
        if request.auth['user_type'] != 'admin':
            return jsonify({'success': False, 'message': 'Admin access required'}), 403
        
        logger.info(f"Admin {request.auth['user_id']} requesting all jobs")
        
        jobs_ref = db.collection('jobs')
        query = jobs_ref.order_by('created_at', direction=firestore.Query.DESCENDING)
        
        # Apply filters
        status_filter = request.args.get('status')
        if status_filter and status_filter != '' and status_filter != 'all':
            query = query.where('status', '==', status_filter)
        
        printer_filter = request.args.get('printer')
        if printer_filter and printer_filter != '' and printer_filter != 'all':
            query = query.where('printer_id', '==', printer_filter)
        
        jobs = []
        job_count = 0
        
        for doc in query.limit(100).get():  # Limit to 100 for performance
            job_data = doc.to_dict()
            job_data['id'] = doc.id
            
            # Convert Firestore timestamps to ISO format
            if 'created_at' in job_data and job_data['created_at']:
                job_data['created_at'] = job_data['created_at'].isoformat() if hasattr(job_data['created_at'], 'isoformat') else str(job_data['created_at'])
            
            if 'updated_at' in job_data and job_data['updated_at']:
                job_data['updated_at'] = job_data['updated_at'].isoformat() if hasattr(job_data['updated_at'], 'isoformat') else str(job_data['updated_at'])
            
            jobs.append(job_data)
            job_count += 1
        
        logger.info(f"Retrieved {job_count} jobs for admin")
        return jsonify({'success': True, 'jobs': jobs, 'count': job_count})
    
    except Exception as e:
        logger.error(f"Get all jobs error: {e}")
        return jsonify({'success': False, 'message': f'Failed to get jobs: {str(e)}'}), 500

        
@app.route('/api/jobs/<job_id>', methods=['GET'])
@require_auth
def get_job(job_id):
    """Get details of a single job (Admin only)"""
    try:
        if request.auth['user_type'] != 'admin':
            return jsonify({'success': False, 'message': 'Admin access required'}), 403

        # Get the Firestore document
        doc = db.collection('jobs').document(job_id).get()
        if not doc.exists:
            return jsonify({'success': False, 'message': 'Job not found'}), 404

        # Always use the Firestore document ID
        job_data = doc.to_dict()
        job_data['id'] = doc.id

        # Convert datetime fields if present
        if 'created_at' in job_data and job_data['created_at']:
            job_data['created_at'] = job_data['created_at'].isoformat() if hasattr(job_data['created_at'], 'isoformat') else str(job_data['created_at'])
        if 'updated_at' in job_data and job_data['updated_at']:
            job_data['updated_at'] = job_data['updated_at'].isoformat() if hasattr(job_data['updated_at'], 'isoformat') else str(job_data['updated_at'])

        return jsonify({'success': True, 'job': job_data}), 200

    except Exception as e:
        logger.error(f"Get job {job_id} error: {e}")
        return jsonify({'success': False, 'message': f'Failed to get job: {str(e)}'}), 500

    
@app.route('/api/debug/jobs-count', methods=['GET'])
def debug_jobs_count():
    """Debug endpoint to check job count"""
    try:
        jobs_ref = db.collection('jobs')
        total_jobs = len(jobs_ref.get())
        
        # Count by status
        statuses = {}
        for doc in jobs_ref.get():
            status = doc.to_dict().get('status', 'unknown')
            statuses[status] = statuses.get(status, 0) + 1
        
        return jsonify({
            'success': True,
            'total_jobs': total_jobs,
            'by_status': statuses,
            'message': 'Debug info retrieved'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Debug failed'
        })

# Add this to your Flask app if you don't have it already

@app.route('/api/jobs/<job_id>/reject', methods=['POST'])
@require_auth
def reject_job(job_id):
    """Reject a print job (Admin only)"""
    try:
        if request.auth['user_type'] != 'admin':
            return jsonify({'success': False, 'message': 'Admin access required'}), 403
        
        data = request.get_json() or {}
        reason = data.get('reason', 'Rejected by admin')
        
        logger.info(f"Admin {request.auth['user_id']} rejecting job {job_id}")
        
        # Get job details
        job_ref = db.collection('jobs').document(job_id)
        job_doc = job_ref.get()
        
        if not job_doc.exists:
            logger.error(f"Job {job_id} not found in database")
            return jsonify({'success': False, 'message': 'Job not found'}), 404
        
        job_data = job_doc.to_dict()
        
        # Check if job can be rejected
        if job_data.get('status') not in ['pending', 'approved']:
            return jsonify({
                'success': False, 
                'message': f'Cannot reject job with status: {job_data.get("status")}'
            }), 400
        
        # Update job status
        update_data = {
            'status': 'rejected',
            'rejected_at': datetime.datetime.now(),
            'rejected_by': request.auth['user_id'],
            'rejection_reason': reason,
            'updated_at': datetime.datetime.now()
        }
        
        job_ref.update(update_data)
        
        # Refund student if payment was processed
        if job_data.get('payment_status') == 'paid':
            try:
                student_ref = db.collection('students').document(job_data['student_id'])
                student_doc = student_ref.get()
                
                if student_doc.exists:
                    student_data = student_doc.to_dict()
                    current_balance = student_data.get('wallet_balance', 0)
                    refund_amount = job_data.get('total_cost', 0)
                    
                    student_ref.update({
                        'wallet_balance': current_balance + refund_amount
                    })
                    
                    logger.info(f"Refunded ${refund_amount} to student {job_data['student_id']}")
            except Exception as e:
                logger.error(f"Failed to process refund for job {job_id}: {e}")
        
        # Send rejection email (non-blocking)
        try:
            email_data = {
                'student_name': job_data.get('student_name', 'Student'),
                'job_id': job_id,
                'file_name': job_data.get('file_name', 'Unknown'),
                'rejection_reason': reason,
                'refund_amount': job_data.get('total_cost', 0) if job_data.get('payment_status') == 'paid' else 0
            }
            
            threading.Thread(target=send_email, args=(
                job_data.get('student_email'),
                'Print Job Rejected',
                'job_rejected',
                email_data
            )).start()
            
        except Exception as e:
            logger.warning(f"Email notification failed for job {job_id}: {e}")
        
        logger.info(f"Job {job_id} rejected successfully by admin {request.auth['user_id']}")
        
        return jsonify({
            'success': True, 
            'message': 'Job rejected successfully',
            'refund_processed': job_data.get('payment_status') == 'paid'
        })
    
    except Exception as e:
        logger.error(f"Job rejection error for {job_id}: {e}")
        return jsonify({'success': False, 'message': f'Failed to reject job: {str(e)}'}), 500

# Debug endpoint to check if job exists
@app.route('/api/debug/job/<job_id>', methods=['GET'])
def debug_job_exists(job_id):
    """Debug endpoint to check if job exists"""
    try:
        job_ref = db.collection('jobs').document(job_id)
        job_doc = job_ref.get()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'exists': job_doc.exists,
            'data': job_doc.to_dict() if job_doc.exists else None
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })
        
@app.route('/api/jobs/<job_id>', methods=['DELETE'])
@require_auth
def delete_job(job_id):
    """Delete a job by ID"""
    try:
        job_ref = db.collection('jobs').document(job_id)
        if not job_ref.get().exists:
            return jsonify({"success": False, "message": "Job not found"}), 404

        job_ref.delete()
        return jsonify({"success": True, "message": "Job deleted successfully"})
    
    except Exception as e:
        logger.error(f"Delete job error: {e}")
        return jsonify({"success": False, "message": "Failed to delete job"}), 500
    

@app.route('/api/jobs/history/<student_id>', methods=['GET'])
@require_auth
def get_job_history(student_id):
    try:
        # Fetch ALL jobs for this student (ignore status for debugging)
        jobs_ref = db.collection('jobs') \
                     .where('student_id', '==', student_id) \
                     .stream()

        jobs = []
        total_pages = 0
        total_cost = 0

        for job in jobs_ref:
            job_data = job.to_dict()
            job_data['id'] = job.id
            jobs.append(job_data)

            total_pages += job_data.get('pages', 0) * job_data.get('copies', 1)
            total_cost += job_data.get('total_cost', 0)

        return jsonify({
            'success': True,
            'jobs': jobs,
            'summary': {
                'total_jobs': len(jobs),
                'total_pages': total_pages,
                'total_cost': total_cost,
                'trees_saved': round(total_pages / 500.0, 2)  # e.g. 500 pages = 1 tree
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500



@app.route('/api/wallet/add', methods=['POST'])
@require_auth
def add_money():
    """Add money to student wallet"""
    try:
        data = request.get_json()
        student_id = data['student_id']
        amount = float(data['amount'])
        payment_method = data.get('payment_method', 'card')
        
        if amount < 5 or amount > 500:
            return jsonify({'success': False, 'message': 'Amount must be between $5 and $500'}), 400
        
        # Get student data
        student_ref = db.collection('students').document(student_id)
        student_doc = student_ref.get()
        
        if not student_doc.exists:
            return jsonify({'success': False, 'message': 'Student not found'}), 404
        
        student_data = student_doc.to_dict()
        
        # Update wallet balance
        new_balance = student_data.get('wallet_balance', 0) + amount
        student_ref.update({'wallet_balance': new_balance})
        
        # Create transaction record
        transaction_data = {
            'id': str(uuid.uuid4()),
            'student_id': student_id,
            'type': 'credit',
            'amount': amount,
            'description': f'Wallet top-up via {payment_method}',
            'created_at': datetime.datetime.now()
        }
        
        db.collection('transactions').document(transaction_data['id']).set(transaction_data)
        
        return jsonify({
            'success': True,
            'new_balance': new_balance,
            'transaction_id': transaction_data['id']
        })
    
    except Exception as e:
        logger.error(f"Add money error: {e}")
        return jsonify({'success': False, 'message': 'Failed to add money'}), 500

@app.route('/api/wallet/transactions/<student_id>', methods=['GET'])
@require_auth
def get_transactions(student_id):
    """Get wallet transactions for a student"""
    try:
        transactions_ref = db.collection('transactions')
        transactions_query = transactions_ref.where('student_id', '==', student_id).order_by('created_at', direction=firestore.Query.DESCENDING)
        
        transactions = []
        for doc in transactions_query.limit(50).get():
            transaction_data = doc.to_dict()
            transaction_data['id'] = doc.id
            transactions.append(transaction_data)
        
        return jsonify({'success': True, 'transactions': transactions})
    
    except Exception as e:
        logger.error(f"Get transactions error: {e}")
        return jsonify({'success': False, 'message': 'Failed to get transactions'}), 500

@app.route('/api/printers', methods=['GET'])
def get_printers():
    """Get all printers"""
    try:
        printers_ref = db.collection('printers')
        printers = []
        
        for doc in printers_ref.get():
            printer_data = doc.to_dict()
            printer_data['id'] = doc.id
            printers.append(printer_data)
        
        return jsonify({'success': True, 'printers': printers})
    
    except Exception as e:
        logger.error(f"Get printers error: {e}")
        return jsonify({'success': False, 'message': 'Failed to get printers'}), 500

@app.route('/api/printers', methods=['POST'])
def add_printer():
    """Add new printer (Admin only)"""
    try:
        data = request.get_json()
        
        printer_data = {
            'id': str(uuid.uuid4()),
            'name': data['name'],
            'location': data['location'],
            'type': data['type'],
            'status': data.get('status', 'online'),
            'paper_level': int(data.get('paper_level', 100)),
            'toner_level': int(data.get('toner_level', 100)),
            'created_at': datetime.datetime.now()
        }
        
        db.collection('printers').document(printer_data['id']).set(printer_data)
        
        return jsonify({'success': True, 'printer_id': printer_data['id']})
    
    except Exception as e:
        logger.error(f"Add printer error: {e}")
        return jsonify({'success': False, 'message': 'Failed to add printer'}), 500
    



@app.route('/api/printers/<printer_id>', methods=['PUT'])
def update_printer(printer_id):
    """Update printer (Admin only)"""
    try:
        data = request.get_json()
        
        update_data = {
            'name': data.get('name'),
            'location': data.get('location'),
            'type': data.get('type'),
            'status': data.get('status'),
            'paper_level': int(data.get('paper_level', 0)),
            'toner_level': int(data.get('toner_level', 0)),
            'updated_at': datetime.datetime.now()
        }
        
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        db.collection('printers').document(printer_id).update(update_data)
        
        return jsonify({'success': True, 'message': 'Printer updated successfully'})
    
    except Exception as e:
        logger.error(f"Update printer error: {e}")
        return jsonify({'success': False, 'message': 'Failed to update printer'}), 500

@app.route('/api/users', methods=['GET'])
def get_users():
    """Get all users (Admin only)"""
    try:
        users = []
        
        # Get students
        students_ref = db.collection('students')
        for doc in students_ref.get():
            student_data = doc.to_dict()
            student_data['id'] = doc.id
            student_data['type'] = 'student'
            # Remove sensitive data
            student_data.pop('password', None)
            users.append(student_data)
        
        # Get admins
        admins_ref = db.collection('admins')
        for doc in admins_ref.get():
            admin_data = doc.to_dict()
            admin_data['id'] = doc.id
            admin_data['type'] = 'admin'
            # Remove sensitive data
            admin_data.pop('password', None)
            users.append(admin_data)
        
        return jsonify({'success': True, 'users': users})
    
    except Exception as e:
        logger.error(f"Get users error: {e}")
        return jsonify({'success': False, 'message': 'Failed to get users'}), 500
    

@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id):
    """Get a single user"""
    try:
        for collection in ['students', 'admins']:
            doc = db.collection(collection).document(user_id).get()
            if doc.exists:
                user_data = doc.to_dict()
                user_data['id'] = doc.id
                user_data['type'] = collection[:-1]  # 'student' or 'admin'
                user_data.pop('password', None)
                return jsonify({'success': True, 'user': user_data})
        return jsonify({'success': False, 'message': 'User not found'}), 404
    except Exception as e:
        logger.error(f"Get user error: {e}")
        return jsonify({'success': False, 'message': 'Failed to get user'}), 500
    
    

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Clear session"""
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out'})



@app.route('/api/users/<user_id>', methods=['PUT'])
def update_user(user_id):
    """Update a user"""
    try:
        data = request.get_json()
        for collection in ['students', 'admins']:
            doc_ref = db.collection(collection).document(user_id)
            if doc_ref.get().exists:
                update_data = {
                    'username': data.get('username'),
                    'email': data.get('email'),
                    'type': data.get('type')
                }
                update_data = {k: v for k, v in update_data.items() if v is not None}
                doc_ref.update(update_data)
                return jsonify({'success': True, 'message': 'User updated successfully'})
        return jsonify({'success': False, 'message': 'User not found'}), 404
    except Exception as e:
        logger.error(f"Update user error: {e}")
        return jsonify({'success': False, 'message': 'Failed to update user'}), 500


@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        today = datetime.datetime.now().date()

        jobs_ref = db.collection('jobs')
        today_jobs = 0
        today_revenue = 0.0
        pending_jobs = 0

        for doc in jobs_ref.get():
            job_data = doc.to_dict()
            job_date = job_data.get('created_at')

            # ✅ Normalize Firestore Timestamp -> datetime
            job_dt = None
            if isinstance(job_date, datetime.datetime):
                job_dt = job_date
            elif hasattr(job_date, "to_datetime"):
                job_dt = job_date.to_datetime()

            # Count today's jobs + revenue
            if job_dt and job_dt.date() == today:
                today_jobs += 1
                today_revenue += float(job_data.get('total_cost', 0))

            # Count pending jobs
            if job_data.get('status') == 'pending':
                pending_jobs += 1

        # Active printers
        printers_ref = db.collection('printers')
        active_printers = sum(
            1 for doc in printers_ref.get()
            if doc.to_dict().get('status') == 'online'
        )

        # Active users = submitted at least 1 job in last 30 days
        thirty_days_ago = datetime.datetime.now() - datetime.timedelta(days=30)
        active_users = set()
        for doc in jobs_ref.where('created_at', '>=', thirty_days_ago).get():
            job_data = doc.to_dict()
            if job_data.get('student_id'):
                active_users.add(job_data['student_id'])

        return jsonify({
            'success': True,
            'stats': {
                'jobs_today': today_jobs,
                'revenue_today': today_revenue,
                'pending_jobs': pending_jobs,
                'active_printers': active_printers,
                'active_users': len(active_users)
            }
        })

    except Exception as e:
        logger.error(f"Get dashboard stats error: {e}")
        return jsonify({'success': False, 'message': 'Failed to get stats'}), 500


@app.route('/api/dashboard/recent-jobs', methods=['GET'])
def get_recent_jobs():
    """Get recent jobs for dashboard"""
    try:
        jobs_ref = db.collection('jobs')
        recent_jobs = []
        
        query = jobs_ref.order_by('created_at', direction=firestore.Query.DESCENDING).limit(10)
        
        for doc in query.get():
            job_data = doc.to_dict()
            job_data['id'] = doc.id
            recent_jobs.append(job_data)
        
        return jsonify({'success': True, 'jobs': recent_jobs})
    
    except Exception as e:
        logger.error(f"Get recent jobs error: {e}")
        return jsonify({'success': False, 'message': 'Failed to get recent jobs'}), 500
    

@app.route('/api/jobs/detail/<job_id>', methods=['GET'])
@require_auth
def get_job_detail(job_id):
    try:
        job_ref = db.collection('jobs').document(job_id).get()
        if not job_ref.exists:
            return jsonify({'success': False, 'message': 'Job not found'}), 404

        job_data = job_ref.to_dict()
        job_data['id'] = job_ref.id
        return jsonify({'success': True, 'job': job_data}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get system settings"""
    try:
        settings_ref = db.collection('settings').document('system')
        settings_doc = settings_ref.get()
        
        if settings_doc.exists:
            settings = settings_doc.to_dict()
        else:
            # Default settings
            settings = {
                'max_file_size': 50,
                'supported_formats': 'PDF, DOCX, PPT, PPTX',
                'auto_delete_hours': 24,
                'pricing': PRICING,
                'email_notifications': {
                    'job_submitted': True,
                    'job_completed': True,
                    'job_failed': True
                },
                'security': {
                    'require_2fa': False,
                    'session_timeout': 60,
                    'max_login_attempts': 5
                }
            }
            # Save default settings
            settings_ref.set(settings)
        
        return jsonify({'success': True, 'settings': settings})
    
    except Exception as e:
        logger.error(f"Get settings error: {e}")
        return jsonify({'success': False, 'message': 'Failed to get settings'}), 500

@app.route('/api/settings', methods=['PUT'])
def update_settings():
    """Update system settings (Admin only)"""
    try:
        data = request.get_json()
        
        settings_ref = db.collection('settings').document('system')
        settings_ref.update(data)
        
        # Update global PRICING if changed
        if 'pricing' in data:
            global PRICING
            PRICING.update(data['pricing'])
        
        return jsonify({'success': True, 'message': 'Settings updated successfully'})
    
    except Exception as e:
        logger.error(f"Update settings error: {e}")
        return jsonify({'success': False, 'message': 'Failed to update settings'}), 500

@app.route('/api/notifications/check-low-balance', methods=['POST'])
def check_low_balance():
    """Check for low wallet balances and send notifications"""
    try:
        data = request.get_json()
        threshold = data.get('threshold', 5.0)
        
        students_ref = db.collection('students')
        low_balance_count = 0
        
        for doc in students_ref.get():
            student_data = doc.to_dict()
            balance = student_data.get('wallet_balance', 0)
            
            if balance < threshold and student_data.get('email_notifications', True):
                # Send low balance notification
                threading.Thread(target=send_email, args=(
                    student_data['email'],
                    'Low Wallet Balance Alert',
                    'low_balance',
                    {
                        'student_name': student_data['username'],
                        'balance': balance,
                        'top_up_link': 'https://printq.campus.edu/wallet'
                    }
                )).start()
                low_balance_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Sent {low_balance_count} low balance notifications'
        })
    
    except Exception as e:
        logger.error(f"Check low balance error: {e}")
        return jsonify({'success': False, 'message': 'Failed to check low balances'}), 500

@app.route('/api/analytics/chart-data', methods=['GET'])
def get_chart_data():
    """Get data for analytics charts"""
    try:
        chart_type = request.args.get('type', 'jobs')
        period = request.args.get('period', '7d')
        
        # Calculate date range
        if period == '7d':
            start_date = datetime.datetime.now() - datetime.timedelta(days=7)
        elif period == '30d':
            start_date = datetime.datetime.now() - datetime.timedelta(days=30)
        elif period == '90d':
            start_date = datetime.datetime.now() - datetime.timedelta(days=90)
        else:
            start_date = datetime.datetime.now() - datetime.timedelta(days=365)
        
        jobs_ref = db.collection('jobs')
        query = jobs_ref.where('created_at', '>=', start_date)
        
        # Process data based on chart type
        data_points = {}
        
        for doc in query.get():
            job_data = doc.to_dict()
            job_date = job_data.get('created_at').strftime('%Y-%m-%d')
            
            if job_date not in data_points:
                data_points[job_date] = {'jobs': 0, 'revenue': 0, 'pages': 0}
            
            data_points[job_date]['jobs'] += 1
            data_points[job_date]['revenue'] += job_data.get('total_cost', 0)
            data_points[job_date]['pages'] += job_data.get('pages', 0)
        
        # Format for chart
        chart_data = {
            'labels': list(data_points.keys()),
            'data': [data_points[date][chart_type] for date in data_points.keys()]
        }
        
        return jsonify({'success': True, 'chart_data': chart_data})
    
    except Exception as e:
        logger.error(f"Get chart data error: {e}")
        return jsonify({'success': False, 'message': 'Failed to get chart data'}), 500

@app.route('/api/reports/daily', methods=['GET'])
@require_auth
def daily_summary():
    """Daily summary report"""
    try:
        today = datetime.datetime.now().date()
        jobs_ref = db.collection('jobs')
        jobs_today, revenue_today = 0, 0.0
        printer_usage = {}

        for doc in jobs_ref.get():
            job = doc.to_dict()
            dt = normalize_timestamp(job.get('created_at'))
            if dt and dt.date() == today:
                jobs_today += 1
                revenue_today += float(job.get('total_cost', 0))
                printer = job.get('printer_name', 'Unknown')
                printer_usage[printer] = printer_usage.get(printer, 0) + 1

        return jsonify({
            "success": True,
            "report": {
                "date": str(today),
                "jobs": jobs_today,
                "revenue": revenue_today,
                "top_printers": printer_usage
            }
        })
    except Exception as e:
        logger.error(f"Daily report error: {e}")
        return jsonify({"success": False, "message": "Failed to get daily report"}), 500


@app.route('/api/reports/weekly')
@require_auth
def report_weekly():
    try:
        now = datetime.datetime.now()
        start_date = now - datetime.timedelta(days=7)

        jobs_ref = db.collection('jobs')
        jobs = jobs_ref.where("created_at", ">=", start_date).stream()

        daily_stats = {}
        for job in jobs:
            j = job.to_dict()
            created_at = j.get("created_at")
            if hasattr(created_at, "to_datetime"):  # Firestore timestamp
                created_at = created_at.to_datetime()
            if not created_at:
                continue

            date_key = created_at.strftime("%Y-%m-%d")
            if date_key not in daily_stats:
                daily_stats[date_key] = {"jobs": 0, "revenue": 0.0}

            daily_stats[date_key]["jobs"] += 1
            daily_stats[date_key]["revenue"] += j.get("total_cost", 0.0)

        report = [
            {"date": d, "jobs": stats["jobs"], "revenue": round(stats["revenue"], 2)}
            for d, stats in sorted(daily_stats.items())
        ]

        # If no data, return a default row
        if not report:
            report = [{"date": "No Data", "jobs": 0, "revenue": 0.0}]

        return jsonify({"success": True, "report": report})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/reports/monthly')
@require_auth
def report_monthly():
    try:
        now = datetime.datetime.now()
        start_date = now.replace(day=1)  # first day of the month

        jobs_ref = db.collection('jobs')
        jobs = jobs_ref.where("created_at", ">=", start_date).stream()

        weekly_stats = {}
        for job in jobs:
            j = job.to_dict()
            created_at = j.get("created_at")
            if hasattr(created_at, "to_datetime"):
                created_at = created_at.to_datetime()
            if not created_at:
                continue

            week_number = created_at.isocalendar()[1]
            if week_number not in weekly_stats:
                weekly_stats[week_number] = {"jobs": 0, "revenue": 0.0}

            weekly_stats[week_number]["jobs"] += 1
            weekly_stats[week_number]["revenue"] += j.get("total_cost", 0.0)

        report = [
            {"week": f"Week {w}", "jobs": stats["jobs"], "revenue": round(stats["revenue"], 2)}
            for w, stats in sorted(weekly_stats.items())
        ]

        # If no data, return a default row
        if not report:
            report = [{"week": "No Data", "jobs": 0, "revenue": 0.0}]

        return jsonify({"success": True, "report": report})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/reports/eco', methods=['GET'])
@require_auth
def eco_report():
    """Eco-friendly report"""
    try:
        duplex_pages, single_pages = 0, 0
        color_pages, bw_pages = 0, 0

        for doc in db.collection('jobs').get():
            job = doc.to_dict()
            pages = int(job.get("pages", 0))
            if job.get("duplex"):
                duplex_pages += pages
            else:
                single_pages += pages
            if job.get("color"):
                color_pages += pages
            else:
                bw_pages += pages

        return jsonify({
            "success": True,
            "report": {
                "duplex_pages": duplex_pages,
                "single_pages": single_pages,
                "color_pages": color_pages,
                "bw_pages": bw_pages
            }
        })
    except Exception as e:
        logger.error(f"Eco report error: {e}")
        return jsonify({"success": False, "message": "Failed to get eco report"}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'message': 'PrintQ Backend is running',
        'timestamp': datetime.datetime.now().isoformat()
    })

# Background tasks
def cleanup_old_jobs():
    """Clean up old completed jobs"""
    try:
        cutoff_date = datetime.datetime.now() - datetime.timedelta(days=30)
        jobs_ref = db.collection('jobs')
        
        old_jobs = jobs_ref.where(filter=FieldFilter('status', '==', 'completed')) \
                   .where(filter=FieldFilter('completed_at', '<', cutoff_date))
        
        for doc in old_jobs.get():
            doc.reference.delete()
            
        logger.info("Old jobs cleanup completed")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
 
def monitor_printer_status():
    """Monitor printer status and send alerts"""
    try:
        printers_ref = db.collection('printers')
        
        for doc in printers_ref.get():
            printer_data = doc.to_dict()
            
            # Check for low paper/toner
            if printer_data.get('paper_level', 100) < 20 or printer_data.get('toner_level', 100) < 20:
                # Log alert (in real implementation, you'd send notifications to admins)
                logger.warning(f"Printer {printer_data['name']} needs attention: "
                             f"Paper: {printer_data.get('paper_level')}%, "
                             f"Toner: {printer_data.get('toner_level')}%")
                
    except Exception as e:
        logger.error(f"Printer monitoring error: {e}")
        

@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        updates = {
            'email_notifications': data.get('email_notifications', True),
            'eco_tips': data.get('eco_tips', True),
            'auto_duplex': data.get('auto_duplex', True)
        }

        student_ref = db.collection('students').document(student_id)
        student_ref.update(updates)

        return jsonify({'success': True, 'message': 'Profile updated successfully'})
    except Exception as e:
        logger.error(f"Profile update error: {e}")
        return jsonify({'success': False, 'message': 'Failed to update profile'}), 500


# Schedule background tasks
def run_background_tasks():
    """Run background tasks periodically"""
    while True:
        try:
            cleanup_old_jobs()
            monitor_printer_status()
            time.sleep(3600)  # Run every hour
        except Exception as e:
            logger.error(f"Background task error: {e}")
            time.sleep(60)  # Wait a minute before 
            
@app.route('/debug/jobs')
def debug_jobs():
    jobs = db.collection('jobs').limit(10).stream()
    return jsonify([job.to_dict() for job in jobs])

            

# Start background tasks
threading.Thread(target=run_background_tasks, daemon=True).start()

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'message': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'message': 'Internal server error'}), 500

@app.errorhandler(413)
def file_too_large(error):
    return jsonify({'success': False, 'message': 'File too large. Maximum size is 50MB'}), 413

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting PrintQ Backend on port {port}")
    logger.info(f"Debug mode: {debug}")
    
    app.run(host='0.0.0.0', port=port, debug=debug)