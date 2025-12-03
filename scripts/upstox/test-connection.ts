#!/usr/bin/env ts-node

console.log('Starting connection test...');

try {
  console.log('Importing modules...');
  
  // Test basic imports first
  const { SharedDatabase } = require('../../shared/database');
  const { logger } = require('../../shared/utils/logger');
  
  console.log('Basic imports successful');
  
  async function testConnection() {
    try {
      console.log('Testing database connection...');
      const db = SharedDatabase.getInstance();
      await db.connect('test-service');
      console.log('Database connected successfully!');
      
      console.log('Testing models...');
      const { Stock } = require('../../shared/models');
      
      const stockCount = await Stock.countDocuments({ instrumentType: 'EQ' });
      console.log(`Found ${stockCount} equity stocks in database`);
      
      console.log('All tests passed!');
      process.exit(0);
      
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  }
  
  testConnection();
  
} catch (error) {
  console.error('Import failed:', error);
  process.exit(1);
}