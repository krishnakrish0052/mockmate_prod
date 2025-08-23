// Pre-designed email themes for HTML editor
export interface EmailTheme {
  id: string;
  name: string;
  description: string;
  preview: string;
  html: string;
}

export const emailThemes: EmailTheme[] = [
  {
    id: 'modern',
    name: 'Modern Dark',
    description: 'CLI-themed dark design with terminal aesthetics',
    preview: '/themes/modern-preview.jpg',
    html: `<!DOCTYPE html>
<html lang="en" style="background-color: #0a0a0a;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{SUBJECT}}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', 'JetBrains Mono', monospace; background-color: #0a0a0a; color: #ffffff; line-height: 1.6; }
        .email-container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0a0a0a, #1a1a1a); border: 1px solid #333333; border-radius: 8px; box-shadow: 0 0 20px rgba(255, 215, 0, 0.1); }
        .cli-header { background: linear-gradient(90deg, #1a1a1a, #333333); border-bottom: 1px solid #ffbf00; border-radius: 8px 8px 0 0; padding: 20px; }
        .terminal-title { font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #ffd700; }
        .cli-path { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #00ff00; opacity: 0.8; }
        .email-content { padding: 30px 25px; }
        .terminal-prompt { font-family: 'JetBrains Mono', monospace; color: #00ff00; font-weight: 700; margin-right: 8px; }
        .terminal-prompt::before { content: '$ '; }
        .cli-text { font-family: 'JetBrains Mono', monospace; color: #ffffff; line-height: 1.4; }
        .cli-button { display: inline-block; background: linear-gradient(135deg, #ffd700, #ffbf00); color: #0a0a0a; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px; box-shadow: 0 0 10px rgba(255, 215, 0, 0.3); }
        .cli-success-box { background: rgba(0, 255, 0, 0.05); border-left: 4px solid #00ff00; padding: 15px 20px; margin: 20px 0; border-radius: 0 6px 6px 0; }
        .cli-highlight { color: #ffd700; font-weight: 600; }
        .cli-footer { background: #1a1a1a; border-top: 1px solid #333333; border-radius: 0 0 8px 8px; padding: 20px 25px; font-size: 12px; color: #666666; text-align: center; }
        .cli-logo { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #ffd700; }
        @media only screen and (max-width: 600px) { .email-container { margin: 10px; } .email-content { padding: 20px 15px; } }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="cli-header">
            <div class="terminal-title">MockMate Terminal</div>
            <div class="cli-path">~/mockmate/campaign</div>
        </div>
        
        <div class="email-content">
            <div class="cli-success-box">
                <div class="cli-text">
                    <span class="terminal-prompt"></span><strong>{{TITLE}}</strong>
                </div>
            </div>
            
            <div class="cli-text" style="margin: 20px 0;">
                <span class="terminal-prompt"></span>Hello <span class="cli-highlight">{{USER_NAME}}</span>,
            </div>
            
            <p style="margin: 20px 0;">{{CONTENT}}</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{{CTA_LINK}}" class="cli-button">{{CTA_TEXT}}</a>
            </div>
        </div>
        
        <div class="cli-footer">
            <div class="cli-logo">MockMate</div>
            <p>AI-Powered Interview Platform</p>
        </div>
    </div>
</body>
</html>`,
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Clean, corporate design perfect for business communications',
    preview: '/themes/professional-preview.jpg',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{SUBJECT}}</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; color: #333333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 28px; font-weight: 600; margin: 0; }
        .content { padding: 40px 30px; }
        .content h2 { color: #2563eb; margin-bottom: 20px; font-size: 24px; }
        .content p { margin-bottom: 15px; }
        .button { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
        .highlight { background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
        @media only screen and (max-width: 600px) { .container { margin: 10px; } .content { padding: 20px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{TITLE}}</h1>
        </div>
        
        <div class="content">
            <h2>Hello {{USER_NAME}},</h2>
            <p>{{CONTENT}}</p>
            
            <div class="highlight">
                <strong>Important:</strong> {{HIGHLIGHT_TEXT}}
            </div>
            
            <div style="text-align: center;">
                <a href="{{CTA_LINK}}" class="button">{{CTA_TEXT}}</a>
            </div>
        </div>
        
        <div class="footer">
            <p>© 2024 MockMate - AI-Powered Interview Platform</p>
            <p>Need help? Contact us at support@mockmate.com</p>
        </div>
    </div>
</body>
</html>`,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Simple, clean design with focus on content',
    preview: '/themes/minimal-preview.jpg',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{SUBJECT}}</title>
    <style>
        body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #ffffff; color: #333333; line-height: 1.6; }
        .container { max-width: 560px; margin: 0 auto; }
        .header { border-bottom: 2px solid #f0f0f0; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: 700; color: #1a1a1a; }
        .content h1 { color: #1a1a1a; font-size: 28px; font-weight: 600; margin-bottom: 20px; }
        .content p { margin-bottom: 15px; color: #4a4a4a; }
        .button { display: inline-block; background-color: #000000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 500; margin: 20px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #f0f0f0; font-size: 14px; color: #888888; text-align: center; }
        .divider { height: 1px; background-color: #f0f0f0; margin: 30px 0; }
        @media only screen and (max-width: 600px) { body { padding: 10px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">MockMate</div>
        </div>
        
        <div class="content">
            <h1>{{TITLE}}</h1>
            <p>Hi {{USER_NAME}},</p>
            <p>{{CONTENT}}</p>
            
            <div style="text-align: center;">
                <a href="{{CTA_LINK}}" class="button">{{CTA_TEXT}}</a>
            </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="footer">
            <p>MockMate - AI-Powered Interview Platform</p>
            <p>This email was sent to {{USER_EMAIL}}</p>
        </div>
    </div>
</body>
</html>`,
  },
  {
    id: 'colorful',
    name: 'Colorful',
    description: 'Vibrant design with gradients and modern styling',
    preview: '/themes/colorful-preview.jpg',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{SUBJECT}}</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #333333; line-height: 1.6; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 50%, #feca57 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 32px; font-weight: 700; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .content { padding: 40px 30px; }
        .content h2 { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 20px; font-size: 24px; }
        .content p { margin-bottom: 15px; }
        .button { display: inline-block; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; margin: 20px 0; box-shadow: 0 4px 15px rgba(255,107,107,0.3); }
        .highlight-box { background: linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%); padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #27ae60; }
        .footer { background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); padding: 30px; text-align: center; color: #ecf0f1; font-size: 14px; }
        @media only screen and (max-width: 600px) { .container { margin: 10px; } .content { padding: 20px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{TITLE}}</h1>
        </div>
        
        <div class="content">
            <h2>Hello {{USER_NAME}}! 👋</h2>
            <p>{{CONTENT}}</p>
            
            <div class="highlight-box">
                <strong>🎯 Key Point:</strong> {{HIGHLIGHT_TEXT}}
            </div>
            
            <div style="text-align: center;">
                <a href="{{CTA_LINK}}" class="button">{{CTA_TEXT}} ✨</a>
            </div>
        </div>
        
        <div class="footer">
            <p>🚀 MockMate - AI-Powered Interview Platform</p>
            <p>Making interviews better, one conversation at a time</p>
        </div>
    </div>
</body>
</html>`,
  },
];

// Default variables that can be used in templates
export const defaultVariables = {
  SUBJECT: 'Your Subject Here',
  TITLE: 'Email Title',
  USER_NAME: 'User',
  USER_EMAIL: 'user@example.com',
  CONTENT:
    'Your email content goes here. You can write multiple paragraphs to explain your message.',
  HIGHLIGHT_TEXT: 'This is important information that stands out.',
  CTA_TEXT: 'Take Action',
  CTA_LINK: '#',
};
