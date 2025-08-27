#!/bin/bash

# Script to migrate Stripe to Cashfree in dynamic configuration system
# Run this script on your server where the dynamic-config tool is available

echo "🔄 Migrating Stripe to Cashfree in Dynamic Configuration System"
echo "=============================================================="

# Check if dynamic-config tool exists
if ! command -v ./dynamic-config &> /dev/null && ! command -v dynamic-config &> /dev/null; then
    echo "❌ Error: dynamic-config tool not found"
    echo "Please make sure you're in the directory with the dynamic-config tool"
    exit 1
fi

# Determine the config command
if command -v ./dynamic-config &> /dev/null; then
    CONFIG_CMD="./dynamic-config"
else
    CONFIG_CMD="dynamic-config"
fi

echo "📋 Using config command: $CONFIG_CMD"
echo ""

# Remove old Stripe configurations
echo "🗑️  Removing Stripe configurations..."
echo "----------------------------------------"

stripe_keys=("stripe_publishable_key" "stripe_secret_key" "stripe_webhook_secret")

for key in "${stripe_keys[@]}"; do
    echo "Removing $key..."
    $CONFIG_CMD --delete --key="$key" 2>/dev/null || echo "   ⏩ Not found or already removed: $key"
done

echo ""

# Add Cashfree configurations
echo "💰 Adding Cashfree configurations..."
echo "------------------------------------"

# Add Cashfree App ID
echo "Adding cashfree_app_id..."
$CONFIG_CMD --set \
  --key="cashfree_app_id" \
  --value="your_cashfree_app_id" \
  --type="string" \
  --category="payment" \
  --description="Cashfree Application ID for payments" \
  --required=true \
  --sensitive=false \
  --public=true

# Add Cashfree Secret Key
echo "Adding cashfree_secret_key..."
$CONFIG_CMD --set \
  --key="cashfree_secret_key" \
  --value="your_cashfree_secret_key" \
  --type="string" \
  --category="payment" \
  --description="Cashfree Secret Key for API authentication" \
  --required=true \
  --sensitive=true \
  --public=false

# Add Cashfree Client ID
echo "Adding cashfree_client_id..."
$CONFIG_CMD --set \
  --key="cashfree_client_id" \
  --value="your_cashfree_client_id" \
  --type="string" \
  --category="payment" \
  --description="Cashfree Client ID" \
  --required=false \
  --sensitive=false \
  --public=true

# Add Cashfree Client Secret
echo "Adding cashfree_client_secret..."
$CONFIG_CMD --set \
  --key="cashfree_client_secret" \
  --value="your_cashfree_client_secret" \
  --type="string" \
  --category="payment" \
  --description="Cashfree Client Secret" \
  --required=false \
  --sensitive=true \
  --public=false

# Add Cashfree Environment
echo "Adding cashfree_environment..."
$CONFIG_CMD --set \
  --key="cashfree_environment" \
  --value="sandbox" \
  --type="string" \
  --category="payment" \
  --description="Cashfree Environment (sandbox/production)" \
  --required=false \
  --sensitive=false \
  --public=false

echo ""
echo "✅ Cashfree payment configurations added successfully!"
echo ""

# Show current payment configurations
echo "💳 Current Payment Configurations:"
echo "----------------------------------"
$CONFIG_CMD --category=payment --list

echo ""
echo "📋 Next Steps:"
echo "--------------"
echo "1. Set your actual Cashfree credentials:"
echo "   $CONFIG_CMD --set --key=cashfree_app_id --value=YOUR_ACTUAL_APP_ID"
echo "   $CONFIG_CMD --set --key=cashfree_secret_key --value=YOUR_ACTUAL_SECRET_KEY"
echo "   $CONFIG_CMD --set --key=cashfree_client_id --value=YOUR_ACTUAL_CLIENT_ID"
echo "   $CONFIG_CMD --set --key=cashfree_client_secret --value=YOUR_ACTUAL_CLIENT_SECRET"
echo ""
echo "2. Set environment (for production):"
echo "   $CONFIG_CMD --set --key=cashfree_environment --value=production"
echo ""
echo "3. Verify configurations:"
echo "   $CONFIG_CMD --category=payment --list"
echo ""
echo "4. Restart your application to pick up the new configurations"
echo ""
echo "🎉 Migration completed!"
