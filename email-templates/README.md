# MockMate Email Templates

A comprehensive collection of email templates designed with a terminal/CLI theme consistent with the MockMate AI-powered interview platform branding.

## 🎨 Design Theme

All templates feature a **dark terminal aesthetic** with:
- **Colors**: Dark backgrounds (#0a0a0a), terminal green (#00ff00), golden yellow (#ffd700), cyan (#00ffff)
- **Fonts**: JetBrains Mono, Fira Code, Inter for a developer-friendly look
- **Elements**: Terminal windows, command prompts, CLI-style buttons and boxes
- **Animations**: Subtle terminal-style effects like scanning lines and cursor blinks

## 📁 Template Collection

### 1. **Base Template** (`base-template.html`)
The foundational template structure that all other templates extend from.
- Terminal window header with traffic light dots
- CLI-style content blocks and buttons
- Responsive design for mobile and desktop
- Consistent footer with branding

### 2. **Welcome/Onboarding** (`welcome-onboarding.html`)
For new user registration and platform introduction.

**Variables:**
- `{{USER_NAME}}` - User's display name
- `{{USER_EMAIL}}` - User's email address
- `{{LOGIN_URL}}` - Platform login link

**Features:**
- ASCII art welcome banner
- Step-by-step onboarding guide
- Platform features overview
- CLI-style command examples

### 3. **Interview Invitation** (`interview-invitation.html`)
For inviting candidates to interviews with detailed information.

**Variables:**
- `{{CANDIDATE_NAME}}` - Candidate's name
- `{{COMPANY_NAME}}` - Hiring company
- `{{POSITION}}` - Job position title
- `{{INTERVIEW_DATE}}` - Interview date
- `{{INTERVIEW_TIME}}` - Interview time
- `{{TIMEZONE}}` - Time zone
- `{{DURATION}}` - Interview duration
- `{{INTERVIEW_TYPE}}` - Format (video, phone, etc.)
- `{{INTERVIEWER_NAME}}` - Interviewer's name
- `{{INTERVIEWER_TITLE}}` - Interviewer's position
- `{{MEETING_LINK}}` - Video conference link
- `{{CONFIRM_URL}}` - Confirmation link
- `{{RESCHEDULE_URL}}` - Reschedule link
- `{{PRACTICE_URL}}` - Practice interview link

**Features:**
- Detailed interview information table
- Pre-interview checklist with checkboxes
- Meeting preparation tips
- Action buttons for confirmation/rescheduling

### 4. **Interview Reminder** (`interview-reminder.html`)
For reminding users about upcoming interviews with countdown timers.

**Variables:**
- `{{CANDIDATE_NAME}}` - Candidate's name
- `{{COMPANY_NAME}}` - Hiring company
- `{{POSITION}}` - Job position
- `{{HOURS_UNTIL}}` - Hours until interview
- `{{MINUTES_UNTIL}}` - Minutes until interview
- `{{IS_URGENT}}` - Boolean for urgent styling (< 2 hours)
- `{{INTERVIEW_DATE}}` - Interview date
- `{{INTERVIEW_TIME}}` - Interview time
- `{{TIMEZONE}}` - Time zone
- `{{MEETING_LINK}}` - Video conference link
- `{{PRACTICE_URL}}` - Last-minute practice link

**Features:**
- Dynamic countdown display
- Urgent styling for imminent interviews
- Last-minute preparation checklist
- Quick action buttons

### 5. **Interview Completion** (`interview-completion.html`)
For post-interview feedback and next steps communication.

**Variables:**
- `{{CANDIDATE_NAME}}` - Candidate's name
- `{{COMPANY_NAME}}` - Hiring company
- `{{INTERVIEW_DURATION}}` - Interview length
- `{{HAS_SCORE}}` - Boolean for score display
- `{{INTERVIEW_SCORE}}` - Numerical score (if available)
- `{{TECHNICAL_FEEDBACK}}` - Technical skills feedback
- `{{COMMUNICATION_FEEDBACK}}` - Communication feedback
- `{{PROBLEM_SOLVING_FEEDBACK}}` - Problem-solving feedback
- `{{IMPROVEMENT_AREAS}}` - Areas for improvement
- `{{QUESTIONS_ANSWERED}}` - Number of questions answered
- `{{AVG_RESPONSE_TIME}}` - Average response time
- `{{CONFIDENCE_LEVEL}}` - Confidence rating
- `{{DETAILED_REPORT_URL}}` - Full report link
- `{{PRACTICE_MORE_URL}}` - Practice platform link

**Features:**
- AI-generated feedback sections
- Performance scoring display
- Interview statistics
- Next steps timeline
- Action buttons for detailed reports

### 6. **Password Reset** (`password-reset.html`)
For secure password reset requests with security information.

**Variables:**
- `{{USER_NAME}}` - User's name
- `{{USER_EMAIL}}` - User's email
- `{{RESET_URL}}` - Password reset link
- `{{EXPIRY_HOURS}}` - Link expiration time
- `{{REQUEST_IP}}` - Request IP address
- `{{REQUEST_LOCATION}}` - Geographic location
- `{{REQUEST_TIMESTAMP}}` - Request time
- `{{REQUEST_USER_AGENT}}` - Browser/device info
- `{{SECURITY_CONTACT_URL}}` - Security team contact

**Features:**
- Security-focused design with lock icons
- Request details for verification
- Password security tips
- Expiration countdown
- Security warning sections

### 7. **Account Verification** (`account-verification.html`)
For email address verification during registration.

**Variables:**
- `{{USER_NAME}}` - User's name
- `{{USER_EMAIL}}` - User's email
- `{{VERIFICATION_CODE}}` - Alphanumeric code
- `{{VERIFICATION_URL}}` - Verification link
- `{{EXPIRY_HOURS}}` - Code expiration time

**Features:**
- Large verification code display
- One-click verification button
- Benefits of verification
- Clean, focused design

### 8. **System Notifications** (`system-notification.html`)
For platform status, maintenance, and system alerts.

**Variables:**
- `{{NOTIFICATION_TYPE}}` - Alert type (maintenance, outage, etc.)
- `{{SYSTEM_STATUS}}` - Current status
- `{{STATUS_COLOR}}` - Color for status indicators
- `{{STATUS_CLASS}}` - CSS class for status
- `{{NOTIFICATION_CLASS}}` - CSS class for notification type
- `{{NOTIFICATION_TITLE}}` - Alert title
- `{{NOTIFICATION_MESSAGE}}` - Alert message
- `{{TIMESTAMP}}` - Alert timestamp
- `{{HAS_DETAILS}}` - Boolean for technical details
- `{{DETAILS}}` - Array of technical details
- `{{HAS_IMPACT}}` - Boolean for impact information
- `{{IMPACT_DESCRIPTION}}` - Impact description
- `{{AFFECTED_SERVICES}}` - Affected services list
- `{{EXPECTED_DURATION}}` - Expected resolution time
- `{{WORKAROUND_STATUS}}` - Workaround availability
- `{{IS_SCHEDULED}}` - Boolean for scheduled maintenance
- `{{START_TIME}}` - Maintenance start time
- `{{END_TIME}}` - Maintenance end time
- `{{MAINTENANCE_TYPE}}` - Type of maintenance

**Features:**
- Status indicators with colors
- Technical details sections
- Impact assessments
- Scheduled maintenance information
- Dynamic styling based on alert type

### 9. **Feedback Request** (`feedback-request.html`)
For collecting user feedback and ratings.

**Variables:**
- `{{USER_NAME}}` - User's name
- `{{USER_EMAIL}}` - User's email
- `{{SESSION_ID}}` - Session identifier
- `{{ACTIVITY_TYPE}}` - Type of activity (interview, practice, etc.)
- `{{FEEDBACK_URL}}` - Base feedback form URL
- `{{DETAILED_FEEDBACK_URL}}` - Detailed feedback form
- `{{QUICK_SURVEY_URL}}` - Quick survey link

**Features:**
- Interactive rating buttons (1-5 stars)
- Multiple feedback categories
- Quick and detailed feedback options
- Suggestion prompts

### 10. **Billing & Subscription** (`billing-subscription.html`)
For all billing-related communications including invoices, payment confirmations, and subscription management.

**Variables:**
- `{{BILLING_TYPE}}` - Type of billing communication
- `{{BILLING_TITLE}}` - Email title
- `{{USER_NAME}}` - User's name
- `{{PLAN_NAME}}` - Subscription plan name
- `{{AMOUNT}}` - Transaction amount
- `{{NEXT_BILLING_DATE}}` - Next billing date
- `{{IS_PAYMENT_SUCCESS}}` - Boolean for successful payments
- `{{IS_PAYMENT_FAILED}}` - Boolean for failed payments
- `{{IS_EXPIRING_SOON}}` - Boolean for expiring subscriptions
- `{{FAILURE_REASON}}` - Payment failure reason
- `{{EXPIRY_DATE}}` - Subscription expiry date
- `{{DAYS_REMAINING}}` - Days until expiry
- `{{HAS_INVOICE}}` - Boolean for invoice display
- `{{INVOICE_NUMBER}}` - Invoice number
- `{{BILLING_PERIOD}}` - Billing period
- `{{PLAN_AMOUNT}}` - Plan cost
- `{{HAS_DISCOUNT}}` - Boolean for discounts
- `{{DISCOUNT_CODE}}` - Discount code
- `{{DISCOUNT_AMOUNT}}` - Discount amount
- `{{HAS_TAX}}` - Boolean for tax
- `{{TAX_AMOUNT}}` - Tax amount
- `{{TOTAL_AMOUNT}}` - Total amount
- `{{PAYMENT_METHOD}}` - Payment method
- `{{TRANSACTION_ID}}` - Transaction ID
- `{{SHOW_FEATURES}}` - Boolean for plan features
- `{{PLAN_FEATURES}}` - Array of plan features
- `{{UPDATE_PAYMENT_URL}}` - Update payment method
- `{{RENEW_URL}}` - Subscription renewal
- `{{DOWNLOAD_INVOICE_URL}}` - Invoice download
- `{{MANAGE_BILLING_URL}}` - Billing management

**Features:**
- Multiple billing scenarios in one template
- Invoice tables with line items
- Plan feature comparisons
- Payment method management
- Action buttons for different scenarios

## 🚀 Usage Instructions

### Template Integration
1. **Choose the appropriate template** for your use case
2. **Replace template variables** with actual data using your templating engine
3. **Test email rendering** across different email clients
4. **Customize styling** if needed while maintaining the terminal theme

### Variable Replacement
Templates use Mustache-style syntax (`{{VARIABLE_NAME}}`). Replace with your templating system:

```javascript
// Example with JavaScript
const template = fs.readFileSync('welcome-onboarding.html', 'utf8');
const rendered = template.replace(/\{\{USER_NAME\}\}/g, user.name)
                        .replace(/\{\{USER_EMAIL\}\}/g, user.email)
                        .replace(/\{\{LOGIN_URL\}\}/g, loginUrl);
```

### Conditional Sections
Some templates include conditional blocks using Mustache syntax:
- `{{#VARIABLE}}...{{/VARIABLE}}` - Show if variable is truthy
- `{{^VARIABLE}}...{{/VARIABLE}}` - Show if variable is falsy
- `{{#ARRAY}}{{.}}{{/ARRAY}}` - Loop through array

### Responsive Design
All templates are mobile-responsive with:
- Flexible layouts that adapt to screen size
- Readable fonts on all devices
- Touch-friendly buttons and links
- Optimized spacing for mobile

### Email Client Compatibility
Templates are tested and optimized for:
- Gmail (Web, Mobile, Desktop)
- Outlook (2016+, Web, Mobile)
- Apple Mail (macOS, iOS)
- Yahoo Mail
- ProtonMail
- Thunderbird

## 🎯 Brand Consistency

### Color Palette
- **Primary Background**: `#0a0a0a` (Deep Black)
- **Secondary Background**: `#1a1a1a` (Dark Gray)
- **Borders**: `#333333` (Medium Gray)
- **Terminal Green**: `#00ff00` (Bright Green)
- **Golden Yellow**: `#ffd700` (Gold)
- **Amber**: `#ffbf00` (Bright Amber)
- **Cyan**: `#00ffff` (Bright Cyan)
- **Error Red**: `#ff4444` (Bright Red)
- **Text**: `#ffffff` (White)
- **Muted Text**: `#cccccc` (Light Gray)

### Typography
- **Primary Font**: Inter (Sans-serif)
- **Monospace Font**: JetBrains Mono, Fira Code
- **Fallback**: Consolas, Monaco, monospace

### Design Elements
- Terminal window headers with traffic light dots
- Command prompt indicators (`$ `)
- CLI-style command blocks with `>` prefix
- Rounded corners (4-8px radius)
- Subtle box shadows with golden glow
- Scanline effects on headers
- ASCII art decorations

## 🛠 Customization

### Adding New Templates
1. **Copy base structure** from `base-template.html`
2. **Update the CLI path** in the header (`~/mockmate/your-template-name`)
3. **Add specific content** while maintaining the terminal theme
4. **Include appropriate variable placeholders**
5. **Test responsive design**
6. **Document variables** in this README

### Modifying Existing Templates
- **Preserve the core terminal aesthetic**
- **Maintain responsive breakpoints**
- **Keep accessibility standards** (alt text, semantic HTML)
- **Test across email clients** after changes

### Brand Colors Override
If you need to customize colors while maintaining readability:

```css
/* Override primary accent color */
:root {
  --primary-color: #your-color;
  --primary-hover: #your-hover-color;
}

/* Update references to #ffd700 with var(--primary-color) */
```

## 📱 Testing & Validation

### Recommended Testing Tools
- **Litmus** - Email client testing
- **Email on Acid** - Rendering verification
- **Mail Tester** - Spam score checking
- **HTML Email Check** - Code validation

### Testing Checklist
- [ ] All variables render correctly
- [ ] Links work and are properly formatted
- [ ] Images load (if any)
- [ ] Mobile responsive layout
- [ ] Dark mode compatibility
- [ ] Accessibility compliance
- [ ] Spam filter compatibility

## 📄 License & Credits

These email templates are part of the MockMate platform and follow the terminal/CLI design theme. Templates include:
- Modern HTML5/CSS3
- Cross-client compatibility
- Mobile-first responsive design
- Accessibility best practices
- Professional terminal aesthetic

---

**MockMate Email Templates v1.0**  
AI-Powered Interview Platform  
Terminal Theme Collection
