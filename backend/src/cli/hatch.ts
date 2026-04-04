#!/usr/bin/env node
/**
 * hatch.ts — standalone launcher
 * Starts the gateway in background and asks how you want to connect.
 * Run: npm run hatch
 */
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { MemoryManager } from '../services/memory/MemoryManager.js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4001', 10);
const WEB_URL = `http://localhost:${PORT}`;
const AGENTS_DIR = process.env.AGENTS_DIR || './agents';

async function main() {
  // Verify agents exist
  const mm = new MemoryManager(AGENTS_DIR);
  const agents = await mm.loadAllAgents();

  if (agents.length === 0) {
    console.log('\n❌ No agents found. Run npm run onboard first.\n');
    process.exit(1);
  }

  const agentNames = agents.map(a => a.name).join(', ');

  console.log(`
╔══════════════════════════════════════════╗
║           🐣  OYM Hatch Launcher         ║
╚══════════════════════════════════════════╝

  Agents: ${agentNames}
  Gateway: ${WEB_URL}
`);

  // Start gateway
  console.log('  Starting gateway...\n');
  const gatewayEntry = new URL('../index.ts', import.meta.url).pathname;
  const proc = spawn(
    process.execPath,
    ['--import', 'tsx/esm', gatewayEntry],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env }, detached: false }
  );

  proc.stderr?.on('data', (d: Buffer) => {
    const lines = d.toString().split('\n').filter(Boolean);
    for (const line of lines) process.stdout.write(`  [gateway] ${line}\n`);
  });
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n  ❌ Gateway exited (code ${code}). Run 'npm run gateway' to debug.\n`);
      process.exit(1);
    }
  });

  // Wait for gateway to boot
  const alive = await pingGateway(WEB_URL);
  console.log(alive ? `  ✅ Gateway ready at ${WEB_URL}\n` : `  ⚠️  Gateway may still be starting...\n`);

  const { choice } = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: '🐣 How do you want to connect?',
    choices: [
      { name: '💬 TUI  — terminal chat (recommended)', value: 'tui' },
      { name: `🌐 Control UI — open browser at ${WEB_URL}`, value: 'web' },
      { name: '⏸  Just run gateway — I\'ll connect manually', value: 'bg' },
    ],
  }]);

  if (choice === 'tui') {
    console.log('\n  Wake up, my friend!\n');
    const tuiEntry = new URL('../cli/ChatBlessed.ts', import.meta.url).pathname;
    const tui = spawn(
      process.execPath,
      ['--import', 'tsx/esm', tuiEntry],
      { stdio: 'inherit', env: process.env }
    );
    tui.on('close', () => {
      console.log(`\n  TUI closed. Gateway still running.\n  Web UI: ${WEB_URL}\n  Stop: Ctrl+C\n`);
    });
  } else if (choice === 'web') {
    await openBrowser(WEB_URL);
    console.log(`  ✅ Browser opened at ${WEB_URL}\n  Press Ctrl+C to stop gateway.\n`);
  } else {
    console.log(`\n  Gateway running. Connect via:\n    TUI:     npm run chat\n    Browser: ${WEB_URL}\n    Office:  cd ../frontend && npm run dev\n  Press Ctrl+C to stop.\n`);
  }

  // Keep alive
  process.on('SIGINT', () => { proc.kill('SIGTERM'); setTimeout(() => process.exit(0), 400); });
  process.on('SIGTERM', () => { proc.kill('SIGTERM'); process.exit(0); });
}

async function pingGateway(url: string, retries = 6): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 800));
  }
  return false;
}

async function openBrowser(url: string): Promise<void> {
  try {
    const { default: open } = await import('open');
    await open(url);
  } catch {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
