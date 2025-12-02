#!/usr/bin/env ts-node

import { SharedDatabase } from '../shared/database';
import { logger } from '../shared/utils/logger';
import { FEATURE_KEYS, TIMEFRAME_FEATURES } from '../shared/models/CandleFeatures';

interface MigrationStats {
  total: number;
  processed: number;
  migrated: number;
  skipped: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

class CandleFeaturesMigration {
  private batchSize: number;
  private stats: MigrationStats;

  constructor(batchSize: number = 1000) {
    this.batchSize = batchSize;
    this.stats = {
      total: 0,
      processed: 0,
      migrated: 0,
      skipped: 0,
      errors: 0,
      startTime: new Date()
    };
  }

  async migrate(): Promise<void> {
    try {
      // Connect to database using SharedDatabase
      const db = SharedDatabase.getInstance();
      await db.connect('migration');
      logger.info('Connected to MongoDB');

      const { default: mongoose } = await import('mongoose');
      const mongoDb = mongoose.connection.db;
      
      if (!mongoDb) {
        throw new Error('Database connection not established');
      }

      // Check if migration is needed
      const sampleDoc = await mongoDb.collection('candlefeatures').findOne();
      if (!sampleDoc) {
        logger.info('No CandleFeatures documents found. Nothing to migrate.');
        return;
      }

      // Check if already migrated
      if (sampleDoc.f && !sampleDoc.sma5) {
        logger.info('Documents appear to already be migrated (found "f" field without "sma5").');
        const proceed = await this.promptUser('Do you want to continue anyway? (y/N): ');
        if (proceed.toLowerCase() !== 'y') {
          logger.info('Migration cancelled by user.');
          return;
        }
      }

      // Get total count
      this.stats.total = await mongoDb.collection('candlefeatures').countDocuments();
      logger.info(`Found ${this.stats.total} CandleFeatures documents to migrate`);

      if (this.stats.total === 0) {
        logger.info('No documents to migrate.');
        return;
      }

      // Start migration
      await this.migrateInBatches(mongoDb);
      
      this.stats.endTime = new Date();
      this.logFinalStats();

    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  private async migrateInBatches(db: any): Promise<void> {
    const collection = db.collection('candlefeatures');
    let skip = 0;

    while (skip < this.stats.total) {
      logger.info(`Processing batch: ${skip + 1}-${Math.min(skip + this.batchSize, this.stats.total)} of ${this.stats.total}`);
      
      try {
        // Get batch of documents
        const docs = await collection
          .find({})
          .skip(skip)
          .limit(this.batchSize)
          .toArray();

        if (docs.length === 0) {
          break;
        }

        // Process batch
        const bulkOps = [];
        
        for (const doc of docs) {
          this.stats.processed++;
          
          try {
            const migratedDoc = this.migrateDocument(doc);
            
            if (migratedDoc) {
              bulkOps.push({
                updateOne: {
                  filter: { _id: doc._id },
                  update: { 
                    $set: { f: migratedDoc.f },
                    $unset: this.getFieldsToRemove()
                  }
                }
              });
              this.stats.migrated++;
            } else {
              this.stats.skipped++;
            }
          } catch (error) {
            this.stats.errors++;
            logger.error(`Error migrating document ${doc._id}:`, error);
          }
        }

        // Execute bulk operations
        if (bulkOps.length > 0) {
          await collection.bulkWrite(bulkOps);
        }

        // Progress update
        this.logProgress();
        
        skip += this.batchSize;
        
        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        logger.error(`Error processing batch starting at ${skip}:`, error);
        skip += this.batchSize; // Continue with next batch
      }
    }
  }

  private migrateDocument(doc: any): { f: any } | null {
    // Skip if already migrated
    if (doc.f && typeof doc.f === 'object') {
      return null;
    }

    const timeframe = doc.timeframe;
    const allowedFeatures = TIMEFRAME_FEATURES[timeframe as keyof typeof TIMEFRAME_FEATURES];
    
    if (!allowedFeatures) {
      logger.warn(`Unknown timeframe: ${timeframe} for document ${doc._id}`);
      return null;
    }

    const compactFeatures: { [key: string]: any } = {};
    let hasFeatures = false;

    // Convert each field to compact format
    for (const [longName, shortKey] of Object.entries(FEATURE_KEYS)) {
      const value = doc[longName];
      
      if (value !== null && value !== undefined && allowedFeatures.includes(shortKey as string)) {
        compactFeatures[shortKey as string] = value;
        hasFeatures = true;
      }
    }

    return hasFeatures ? { f: compactFeatures } : null;
  }

  private getFieldsToRemove(): { [key: string]: 1 } {
    const fieldsToRemove: { [key: string]: 1 } = {};
    
    // Remove all old feature fields
    for (const longName of Object.keys(FEATURE_KEYS)) {
      fieldsToRemove[longName] = 1;
    }
    
    return fieldsToRemove;
  }

  private logProgress(): void {
    const percentage = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
    const elapsed = Date.now() - this.stats.startTime.getTime();
    const remaining = this.stats.total - this.stats.processed;
    const avgTimePerDoc = elapsed / this.stats.processed;
    const eta = new Date(Date.now() + (remaining * avgTimePerDoc));

    logger.info(`Progress: ${this.stats.processed}/${this.stats.total} (${percentage}%) | ` +
               `Migrated: ${this.stats.migrated} | Skipped: ${this.stats.skipped} | ` +
               `Errors: ${this.stats.errors} | ETA: ${eta.toLocaleTimeString()}`);
  }

  private logFinalStats(): void {
    const duration = (this.stats.endTime!.getTime() - this.stats.startTime.getTime()) / 1000;
    
    logger.info('\n=== CANDLEFEATURES MIGRATION COMPLETED ===');
    logger.info(`Total documents: ${this.stats.total}`);
    logger.info(`Processed: ${this.stats.processed}`);
    logger.info(`Successfully migrated: ${this.stats.migrated}`);
    logger.info(`Skipped (already migrated): ${this.stats.skipped}`);
    logger.info(`Errors: ${this.stats.errors}`);
    logger.info(`Duration: ${duration.toFixed(2)} seconds`);
    logger.info(`Average: ${(duration / this.stats.processed).toFixed(3)} seconds per document`);
    
    const successRate = (this.stats.migrated / (this.stats.migrated + this.stats.errors) * 100).toFixed(1);
    logger.info(`Success rate: ${successRate}%`);
    
    // Estimate storage savings
    const oldSize = this.stats.migrated * 400; // bytes
    const newSize = this.stats.migrated * 150; // bytes (estimated)
    const savings = oldSize - newSize;
    const savingsPercent = (savings / oldSize * 100).toFixed(1);
    
    logger.info(`\nEstimated storage savings:`);
    logger.info(`Old size: ${(oldSize / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`New size: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`Savings: ${(savings / 1024 / 1024).toFixed(2)} MB (${savingsPercent}%)`);
    
    logger.info('\n=== NEXT STEPS ===');
    logger.info('1. Verify migration success by checking a few documents');
    logger.info('2. Update application code to use new helper methods');
    logger.info('3. Monitor performance and storage usage');
    logger.info('4. Consider running db.collection.compact() to reclaim space');
    logger.info('\n=== END ===');
  }

  private async promptUser(message: string): Promise<string> {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(message, (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}

// Verification functions
class MigrationVerifier {
  static async verify(): Promise<void> {
    try {
      const { default: mongoose } = await import('mongoose');
      const db = mongoose.connection.db;
      
      if (!db) {
        throw new Error('Database connection not established');
      }

      const collection = db.collection('candlefeatures');
      
      // Check sample documents
      const sampleDocs = await collection.find({}).limit(10).toArray();
      
      logger.info('\n=== MIGRATION VERIFICATION ===');
      logger.info(`Checking ${sampleDocs.length} sample documents...`);
      
      let migratedCount = 0;
      let oldFormatCount = 0;
      
      for (const doc of sampleDocs) {
        if (doc.f && typeof doc.f === 'object') {
          migratedCount++;
          logger.debug(`✓ Document ${doc._id}: Migrated (features: ${Object.keys(doc.f).join(', ')})`);
        } else if (doc.sma5 || doc.rsi14) {
          oldFormatCount++;
          logger.warn(`✗ Document ${doc._id}: Still in old format`);
        } else {
          logger.info(`? Document ${doc._id}: No features found`);
        }
      }
      
      logger.info(`\nVerification Results:`);
      logger.info(`Migrated format: ${migratedCount}/${sampleDocs.length}`);
      logger.info(`Old format: ${oldFormatCount}/${sampleDocs.length}`);
      
      if (migratedCount === sampleDocs.length) {
        logger.info('✅ All sample documents are in the new format!');
      } else if (oldFormatCount > 0) {
        logger.warn('⚠️  Some documents are still in old format. Migration may be incomplete.');
      }
      
      // Check storage stats
      const stats = await collection.stats();
      logger.info(`\nCollection Statistics:`);
      logger.info(`Total documents: ${stats.count}`);
      logger.info(`Total size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      logger.info(`Average document size: ${stats.avgObjSize.toFixed(2)} bytes`);
      logger.info(`Storage size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
      
    } catch (error) {
      logger.error('Verification failed:', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  try {
    const args = process.argv.slice(2);
    let batchSize = 1000;
    let verify = false;
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--batch-size':
          batchSize = parseInt(args[i + 1]!) || 1000;
          i++;
          break;
        case '--verify':
          verify = true;
          break;
        case '--help':
          console.log('CandleFeatures Migration Script');
          console.log('');
          console.log('Usage: ts-node migrate-candle-features.ts [options]');
          console.log('');
          console.log('Options:');
          console.log('  --batch-size <number>  Number of documents to process per batch (default: 1000)');
          console.log('  --verify               Only verify migration, don\'t migrate');
          console.log('  --help                 Show this help message');
          console.log('');
          console.log('Examples:');
          console.log('  ts-node migrate-candle-features.ts');
          console.log('  ts-node migrate-candle-features.ts --batch-size 500');
          console.log('  ts-node migrate-candle-features.ts --verify');
          process.exit(0);
      }
    }
    
    if (verify) {
      // Connect to database for verification
      const db = SharedDatabase.getInstance();
      await db.connect('verification');
      await MigrationVerifier.verify();
    } else {
      logger.info('Starting CandleFeatures migration to flexible schema...');
      logger.info(`Batch size: ${batchSize}`);
      
      const migration = new CandleFeaturesMigration(batchSize);
      await migration.migrate();
      
      logger.info('\nRunning verification...');
      await MigrationVerifier.verify();
    }
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Migration script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { CandleFeaturesMigration, MigrationVerifier };