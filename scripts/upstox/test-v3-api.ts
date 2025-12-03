#!/usr/bin/env ts-node

import axios from 'axios';

async function testUpstoxV3API() {
  // You can replace this with your fresh token
  const token = process.argv[2];
  
  if (!token) {
    console.error('Usage: npx ts-node test-v3-api.ts <ACCESS_TOKEN>');
    process.exit(1);
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  try {
    // Test 1: Profile API (v2)
    console.log('1. Testing user profile (v2 API)...');
    const profileResponse = await axios.get('https://api.upstox.com/v2/user/profile', { headers });
    console.log('✓ Profile API works:', profileResponse.data);

    // Test 2: Historical candles (v3 API)
    console.log('\n2. Testing historical candles (v3 API)...');
    
    // Example instrument key for testing (NSE EQ format)
    const instrumentKey = 'NSE_EQ|INE848E01016'; // Example: Asian Paints
    const interval = 'minutes/15';
    const toDate = '2025-01-02';
    const fromDate = '2025-01-01';
    
    const candleUrl = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toDate}/${fromDate}`;
    console.log('Testing URL:', candleUrl);
    
    const candleResponse = await axios.get(candleUrl, { headers });
    console.log('✓ Historical candles API response:', JSON.stringify(candleResponse.data, null, 2));

  } catch (error: any) {
    console.error('✗ API Error:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      data: error.response?.data
    });
  }
}

testUpstoxV3API();