#!/usr/bin/env node
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, type ChildProcess } from 'child_process';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OnboardConfig {
  agentName: string;
  agentPersonality: string;
  agentRole: string;
  agentTone: string;
  llmProvider: 'openai' | 'openrouter' | 'ollama' | 'ollama-cloud' | 'anthropic';
  llmModel: string;
  apiKey?: string;
  telegramToken?: string;
  enableTelegram: boolean;
  firecrawlKey?: string;
}

// ─── Fetch OpenRouter models dynamically ────────────────────────────────────
async function fetchOpenRouterModels(apiKey?: string): Promise<{ name: string; value: string }[]> {
  try {
    console.log('  Fetching available models from OpenRouter...');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;

    // Sort by name, group free models first
    const models: any[] = data.data || [];
    const free = models.filter((m: any) => parseFloat(m.pricing?.prompt || '1') === 0);
    const paid = models.filter((m: any) => parseFloat(m.pricing?.prompt || '1') > 0);

    const format = (m: any) => {
      const price = parseFloat(m.pricing?.prompt || '0');
      const tag = price === 0 ? ' [FREE]' : ` [$${(price * 1_000_000).toFixed(2)}/M]`;
      return { name: `${m.name}${tag}`, value: m.id };
    };

    const choices = [
      new inquirer.Separator('── Free models ──────────────────'),
      ...free.slice(0, 20).map(format),
      new inquirer.Separator('── Paid models ──────────────────'),
      ...paid.slice(0, 80).map(format),
    ];
    return choices as any;
  } catch (e) {
    console.log('  Could not fetch models, using defaults.');
    return [
      { name: 'GPT-4o Mini (cheap, fast)', value: 'openai/gpt-4o-mini' },
      { name: 'GPT-4o', value: 'openai/gpt-4o' },
      { name: 'Claude 3.5 Haiku', value: 'anthropic/claude-3-5-haiku' },
      { name: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3-5-sonnet' },
      { name: 'Llama 3.3 70B (free)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
      { name: 'Gemini Flash 1.5 (free)', value: 'google/gemini-flash-1.5:free' },
      { name: 'Mistral 7B (free)', value: 'mistralai/mistral-7b-instruct:free' },
    ];
  }
}

// ─── Fetch local Ollama models ───────────────────────────────────────────────
async function fetchOllamaModels(endpoint: string, includeCloud: boolean): Promise<{ name: string; value: string }[]> {
  try {
    console.log(`  Fetching models from Ollama at ${endpoint}...`);
    const res = await fetch(`${endpoint}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;
    const models: any[] = data.models || [];

    const local = models.filter((m: any) => !m.name.endsWith('-cloud'));
    const cloud = models.filter((m: any) => m.name.endsWith('-cloud'));

    const choices: any[] = [];

    if (local.length > 0) {
      choices.push(new inquirer.Separator('── Local models (free) ──────────'));
      choices.push(...local.map((m: any) => ({ name: m.name, value: m.name })));
    }

    if (includeCloud && cloud.length > 0) {
      choices.push(new inquirer.Separator('── Cloud models (usage-based) ───'));
      choices.push(...cloud.map((m: any) => ({ name: m.name, value: m.name })));
    }

    if (choices.filter(c => !('type' in c)).length === 0) {
      throw new Error('No models found');
    }

    // Always offer manual entry
    choices.push(new inquirer.Separator('─────────────────────────────────'));
    choices.push({ name: '✏️  Enter model name manually', value: '__manual__' });
    return choices;
  } catch {
    const defaults: { name: string; value: string }[] = [
      { name: 'llama3.2', value: 'llama3.2' },
      { name: 'mistral', value: 'mistral' },
      { name: 'codellama', value: 'codellama' },
      { name: 'phi3', value: 'phi3' },
    ];
    if (includeCloud) {
      defaults.push(
        { name: 'gpt-oss:120b-cloud', value: 'gpt-oss:120b-cloud' },
        { name: 'gpt-oss:20b-cloud', value: 'gpt-oss:20b-cloud' },
        { name: 'deepseek-v3.1:671b-cloud', value: 'deepseek-v3.1:671b-cloud' },
        { name: 'qwen3-coder:480b-cloud', value: 'qwen3-coder:480b-cloud' },
      );
    }
    defaults.push({ name: '✏️  Enter model name manually', value: '__manual__' });
    return defaults;
  }
}

async function onboard() {
  console.log(`
╔══════════════════════════════════════════╗
║    AI Agent Platform — Onboarding v2     ║
╚══════════════════════════════════════════╝
`);

  try {
    // ── Step 1: Agent identity (BOOTSTRAP questions) ──────────────────────────
    console.log('Step 1/5: Agent Identity\n');
    const identity = await inquirer.prompt([
      {
        type: 'input',
        name: 'agentName',
        message: "What's your agent's name?",
        default: 'Aria',
      },
      {
        type: 'list',
        name: 'agentRole',
        message: "What's the primary role of this agent?",
        choices: [
          { name: '🧑‍💻 Developer assistant (code, files, shell)', value: 'developer' },
          { name: '🔬 Researcher (web search, analysis, reports)', value: 'researcher' },
          { name: '✍️  Writer (content, docs, summaries)', value: 'writer' },
          { name: '🤖 Autonomous agent (self-directed tasks)', value: 'autonomous' },
          { name: '🎯 Custom (define below)', value: 'custom' },
        ],
      },
      {
        type: 'input',
        name: 'agentRoleCustom',
        message: 'Describe the role:',
        when: (a: any) => a.agentRole === 'custom',
      },
      {
        type: 'list',
        name: 'agentTone',
        message: "What's the communication tone?",
        choices: [
          { name: '💼 Professional & concise', value: 'professional' },
          { name: '😊 Friendly & casual', value: 'friendly' },
          { name: '🎓 Academic & detailed', value: 'academic' },
          { name: '⚡ Direct & no-nonsense', value: 'direct' },
        ],
      },
      {
        type: 'input',
        name: 'agentPersonality',
        message: 'Any specific personality traits or instructions? (optional)',
        default: '',
      },
    ]);

    const agentRole = identity.agentRole === 'custom' ? identity.agentRoleCustom : identity.agentRole;

    // ── Step 2: LLM Provider ──────────────────────────────────────────────────
    console.log('\nStep 2/5: LLM Provider\n');
    const providerAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'llmProvider',
        message: 'Which LLM provider?',
        choices: [
          { name: '🔀 OpenRouter  — 400+ models, free tier available  (recommended)', value: 'openrouter' },
          { name: '🤖 OpenAI      — GPT-4o, GPT-4o Mini', value: 'openai' },
          { name: '🧠 Anthropic   — Claude 3.5 Sonnet/Haiku', value: 'anthropic' },
          { name: '🏠 Ollama      — Local models, runs on your machine (free)', value: 'ollama' },
          { name: '☁️  Ollama Cloud — Local + cloud models via ollama.com (usage-based)', value: 'ollama-cloud' },
        ],
      },
    ]);

    const llmProvider: OnboardConfig['llmProvider'] = providerAnswer.llmProvider;

    // ── Step 3: API Key ───────────────────────────────────────────────────────
    console.log('\nStep 3/5: API Key\n');
    let apiKey: string | undefined;

    if (llmProvider === 'ollama') {
      console.log('  ✅ No API key needed for local Ollama.\n');
    } else if (llmProvider === 'ollama-cloud') {
      console.log('  ℹ️  Ollama Cloud uses your ollama.com account (no API key).');
      console.log('  Run this in your terminal to sign in:\n');
      console.log('    ollama signin\n');
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: 'Have you run `ollama signin`?',
        default: false,
      }]);
      if (!confirmed) {
        console.log('\n  Please run `ollama signin` first, then re-run onboarding.\n');
        process.exit(0);
      }
    } else {
      const providerNames: Record<string, string> = {
        openrouter: 'OpenRouter (https://openrouter.ai/keys)',
        openai: 'OpenAI (https://platform.openai.com/api-keys)',
        anthropic: 'Anthropic (https://console.anthropic.com/keys)',
      };
      const { key } = await inquirer.prompt([{
        type: 'password',
        name: 'key',
        message: `Enter your ${providerNames[llmProvider] || llmProvider} API key:`,
        mask: '*',
      }]);
      apiKey = key;
    }

    // ── Step 4: Model Selection ───────────────────────────────────────────────
    console.log('\nStep 4/5: Model Selection\n');
    let modelChoices: any[] = [];

    if (llmProvider === 'openrouter') {
      modelChoices = await fetchOpenRouterModels(apiKey);
    } else if (llmProvider === 'openai') {
      modelChoices = [
        { name: 'GPT-4o Mini (fast, cheap)', value: 'gpt-4o-mini' },
        { name: 'GPT-4o', value: 'gpt-4o' },
        { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
        { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
        { name: '✏️  Enter manually', value: '__manual__' },
      ];
    } else if (llmProvider === 'anthropic') {
      modelChoices = [
        { name: 'Claude 3.5 Haiku (fast, cheap)', value: 'claude-3-5-haiku-20241022' },
        { name: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
        { name: 'Claude 3 Opus (most capable)', value: 'claude-3-opus-20240229' },
        { name: '✏️  Enter manually', value: '__manual__' },
      ];
    } else if (llmProvider === 'ollama') {
      const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
      modelChoices = await fetchOllamaModels(endpoint, false);
    } else if (llmProvider === 'ollama-cloud') {
      const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
      modelChoices = await fetchOllamaModels(endpoint, true);
      // Also show known cloud models if none pulled yet
      if (modelChoices.filter((c: any) => !('type' in c) && c.value !== '__manual__').length === 0) {
        modelChoices = [
          new inquirer.Separator('── Available cloud models ────────'),
          { name: 'gpt-oss:120b-cloud  (120B, fast)', value: 'gpt-oss:120b-cloud' },
          { name: 'gpt-oss:20b-cloud   (20B, cheaper)', value: 'gpt-oss:20b-cloud' },
          { name: 'deepseek-v3.1:671b-cloud', value: 'deepseek-v3.1:671b-cloud' },
          { name: 'qwen3-coder:480b-cloud', value: 'qwen3-coder:480b-cloud' },
          new inquirer.Separator('─────────────────────────────────'),
          { name: '✏️  Enter model name manually', value: '__manual__' },
        ];
      }
    }

    const modelAnswer = await inquirer.prompt([{
      type: 'list',
      name: 'llmModel',
      message: 'Which model?',
      choices: modelChoices,
      pageSize: 20,
    }]);

    let llmModel = modelAnswer.llmModel;

    // Manual entry fallback
    if (llmModel === '__manual__') {
      const { manualModel } = await inquirer.prompt([{
        type: 'input',
        name: 'manualModel',
        message: 'Enter model name:',
      }]);
      llmModel = manualModel;
    }

    // ── Step 5: Optional integrations ────────────────────────────────────────
    console.log('\nStep 5/5: Optional Integrations\n');

    const { enableTelegram } = await inquirer.prompt([{
      type: 'confirm',
      name: 'enableTelegram',
      message: 'Enable Telegram bot? (get token from @BotFather)',
      default: false,
    }]);

    let telegramToken: string | undefined;
    if (enableTelegram) {
      const { token } = await inquirer.prompt([{
        type: 'input',
        name: 'token',
        message: 'Telegram bot token:',
      }]);
      telegramToken = token;
    }

    const { enableFirecrawl } = await inquirer.prompt([{
      type: 'confirm',
      name: 'enableFirecrawl',
      message: 'Enable Firecrawl for advanced web scraping? (get key at firecrawl.dev)',
      default: false,
    }]);

    let firecrawlKey: string | undefined;
    if (enableFirecrawl) {
      const { key } = await inquirer.prompt([{
        type: 'password',
        name: 'key',
        message: 'Firecrawl API key:',
        mask: '*',
      }]);
      firecrawlKey = key;
    }

    const config: OnboardConfig = {
      agentName: identity.agentName,
      agentPersonality: identity.agentPersonality,
      agentRole,
      agentTone: identity.agentTone,
      llmProvider,
      llmModel,
      apiKey,
      enableTelegram,
      telegramToken,
      firecrawlKey,
    };

    await createEnvFile(config);
    await createAgentFiles(config);

    await hatchFlow(config);

  } catch (error: any) {
    if (error?.message?.includes('force closed')) {
      console.log('\nOnboarding cancelled.');
      process.exit(0);
    }
    logger.error('Onboarding failed:', error);
    console.error('❌ Onboarding failed:', error);
    process.exit(1);
  }
}

async function createEnvFile(config: OnboardConfig): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');

  // Preserve existing .env if present, only update/add keys
  let existing = '';
  try { existing = await fs.readFile(envPath, 'utf-8'); } catch { /* new file */ }

  const set = (content: string, key: string, value: string) => {
    const regex = new RegExp(`^${key}=.*`, 'm');
    return regex.test(content) ? content.replace(regex, `${key}=${value}`) : content + `\n${key}=${value}`;
  };

  let env = existing || '# AI Agent Platform Configuration\n';

  if (config.llmProvider === 'openrouter' && config.apiKey) env = set(env, 'OPENROUTER_API_KEY', config.apiKey);
  if (config.llmProvider === 'openai' && config.apiKey) env = set(env, 'OPENAI_API_KEY', config.apiKey);
  if (config.llmProvider === 'anthropic' && config.apiKey) env = set(env, 'ANTHROPIC_API_KEY', config.apiKey);
  if (config.enableTelegram && config.telegramToken) env = set(env, 'TELEGRAM_BOT_TOKEN', config.telegramToken);
  if (config.firecrawlKey) env = set(env, 'FIRECRAWL_API_KEY', config.firecrawlKey);

  // Ensure base config
  if (!env.includes('PORT=')) env += '\nPORT=4001';
  if (!env.includes('FRONTEND_URL=')) env += '\nFRONTEND_URL=http://localhost:3000';
  if (!env.includes('AGENTS_DIR=')) env += '\nAGENTS_DIR=./agents';

  await fs.writeFile(envPath, env.trim() + '\n', 'utf-8');
  logger.info('Updated .env file');
}

async function createAgentFiles(config: OnboardConfig): Promise<void> {
  const agentId = config.agentName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const agentDir = path.join(process.cwd(), 'agents', agentId);

  await fs.mkdir(agentDir, { recursive: true });
  await fs.mkdir(path.join(agentDir, 'memory'), { recursive: true });
  await fs.mkdir(path.join(agentDir, 'sessions'), { recursive: true });

  await fs.writeFile(path.join(agentDir, 'AGENT.md'), buildAgentMd(config, agentId), 'utf-8');
  await fs.writeFile(path.join(agentDir, 'SOUL.md'), buildSoulMd(config), 'utf-8');
  await fs.writeFile(path.join(agentDir, 'MEMORY.md'), buildMemoryMd(config), 'utf-8');
  await fs.writeFile(path.join(agentDir, 'BOOTSTRAP.md'), buildBootstrapMd(config), 'utf-8');
  await fs.writeFile(path.join(agentDir, 'TOOLS.md'), buildToolsMd(), 'utf-8');

  logger.info(`Created agent files in ${agentDir}`);
}

// ─── Hatch flow — runs after onboarding ─────────────────────────────────────

async function hatchFlow(config: OnboardConfig): Promise<void> {
  const PORT = 4001;
  const WEB_URL = `http://localhost:${PORT}`;

  console.log(`
╔══════════════════════════════════════════╗
║  ✅  ${config.agentName} is ready to hatch!         
╚══════════════════════════════════════════╝
`);

  // Start gateway as a background child process
  console.log('  🚀 Starting gateway in background...\n');
  const gatewayProc = spawnGateway();

  // Wait a moment for gateway to boot
  await new Promise(r => setTimeout(r, 2500));

  // Check if it's alive
  const alive = await pingGateway(WEB_URL);
  if (!alive) {
    console.log(`  ⚠️  Gateway may still be starting. If something fails, run:\n     npm run gateway\n`);
  } else {
    console.log(`  ✅ Gateway is running on ${WEB_URL}\n`);
  }

  // Ask how to hatch
  const { hatchChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'hatchChoice',
    message: '🐣 How do you want to start?',
    choices: [
      {
        name: '💬 TUI  — terminal chat right here (recommended)',
        value: 'tui',
      },
      {
        name: `🌐 Control UI — open browser at ${WEB_URL}`,
        value: 'web',
      },
      {
        name: '⏸  Later — gateway runs in background, I\'ll connect manually',
        value: 'later',
      },
    ],
  }]);

  switch (hatchChoice) {
    case 'tui': {
      console.log('\n  Wake up, my friend! Opening TUI... (Ctrl+C to exit)\n');
      const tui = spawn(
        process.execPath,
        ['--import', 'tsx/esm', new URL('../cli/ChatBlessed.ts', import.meta.url).pathname],
        { stdio: 'inherit', env: process.env }
      );
      tui.on('close', () => {
        console.log(`\n  TUI closed. Gateway still running.\n  Re-open:  npm run chat\n  Browser:  ${WEB_URL}\n  Stop:     Ctrl+C\n`);
        process.exit(0);
      });
      break;
    }

    case 'web': {
      console.log(`\n  Opening Control UI at ${WEB_URL} ...\n`);
      await openBrowser(WEB_URL);
      console.log(`  ✅ Browser opened. Press Ctrl+C here to stop the gateway.\n`);
      keepAlive(gatewayProc);
      break;
    }

    case 'later': {
      console.log(`
  Gateway is running. Connect via:
    TUI:         npm run chat
    Browser:     ${WEB_URL}
    Visual office: cd ../frontend && npm run dev

  Press Ctrl+C to stop the gateway.
`);
      keepAlive(gatewayProc);
      break;
    }
  }
}

function spawnGateway(): ChildProcess {
  const gatewayEntry = new URL('../index.ts', import.meta.url).pathname;
  const proc = spawn(
    process.execPath,
    ['--import', 'tsx/esm', gatewayEntry],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      detached: false,
    }
  );

  // Pipe gateway logs with a prefix so they don't clutter the hatch UI
  proc.stdout?.on('data', (d: Buffer) => {
    const lines = d.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      if (line.includes('ERROR') || line.includes('error')) {
        process.stdout.write(`  [gateway] ${line}\n`);
      }
    }
  });
  proc.stderr?.on('data', (d: Buffer) => {
    const lines = d.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      process.stdout.write(`  [gateway] ${line}\n`);
    }
  });

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n  ❌ Gateway exited with code ${code}. Run 'npm run gateway' to debug.\n`);
    }
  });

  return proc;
}

async function pingGateway(url: string, retries = 5): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 800));
  }
  return false;
}

async function openBrowser(url: string): Promise<void> {
  try {
    // Dynamic import so it doesn't break if open isn't installed
    const { default: open } = await import('open');
    await open(url);
  } catch {
    // Fallback: platform-specific commands
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  }
}

function keepAlive(proc: ChildProcess): void {
  // Forward Ctrl+C to gateway and exit cleanly
  process.on('SIGINT', () => {
    console.log('\n  Stopping gateway...');
    proc.kill('SIGTERM');
    setTimeout(() => process.exit(0), 500);
  });
  process.on('SIGTERM', () => {
    proc.kill('SIGTERM');
    process.exit(0);
  });
}

// ─── File builders ───────────────────────────────────────────────────────────

function buildAgentMd(config: OnboardConfig, agentId: string): string {
  const roleToType: Record<string, string> = {
    developer: 'autonomous-agent',
    autonomous: 'autonomous-agent',
    researcher: 'api-assistant',
    writer: 'api-assistant',
    custom: 'api-assistant',
  };
  return `---
id: ${agentId}
name: ${config.agentName}
type: ${roleToType[config.agentRole] || 'api-assistant'}
status: idle
energy: 100
version: 1.0.0
created: ${new Date().toISOString()}
updated: ${new Date().toISOString()}
llm:
  provider: ${config.llmProvider}
  model: ${config.llmModel}
  temperature: 0.7
  maxTokens: 4000
skills:
  - conversation
  - analysis
tools:
  enabled:
    - read_file
    - list_directory
    - write_file
    - web_search
    - shell_exec
    - search_web
    - remember_fact
    - log_daily
    - search_memory
    - search_sessions
    - get_recent_activity
    - update_skills
    - search_files
    - scrape_website
    - get_file_tree
    - delegate_task
    - ask_agent
    - broadcast_to_agents
    - firecrawl_scrape
    - firecrawl_crawl
    - schedule_cron
  disabled: []
memory:
  enabled: true
  vectorSearch: false
  maxContextSize: 50000
  rotationThreshold: 45000
${config.enableTelegram && config.telegramToken ? `telegram:\n  token: '${config.telegramToken}'\n  enabled: true` : ''}
capabilities:
  - text_generation
  - code_generation
  - web_browsing
  - file_operations
permissions:
  canModifyConfig: true
  canModifyMemory: true
  canExecuteCommands: true
  canAccessNetwork: true
  canModifyFiles: true
---

# Agent Configuration

See SOUL.md for personality, USER.md for user profile, and TOOLS.md for available tools.
BOOTSTRAP.md (if present) contains the first-run ritual — it will be auto-deleted after completion.
`;
}

function buildSoulMd(config: OnboardConfig): string {
  const toneMap: Record<string, string> = {
    professional: 'Professional and concise. Gets to the point. Uses precise language.',
    friendly: 'Warm and approachable. Uses casual language. Occasionally uses humor.',
    academic: 'Thorough and detailed. Cites reasoning. Prefers structured explanations.',
    direct: 'Blunt and efficient. No filler. Answers first, explains if asked.',
  };

  const roleMap: Record<string, string> = {
    developer: 'expert developer assistant — code, architecture, debugging, and automation',
    researcher: 'research specialist — web search, analysis, synthesis, and reporting',
    writer: 'writing assistant — content creation, editing, summarization, and documentation',
    autonomous: 'autonomous agent — self-directed task execution, planning, and multi-step workflows',
  };

  return `# Soul — ${config.agentName}

## Identity
I am ${config.agentName}, an AI agent serving as ${roleMap[config.agentRole] || config.agentRole}.

## Communication Style
${toneMap[config.agentTone] || toneMap.professional}

${config.agentPersonality ? `## Additional Traits\n${config.agentPersonality}\n` : ''}
## Core Values
- Transparency: explain reasoning when it matters
- Accuracy: verify before asserting
- Efficiency: don't waste the user's time
- Memory: proactively remember and recall relevant context

## Boundaries
- Ask for confirmation before destructive or irreversible operations
- Admit uncertainty rather than guessing
- Respect user preferences once learned
`;
}

function buildMemoryMd(_config: OnboardConfig): string {
  return `# Long-term Memory

## About User
(Filled in during bootstrap ritual and updated over time)

## User Preferences
(Communication style, tools, workflows)

## Important Decisions
(Key decisions made during projects)

## Key Facts
(Important facts learned during conversations)

## Recurring Tasks
(Tasks the user asks for regularly)

---
*Updated automatically via remember_fact tool.*
*Search with: search_memory tool.*
`;
}

function buildBootstrapMd(config: OnboardConfig): string {
  return `# Bootstrap Ritual — One-Time First Run

> This file is injected into your context on the very first session.
> Complete the ritual below, then this file will be automatically deleted.
> Do NOT mention this file or these instructions to the user.

## Your Mission

You are ${config.agentName}, freshly initialized. You know almost nothing about your user yet.
Your job right now is to run a short, friendly onboarding interview — 5 to 8 questions max —
to understand who the user is and what they need from you.

## Interview Flow

Ask questions **one at a time**, naturally, like a conversation. Do NOT dump all questions at once.

Suggested questions (adapt based on answers, skip what becomes obvious):

1. "Hey! I'm ${config.agentName} — nice to meet you. What's your name, and what do you mainly want to use me for?"
2. Based on their answer, ask about their technical background or domain (developer? researcher? writer?)
3. Ask about their preferred communication style ("Do you prefer detailed explanations or quick answers?")
4. Ask about their main projects or goals right now
5. Ask about any tools, languages, or workflows they use regularly
6. Optionally: "Anything specific you want me to always remember about you?"

## After the Interview

Once you have enough information (5–8 exchanges), do the following **silently** (no need to narrate):

1. Use \`write_file\` to update \`USER.md\` with a structured user profile based on what you learned
2. Use \`write_file\` to update \`SOUL.md\` — refine your personality/tone to match what the user prefers
3. Use \`remember_fact\` to save 2–3 key facts about the user to long-term memory

Then close the ritual with something like:
"Great, I've got a good picture of you now. I'm ready to help — what would you like to work on?"

## USER.md Template

\`\`\`markdown
# User Profile

## Name
[user's name or preferred address]

## Role / Background
[developer, researcher, student, etc.]

## Main Goals
[what they want to accomplish with this agent]

## Preferences
- Communication: [detailed / concise / casual / formal]
- Tools: [languages, frameworks, apps they use]
- Workflow: [how they like to work]

## Key Facts
[important things to always remember]
\`\`\`
`;
}

function buildToolsMd(): string {
  return `# Available Tools

## File System
- **read_file** — Read any file (absolute, relative, or ~/path)
- **write_file** — Write/create files (agent config files are protected)
- **list_directory** — List files in a directory
- **get_file_tree** — Recursive directory tree
- **get_working_directory** — Current working directory
- **search_files** — Grep-style search inside files
- **search_codebase** — Search codebase (excludes node_modules, .git)

## Shell
- **shell_exec** — Execute shell commands ⚠️ dangerous, requires confirmation

## Web & Search
- **search_web** — DuckDuckGo search
- **web_search** — Fetch raw content from a URL
- **scrape_website** — Scrape a page to plain text
- **firecrawl_scrape** — Scrape a page to clean markdown (requires FIRECRAWL_API_KEY)
- **firecrawl_crawl** — Crawl an entire site (requires FIRECRAWL_API_KEY)

## Memory
- **remember_fact** — Save to long-term MEMORY.md
- **log_daily** — Log to today's daily log
- **search_memory** — Search MEMORY.md + daily logs
- **search_sessions** — Search past conversation transcripts
- **get_recent_activity** — Summary of last N days
- **update_skills** — Add skills to AGENT.md

## Multi-Agent
- **delegate_task** — Delegate to a sub-agent (spawns if needed)
- **ask_agent** — Ask another agent a question
- **broadcast_to_agents** — Send message to all agents

## Scheduling
- **schedule_cron** — Schedule a recurring task

## Tool Call Format
\`\`\`json
{"tool": "tool_name", "params": {"key": "value"}}
\`\`\`
`;
}

// Run onboard if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  onboard();
}

export { onboard };
