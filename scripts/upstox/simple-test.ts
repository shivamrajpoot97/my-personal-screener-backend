#!/usr/bin/env ts-node

import 'dotenv/config';
import { SharedDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';

async function simpleTest() {
  try {
    console.log('1. Starting simple test...');
    
    const token = process.env.UPSTOX_TOKEN;
    if (!token) {
      console.error('UPSTOX_TOKEN environment variable not set');
      process.exit(1);
    }
    
    console.log('2. Token available:', token.substring(0, 20) + '...');
    
    console.log('3. Connecting to database...');
    const db = SharedDatabase.getInstance();
    await db.connect('simple-test');
    console.log('4. ✓ Connected to MongoDB');
    
    console.log('5. Test completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

simpleTest();