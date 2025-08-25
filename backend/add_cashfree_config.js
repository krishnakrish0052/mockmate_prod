import fs from 'fs';
import path from 'path';

// Add Cashfree configurations to dynamic config system

const cashfreeConfigs = [
  {
    key: 'cashfree_app_id',
    name: 'Cashfree App ID',
    description: 'Cashfree Application ID for payments',
    type: 'string',
    category: 'payment',
    defaultValue: 'your_cashfree_app_id',
    sensitive: false,
    required: true,
    validation: {
      minLength: 10,
      pattern: '^[A-Za-z0-9_-]+$'
    }
  },
  {
    key: 'cashfree_secret_key',
    name: 'Cashfree Secret Key',
    description: 'Cashfree Secret Key for API authentication',
    type: 'string',
    category: 'payment',
    defaultValue: 'your_cashfree_secret_key',
    sensitive: true,
    required: true,
    validation: {
      minLength: 20
    }
  },
  {
    key: 'cashfree_test_mode',
    name: 'Cashfree Test Mode',
    description: 'Enable test mode for Cashfree payments',
    type: 'boolean',
    category: 'payment',
    defaultValue: true,
    sensitive: false,
    required: false
  }
];

function generateDynamicConfigScript() {
  const script = `#!/bin/bash

# Add Cashfree Payment Configuration
echo "Adding Cashfree payment configurations to dynamic config..."

# Check if dynamic-config tool exists
if ! command -v ./dynamic-config &> /dev/null; then
    echo "Error: dynamic-config tool not found"
    exit 1
fi

# Add Cashfree App ID
echo "Adding cashfree_app_id..."
./dynamic-config --set \\
  --key="cashfree_app_id" \\
  --value="your_cashfree_app_id" \\
  --type="string" \\
  --category="payment" \\
  --description="Cashfree Application ID for payments" \\
  --required=true \\
  --sensitive=false

# Add Cashfree Secret Key
echo "Adding cashfree_secret_key..."
./dynamic-config --set \\
  --key="cashfree_secret_key" \\
  --value="your_cashfree_secret_key" \\
  --type="string" \\
  --category="payment" \\
  --description="Cashfree Secret Key for API authentication" \\
  --required=true \\
  --sensitive=true

# Add Cashfree Test Mode
echo "Adding cashfree_test_mode..."
./dynamic-config --set \\
  --key="cashfree_test_mode" \\
  --value="true" \\
  --type="boolean" \\
  --category="payment" \\
  --description="Enable test mode for Cashfree payments" \\
  --required=false \\
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
`;

  return script;
}

// Write the script file
const scriptContent = generateDynamicConfigScript();
const scriptPath = 'add_cashfree_config.sh';

fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

console.log(`✅ Generated script: ${scriptPath}`);
console.log('');
console.log('Run this on your server:');
console.log(`bash ${scriptPath}`);
console.log('');
console.log('Or manually add each config:');
cashfreeConfigs.forEach(config => {
  console.log(`./dynamic-config --set --key="${config.key}" --value="${config.defaultValue}" --type="${config.type}" --category="${config.category}" --description="${config.description}" --required=${config.required} --sensitive=${config.sensitive}`);
});
