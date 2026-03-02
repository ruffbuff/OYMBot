import dotenv from 'dotenv';
import path from 'path';
import { GatewayServer } from './gateway/server';
import { logger } from './utils/logger';

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  try {
    logger.info('Starting AI Office Backend...');

    const server = new GatewayServer({
      port: parseInt(process.env.PORT || '4000'),
      wsPort: parseInt(process.env.WS_PORT || '4001'),
    });

    await server.start();

    logger.info('AI Office Backend started successfully');

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
