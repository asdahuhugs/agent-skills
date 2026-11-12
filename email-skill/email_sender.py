#!/usr/bin/env python3
"""
SMTP sending for email-skill (used by mail.py)
"""

import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formataddr, formatdate, make_msgid
from typing import Optional, List
import json

class EmailSender:
    def __init__(self, config_path: str = None):
        """Initialize email sender with configuration"""
        if not config_path:
            # Fall back to the config shipped with the skill, then the CWD.
            for candidate in (
                os.path.join(os.path.dirname(os.path.abspath(__file__)), 'email_config.json'),
                os.path.join(os.getcwd(), 'email_config.json'),
            ):
                if os.path.exists(candidate):
                    config_path = candidate
                    break
        self.config = self.load_config(config_path)
        
    def load_config(self, config_path: str = None) -> dict:
        """Load email configuration from file or environment variables"""
        config = {}
        
        # Try to load from config file
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
            except Exception as e:
                print(f"Error loading config file: {e}")
        
        # Fall back to environment variables
        # Only override the file config when the variable is actually set,
        # otherwise the built-in defaults would silently defeat the config file.
        env_config = {}
        if os.getenv('SMTP_SERVER'):
            env_config['smtp_server'] = os.getenv('SMTP_SERVER')
        if os.getenv('SMTP_PORT'):
            env_config['smtp_port'] = int(os.getenv('SMTP_PORT'))
        if os.getenv('EMAIL_USERNAME'):
            env_config['username'] = os.getenv('EMAIL_USERNAME')
        if os.getenv('EMAIL_PASSWORD'):
            env_config['password'] = os.getenv('EMAIL_PASSWORD')
        if os.getenv('EMAIL_SENDER_NAME'):
            env_config['sender_name'] = os.getenv('EMAIL_SENDER_NAME')
        if os.getenv('EMAIL_USE_TLS') is not None:
            env_config['use_tls'] = os.getenv('EMAIL_USE_TLS').lower() == 'true'
        if os.getenv('EMAIL_USE_SSL') is not None:
            env_config['use_ssl'] = os.getenv('EMAIL_USE_SSL').lower() == 'true'
        
        # Merge configs (environment variables override file config)
        for key, value in env_config.items():
            if value is not None:
                config[key] = value
        
        return config
    
    def validate_config(self) -> bool:
        """Validate that required configuration is present"""
        required = ['smtp_server', 'smtp_port', 'username', 'password']
        for key in required:
            if key not in self.config or not self.config[key]:
                print(f"Missing required configuration: {key}")
                return False
        return True
    
    def connect(self):
        """Open an authenticated SMTP connection (reused for batch sending)."""
        context = ssl.create_default_context()
        port = int(self.config['smtp_port'])
        if self.config.get('use_ssl', False):
            server = smtplib.SMTP_SSL(
                self.config['smtp_server'], port, context=context, timeout=60)
        else:
            server = smtplib.SMTP(self.config['smtp_server'], port, timeout=60)
            if self.config.get('use_tls', True):
                server.starttls(context=context)
        server.login(self.config['username'], self.config['password'])
        return server
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        attachments: List[str] = None,
        cc: List[str] = None,
        bcc: List[str] = None,
        html_body: str = None,
        server=None
    ) -> dict:
        """
        Send an email with optional attachments
        
        Args:
            to_email: Recipient email address(es) - can be string or list
            subject: Email subject
            body: Plain text email body
            attachments: List of file paths to attach
            cc: List of CC email addresses
            bcc: List of BCC email addresses
            html_body: HTML version of email body (optional)
            server: An already authenticated SMTP connection to reuse (batch sending).
                    When None, a connection is opened and closed for this message.
            
        Returns:
            Dictionary with success status and message
        """
        if not self.validate_config():
            return {"success": False, "error": "Invalid email configuration"}

        missing = [p for p in (attachments or []) if not os.path.isfile(p)]
        if missing:
            return {"success": False, "error": "Attachment not found: " + ", ".join(missing),
                    "subject": subject}

        try:
            # mixed (attachments) wrapping alternative (plain + html)
            msg = MIMEMultipart('mixed')
            msg['Date'] = formatdate(localtime=True)
            msg['Message-ID'] = make_msgid(domain=self.config['username'].rpartition('@')[2] or None)
            sender_name = (self.config.get('sender_name') or '').strip()
            msg['From'] = (
                formataddr((sender_name, self.config['username']))
                if sender_name else self.config['username']
            )
            msg['To'] = to_email if isinstance(to_email, str) else ', '.join(to_email)
            msg['Subject'] = subject
            
            if cc:
                msg['Cc'] = ', '.join(cc)
            
            # Add recipients for BCC
            all_recipients = []
            if isinstance(to_email, str):
                all_recipients.append(to_email)
            else:
                all_recipients.extend(to_email)
            
            if cc:
                all_recipients.extend(cc)
            if bcc:
                all_recipients.extend(bcc)
            
            alt = MIMEMultipart('alternative')
            alt.attach(MIMEText(body, 'plain', 'utf-8'))
            if html_body:
                alt.attach(MIMEText(html_body, 'html', 'utf-8'))
            msg.attach(alt)

            for attachment_path in attachments or []:
                self._add_attachment(msg, attachment_path)
            
            # Connect to SMTP server, or reuse an existing connection
            owns_server = server is None
            if owns_server:
                server = self.connect()
            try:
                server.send_message(msg, from_addr=self.config['username'], to_addrs=all_recipients)
            finally:
                if owns_server:
                    server.quit()
            
            return {
                "success": True,
                "message": f"Email sent successfully to {to_email}",
                "subject": subject,
                "attachments": len(attachments) if attachments else 0
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "subject": subject
            }
    
    def _add_attachment(self, msg: MIMEMultipart, filepath: str):
        """Add a file attachment to the email"""
        filename = os.path.basename(filepath)
        
        with open(filepath, 'rb') as f:
            part = MIMEBase('application', 'octet-stream')
            part.set_payload(f.read())
        
        encoders.encode_base64(part)
        # keyword form RFC 2231-encodes non-ASCII (Chinese) filenames
        part.add_header('Content-Disposition', 'attachment', filename=filename)
        msg.attach(part)
