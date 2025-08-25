#!/bin/bash

# Add Cashfree Payment Configuration
echo "Adding Cashfree payment configurations to dynamic config..."

# Check if dynamic-config tool exists
if ! command -v ./dynamic-config &> /dev/null; then
    echo "Error: dynamic-config tool not found"
    exit 1
fi

# Add Cashfree App ID
echo "Adding cashfree_app_id..."
./dynamic-config --set \
  --key="cashfree_app_id" \
  --value="your_cashfree_app_id" \
  --type="string" \
  --category="payment" \
  --description="Cashfree Application ID for payments" \
  --required=true \
  --sensitive=false

# Add Cashfree Secret Key
echo "Adding cashfree_secret_key..."
./dynamic-config --set \
  --key="cashfree_secret_key" \
  --value="your_cashfree_secret_key" \
  --type="string" \
  --category="payment" \
  --description="Cashfree Secret Key for API authentication" \
  --required=true \
  --sensitive=true

# Add Cashfree Test Mode
echo "Adding cashfree_test_mode..."
./dynamic-config --set \
  --key="cashfree_test_mode" \
  --value="true" \
  --type="boolean" \
  --category="payment" \
  --description="Enable test mode for Cashfree payments" \
  --required=false \
  --sensitive=false

echo "✅ Cashfree payment configurations added successfully!"
echo ""
echo "You can now:"
echo "1. Set your actual Cashfree credentials:"
echo "   ./dynamic-config --set --key=cashfree_app_id --value=YOUR_ACTUAL_APP_ID"
echo "   ./dynamic-config --set --key=cashfree_secret_key --value=YOUR_ACTUAL_SECRET_KEY"
echo ""
echo "2. View payment configurations:"
echo "   ./dynamic-config --category=payment --list"
echo ""
echo "3. Enable/disable test mode:"
echo "   ./dynamic-config --set --key=cashfree_test_mode --value=false"
