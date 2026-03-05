import dotenv from 'dotenv';
import { GatewayServer } from './gateway/server.js';
import { logger } from './utils/logger.js';

// Load environment variables from backend directory
dotenv.config();

async function main() {
  try {
    logger.info('Starting AI Office Backend...');

    // Standardize on 4001 (OpenClaw port), hardcoded to avoid .env conflicts
    const port = 4001;

    const server = new GatewayServer({ port });

    await server.start();

    logger.info(`✅ AI Office Backend started on port ${port}`);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
