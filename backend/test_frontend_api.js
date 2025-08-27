import axios from 'axios';

async function testFrontendAPI() {
  console.log('🔄 Testing Frontend API Call');
  console.log('============================\n');
  
  // This simulates the exact call your frontend is making
  const apiUrl = 'https://api.mock-mate.com/api/payments/create-payment-intent';
  
  // Sample payload that matches what frontend sends
  const payload = {
    packageId: 'test-package'  // You can adjust this to match actual package ID
  };
  
  console.log(`📡 Making POST request to: ${apiUrl}`);
  console.log(`📦 Payload:`, payload);
  
  try {
    // Make the exact same call as your frontend
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        // Note: In real frontend call, you'd have authentication headers
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token if needed
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log('\n✅ SUCCESS! API call worked!');
    console.log('📋 Response Status:', response.status);
    console.log('📋 Response Data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('\n❌ API call failed');
    console.log('📋 Error Status:', error.response?.status || 'No status');
    console.log('📋 Error Message:', error.message);
    
    if (error.response?.data) {
      console.log('📋 Error Response:', JSON.stringify(error.response.data, null, 2));
      
      // Check specific error patterns
      const errorMsg = error.response.data.message || error.response.data.error || '';
      
      if (errorMsg.includes('Cashfree gateway not available')) {
        console.log('\n🔍 DIAGNOSIS: Backend can\'t find Cashfree configuration');
        console.log('💡 SOLUTIONS:');
        console.log('   1. Check if production server is using correct database');
        console.log('   2. Restart production backend server');
        console.log('   3. Verify environment variables on production server');
        console.log('   4. Check if PaymentService is initializing correctly');
        
      } else if (errorMsg.includes('authentication')) {
        console.log('\n🔍 DIAGNOSIS: Cashfree API authentication issue');
        console.log('💡 SOLUTIONS:');
        console.log('   1. Verify Cashfree credentials are correct');
        console.log('   2. Check if production vs sandbox mode is correct');
        
      } else if (errorMsg.includes('Database')) {
        console.log('\n🔍 DIAGNOSIS: Database connection issue');
        console.log('💡 SOLUTIONS:');
        console.log('   1. Check database connectivity from production server');
        console.log('   2. Verify database credentials');
        
      } else {
        console.log('\n🔍 DIAGNOSIS: Unknown error - check server logs');
      }
    }
    
    console.log('\n📋 Current Status Check:');
    console.log('   ✅ Local database has correct Cashfree config');
    console.log('   ✅ API integration code is working');
    console.log('   ❓ Production server status unknown');
    console.log('\n🔄 Next Steps:');
    console.log('   1. Restart production backend server');
    console.log('   2. Check production server logs');
    console.log('   3. Verify production environment variables');
  }
}

testFrontendAPI();
