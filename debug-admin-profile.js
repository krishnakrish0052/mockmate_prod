#!/usr/bin/env node

/**
 * Debug Admin Profile API Endpoint
 * 
 * This script helps debug the 404 error on /api/admin-profile/me
 */

import fetch from 'node-fetch';

async function debugAdminProfile() {
  console.log('🔍 Debugging Admin Profile API Endpoint...\n');
  
  // Test different URL patterns
  const testUrls = [
    'http://localhost:5000/api/admin-profile/me',
    'http://localhost:5000/admin-profile/me',
    'http://localhost:5000/api/admin/profile/me',
    'https://api.mock-mate.com/api/admin-profile/me',
    'https://api.mock-mate.com/admin-profile/me'
  ];
  
  for (const url of testUrls) {
    try {
      console.log(`📡 Testing: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-for-debugging'
        }
      });
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.status === 404) {
        console.log('   ❌ Route not found');
      } else if (response.status === 401) {
        console.log('   🔐 Authentication required (route exists!)');
      } else if (response.status === 403) {
        console.log('   🚫 Forbidden (route exists but access denied)');
      } else {
        console.log('   ✅ Route responding');
        const text = await response.text();
        console.log(`   Response: ${text.substring(0, 200)}...`);
      }
      
    } catch (error) {
      console.log(`   💥 Error: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log('🎯 Analysis:');
  console.log('   If /api/admin-profile/me returns 401/403: Route exists, authentication issue');
  console.log('   If /api/admin-profile/me returns 404: Route not registered properly');
  console.log('   Check server logs for more details');
  console.log('');
  console.log('💡 Frontend Configuration:');
  console.log('   PROFILE endpoint: "/admin-profile"');
  console.log('   getApiUrl() constructs: "{baseUrl}/api/admin-profile"');
  console.log('   Final URL should be: "https://api.mock-mate.com/api/admin-profile/me"');
}

debugAdminProfile().catch(console.error);
