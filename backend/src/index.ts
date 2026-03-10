import dotenv from 'dotenv';
import { GatewayServer } from './gateway/server.js';
import { logger } from './utils/logger.js';
import { MemoryManager } from './services/memory/MemoryManager.js';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables from backend directory
dotenv.config();

async function checkAgentsExist(): Promise<boolean> {
  const agentsDir = process.env.AGENTS_DIR || './agents';
  
  try {
    // Check if agents directory exists
    await fs.access(agentsDir);
    
    // Check if there are any agents
    const memoryManager = new MemoryManager(agentsDir);
    const agents = await memoryManager.loadAllAgents();
    
    return agents.length > 0;
  } catch (error) {
    return false;
  }
}

async function main() {
  try {
    logger.info('Starting AI Office Backend...');

    // Check if agents exist before starting
    const hasAgents = await checkAgentsExist();
    
    if (!hasAgents) {
      console.log(`
❌ No agents found!

Before starting the gateway, you need to create at least one agent.

Run the onboarding process:
  npm run onboard

This will create your first agent and configure the system.
After onboarding, you can start the gateway with:
  npm run gateway

`);
      process.exit(1);
    }

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
