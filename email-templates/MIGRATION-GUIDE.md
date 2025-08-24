# Email Template Migration Guide

## 📧 Billing Template Migration

### OLD (Deprecated) ❌
- `billing-subscription.html` - Single template with multiple conditional sections

### NEW (Recommended) ✅
- `billing-payment-success.html` - Dedicated success confirmation
- `billing-payment-failed.html` - Clear failure messaging with recovery steps  
- `billing-subscription-expiring.html` - Renewal-focused with urgency

## 🔄 Migration Steps

### 1. Backend Service Updates
Replace in your code:

```javascript
// OLD - Single template with conditionals
await emailService.sendEmail('billing-subscription', {
  BILLING_TYPE: 'Payment Success',
  IS_PAYMENT_SUCCESS: true,
  // ... many conditional variables
});

// NEW - Specific event-based methods
await emailService.sendPaymentSuccessEmail(user, {
  planName: 'Premium Plan',
  totalAmount: '29.99',
  nextBillingDate: '2024-02-01',
  invoiceNumber: 'INV-001',
  transactionId: 'txn-123'
});
```

### 2. Template Configuration Updates

```javascript
// OLD
BILLING_SUCCESS: {
  templateName: 'billing-subscription',
  requiredVariables: ['BILLING_TYPE', 'IS_PAYMENT_SUCCESS', ...],
}

// NEW  
BILLING_SUCCESS: {
  templateName: 'billing-payment-success',
  requiredVariables: ['USER_NAME', 'PLAN_NAME', 'TOTAL_AMOUNT', ...],
}
```

### 3. Variable Mapping

| Old Variables | New Variables |
|---------------|---------------|
| `{{BILLING_TYPE}}` | Template-specific (removed) |
| `{{IS_PAYMENT_SUCCESS}}` | Template-specific (removed) |
| `{{IS_PAYMENT_FAILED}}` | Template-specific (removed) |
| `{{IS_EXPIRING_SOON}}` | Template-specific (removed) |
| `{{USER_NAME}}` | `{{USER_NAME}}` ✅ |
| `{{PLAN_NAME}}` | `{{PLAN_NAME}}` ✅ |
| `{{AMOUNT}}` | `{{TOTAL_AMOUNT}}` |

## ✅ Benefits of Migration

1. **Better User Experience**: Event-specific emails with appropriate messaging
2. **Easier Maintenance**: Separate templates for different events
3. **Improved Testing**: Test individual email types independently
4. **Better Analytics**: Track engagement per email type
5. **Simplified Logic**: No complex conditional blocks in templates

## 🔧 Email Service Methods

### New Methods Available:
- `sendPaymentSuccessEmail(user, paymentDetails)`
- `sendPaymentFailedEmail(user, failureDetails)`  
- `sendSubscriptionExpiringEmail(user, subscriptionDetails)`

### Templates Created:
- `billing-payment-success.html`
- `billing-payment-failed.html`
- `billing-subscription-expiring.html`

## 📊 Validation

Run the email template test to verify migration:
```bash
node backend/simple-email-test.js
```

Should show 100% variable substitution success rate.

## 🚨 Deprecation Notice

The `billing-subscription.html` template is **deprecated** as of 2024 and should not be used for new implementations. 

**Removal Timeline:**
- ⚠️  **Phase 1** (Current): Mark as deprecated, new templates available
- 📋 **Phase 2** (Next release): Update all references to use new templates  
- 🗑️ **Phase 3** (Future): Remove old template entirely

## 💡 Best Practices

1. **One Template Per Event**: Each email should serve a single, clear purpose
2. **Consistent Variable Naming**: Use `{{UPPER_CASE}}` format
3. **Event-Specific Content**: Tailor messaging to the specific user action
4. **Clear Call-to-Actions**: Provide obvious next steps for users
5. **Test Thoroughly**: Validate all variables are properly substituted

## 🆘 Need Help?

If you encounter issues during migration:
1. Check the variable mapping table above
2. Run the email template test script
3. Review the new template examples
4. Test with the EmailService preview methods
