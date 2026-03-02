#!/usr/bin/env node

import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createAgent(provider?: string, model?: string, telegramToken?: string): Promise<void> {
  console.log('\n🤖 Создаем агента...\n');
  
  const agentName = await question('Имя агента (Enter = MyAssistant): ');
  const agentId = (agentName.trim() || 'MyAssistant').toLowerCase().replace(/\s+/g, '-');
  const displayName = agentName.trim() || 'MyAssistant';

  // Ask for Telegram token for this agent
  let agentTelegramToken = telegramToken;
  if (!agentTelegramToken) {
    console.log('\n📱 Telegram Bot для этого агента (опционально)');
    console.log('Каждый агент = отдельный Telegram бот');
    console.log('Получи токен: https://t.me/BotFather\n');
    const token = await question('Telegram Bot Token (или Enter для пропуска): ');
    agentTelegramToken = token.trim() || undefined;
  }

  // Use provided provider/model or defaults
  const agentProvider = provider || 'openai';
  const agentModel = model || 'gpt-3.5-turbo';

  // Create agent directory
  const agentDir = path.resolve(process.cwd(), `agents/${agentId}`);
  
  try {
    // Check if agents directory exists, if not create it
    const agentsDir = path.resolve(process.cwd(), 'agents');
    try {
      await fs.access(agentsDir);
    } catch {
      await fs.mkdir(agentsDir, { recursive: true });
      console.log('✅ Created agents directory');
    }

    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(path.join(agentDir, 'memory'), { recursive: true });
    await fs.mkdir(path.join(agentDir, 'sessions'), { recursive: true });

    // Build telegram config section
    let telegramConfig = '';
    if (agentTelegramToken) {
      telegramConfig = `telegram:
  token: ${agentTelegramToken}
  enabled: true
`;
    }

    // Create AGENT.md
    const agentMd = `---
id: ${agentId}
name: ${displayName}
type: api-assistant
status: idle
energy: 100
version: 1.0.0
created: ${new Date().toISOString()}
updated: ${new Date().toISOString()}
llm:
  provider: ${agentProvider}
  model: ${agentModel}
  temperature: 0.7
  maxTokens: 2000
skills:
  - conversation
  - help
  - analysis
tools:
  enabled:
    - read_file
    - list_directory
    - write_file
    - web_search
  disabled: []
memory:
  enabled: true
  vectorSearch: false
  maxContextSize: 50000
  rotationThreshold: 45000
${telegramConfig}capabilities:
  - text_generation
  - code_generation
  - web_browsing
  - file_operations
permissions:
  canModifyConfig: false
  canModifyMemory: true
  canExecuteCommands: false
  canAccessNetwork: true
  canModifyFiles: false
---

# Agent Configuration

See SOUL.md for personality and TOOLS.md for available tools.
`;

    await fs.writeFile(path.join(agentDir, 'AGENT.md'), agentMd, 'utf-8');

    // Create SOUL.md
    const soulMd = `# Agent Soul - ${displayName}

## Core Identity

I am ${displayName}, your AI assistant focused on helping you with tasks and providing information.

## Personality Traits

- **Professional**: Clear and concise communication
- **Helpful**: Always try to find solutions
- **Curious**: Ask clarifying questions when needed
- **Honest**: Admit when I don't know something
- **Proactive**: Suggest improvements and alternatives

## Communication Style

- Use appropriate technical language
- Provide examples when helpful
- Break down complex topics
- Ask for feedback and clarification

## Values

- **Transparency**: Explain my reasoning
- **Privacy**: Respect user data
- **Quality**: Provide accurate information
- **Learning**: Improve from interactions

## Boundaries

- I ask for confirmation before executing potentially dangerous operations
- I respect user preferences and working style
- I admit limitations and uncertainties
`;

    await fs.writeFile(path.join(agentDir, 'SOUL.md'), soulMd, 'utf-8');

    // Create TOOLS.md
    const toolsMd = `# Available Tools

## File Operations

### read_file
**Status**: ✅ Enabled
**Description**: Read contents of a file
**Parameters**:
- \`path\` (string): File path

### write_file
**Status**: ✅ Enabled
**Description**: Write content to a file
**Parameters**:
- \`path\` (string): File path
- \`content\` (string): Content to write

### list_directory
**Status**: ✅ Enabled
**Description**: List files in a directory
**Parameters**:
- \`path\` (string): Directory path

## Web Operations

### web_search
**Status**: ✅ Enabled
**Description**: Fetch content from a URL
**Parameters**:
- \`query\` (string): URL to fetch

## Commands

Use \`/enable <tool>\` or \`/disable <tool>\` to manage tools.
`;

    await fs.writeFile(path.join(agentDir, 'TOOLS.md'), toolsMd, 'utf-8');

    // Create MEMORY.md
    const memoryMd = `# Long-term Memory

## Important Information
- Created: ${new Date().toISOString()}
- Purpose: AI assistant for automation and productivity

## Learned Preferences
(Will be updated as we interact)
`;

    await fs.writeFile(path.join(agentDir, 'MEMORY.md'), memoryMd, 'utf-8');

    // Create CONTEXT.md
    const contextMd = `# Current Session Context

Session started: ${new Date().toISOString()}

`;

    await fs.writeFile(path.join(agentDir, 'CONTEXT.md'), contextMd, 'utf-8');

    console.log(`✅ Агент "${displayName}" создан!`);
    console.log(`   ID: ${agentId}`);
    console.log(`   Provider: ${agentProvider}`);
    console.log(`   Model: ${agentModel}`);
    if (agentTelegramToken) {
      console.log(`   Telegram: ✅ Настроен`);
    }

  } catch (error) {
    console.error('\n❌ Ошибка при создании агента:', error);
    throw error;
  }
}

async function main() {
  console.log('\n🏢 AI Office Platform - Onboarding\n');
  console.log('Добро пожаловать! Давай настроим твой AI офис.\n');

  // Path to .env in project root (aipanel/.env)
  // When running from backend/, go up one level
  const envPath = path.resolve(process.cwd(), '../.env');
  const agentsDir = path.resolve(process.cwd(), 'agents');
  let envExists = false;
  let agentsExist = false;
  
  try {
    await fs.access(envPath);
    envExists = true;
  } catch {
    // .env doesn't exist, continue
  }

  try {
    const agents = await fs.readdir(agentsDir);
    agentsExist = agents.length > 0;
  } catch {
    // agents dir doesn't exist
  }

  // Check if this is a reconfiguration
  if (envExists || agentsExist) {
    console.log('⚠️  Обнаружена существующая конфигурация:\n');
    if (envExists) console.log('  - .env файл существует');
    if (agentsExist) console.log('  - Агенты уже созданы');
    console.log('');
    
    const action = await question('Что делать?\n1. Перенастроить (удалить все и начать заново)\n2. Добавить нового агента\n3. Отмена\n\nВыбор (1-3): ');
    
    if (action.trim() === '3') {
      console.log('\n✅ Отменено');
      rl.close();
      return;
    }

    if (action.trim() === '1') {
      // Full reset
      console.log('\n🗑️  Удаляю старую конфигурацию...');
      
      if (envExists) {
        await fs.unlink(envPath);
        console.log('  ✅ .env удален');
      }
      
      if (agentsExist) {
        await fs.rm(agentsDir, { recursive: true, force: true });
        console.log('  ✅ Агенты удалены');
      }
      
      console.log('\n✨ Начинаем с чистого листа!\n');
    } else if (action.trim() === '2') {
      // Just add new agent, keep .env
      console.log('\n➕ Добавляем нового агента...\n');
      
      if (!envExists) {
        console.log('❌ .env не найден. Сначала выполни полную настройку (выбери 1)');
        rl.close();
        return;
      }
      
      // Skip to agent creation
      await createAgent();
      rl.close();
      return;
    } else {
      console.log('\n❌ Неверный выбор');
      rl.close();
      return;
    }
  }

  // Continue with normal onboarding...

  console.log('\n📋 Выбери LLM провайдера:\n');
  console.log('1. OpenRouter (рекомендуется - есть бесплатный тариф)');
  console.log('2. OpenAI');
  console.log('3. Ollama (локально, бесплатно)');
  console.log('4. Anthropic (Claude)\n');

  const choice = await question('Твой выбор (1-4): ');

  let envContent = `# AI Office Platform Configuration
# Generated by onboard script

# Server Configuration
NODE_ENV=development
PORT=4000
WS_PORT=4001
FRONTEND_URL=http://localhost:3000

# Agent Configuration
AGENTS_DIR=./agents
SKILLS_DIR=./skills

# Logging
LOG_LEVEL=info

`;

  switch (choice.trim()) {
    case '1': {
      console.log('\n🌐 OpenRouter Setup');
      console.log('Получи бесплатный ключ: https://openrouter.ai/keys\n');
      
      const apiKey = await question('OpenRouter API Key (или Enter для пропуска): ');
      
      if (apiKey.trim()) {
        envContent += `# OpenRouter Configuration
OPENROUTER_API_KEY=${apiKey.trim()}
LLM_PROVIDER=openrouter
LLM_MODEL=openai/gpt-3.5-turbo
`;
      } else {
        envContent += `# OpenRouter Configuration (настрой позже)
# OPENROUTER_API_KEY=your-key-here
# LLM_PROVIDER=openrouter
# LLM_MODEL=openai/gpt-3.5-turbo
`;
      }
      
      console.log('\n💡 Популярные бесплатные модели на OpenRouter:');
      console.log('   - openai/gpt-3.5-turbo (быстрая)');
      console.log('   - meta-llama/llama-3-8b-instruct (бесплатная)');
      console.log('   - google/gemini-flash-1.5 (быстрая и бесплатная)');
      break;
    }

    case '2': {
      console.log('\n🤖 OpenAI Setup');
      console.log('Получи ключ: https://platform.openai.com/api-keys\n');
      
      const apiKey = await question('OpenAI API Key (или Enter для пропуска): ');
      
      if (apiKey.trim()) {
        envContent += `# OpenAI Configuration
OPENAI_API_KEY=${apiKey.trim()}
LLM_PROVIDER=openai
LLM_MODEL=gpt-3.5-turbo
`;
      } else {
        envContent += `# OpenAI Configuration (настрой позже)
# OPENAI_API_KEY=sk-proj-your-key-here
# LLM_PROVIDER=openai
# LLM_MODEL=gpt-3.5-turbo
`;
      }
      break;
    }

    case '3': {
      console.log('\n🦙 Ollama Setup (локально)');
      console.log('\nУстанови Ollama:');
      console.log('  macOS: brew install ollama');
      console.log('  Linux: curl -fsSL https://ollama.ai/install.sh | sh');
      console.log('  Windows: https://ollama.ai/download\n');
      console.log('Затем запусти: ollama serve');
      console.log('И скачай модель: ollama pull llama2\n');
      
      const endpoint = await question('Ollama endpoint (Enter = http://localhost:11434): ');
      const model = await question('Модель (Enter = llama2): ');
      
      envContent += `# Ollama Configuration
OLLAMA_ENDPOINT=${endpoint.trim() || 'http://localhost:11434'}
LLM_PROVIDER=ollama
LLM_MODEL=${model.trim() || 'llama2'}
`;
      break;
    }

    case '4': {
      console.log('\n🧠 Anthropic (Claude) Setup');
      console.log('Получи ключ: https://console.anthropic.com/\n');
      
      const apiKey = await question('Anthropic API Key (или Enter для пропуска): ');
      
      if (apiKey.trim()) {
        envContent += `# Anthropic Configuration
ANTHROPIC_API_KEY=${apiKey.trim()}
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-haiku-20240307
`;
      } else {
        envContent += `# Anthropic Configuration (настрой позже)
# ANTHROPIC_API_KEY=sk-ant-your-key-here
# LLM_PROVIDER=anthropic
# LLM_MODEL=claude-3-haiku-20240307
`;
      }
      break;
    }

    default:
      console.log('\n❌ Неверный выбор. Используй .env.example для ручной настройки.');
      rl.close();
      return;
  }

  // Write .env file
  try {
    await fs.writeFile(envPath, envContent, 'utf-8');
    console.log('\n✅ Конфигурация сохранена в .env');
  } catch (error) {
    console.error('\n❌ Ошибка при сохранении .env:', error);
    rl.close();
    return;
  }

  // Determine provider and model based on choice
  let provider = 'openai';
  let model = 'gpt-3.5-turbo';
  
  if (choice === '1') {
    provider = 'openrouter';
    model = 'openai/gpt-3.5-turbo';
  } else if (choice === '3') {
    provider = 'ollama';
    model = 'llama2';
  } else if (choice === '4') {
    provider = 'anthropic';
    model = 'claude-3-haiku-20240307';
  }

  // Create first agent
  await createAgent(provider, model);

  console.log('\n🎉 Onboarding завершен!\n');
  console.log('Следующие шаги:');
  console.log('1. Запусти backend:');
  console.log('   npm run dev\n');
  console.log('2. В другом терминале запусти frontend:');
  console.log('   cd ../frontend && npm run dev\n');
  console.log('3. Открой браузер: http://localhost:3000\n');

  rl.close();
}

main().catch((error) => {
  console.error('❌ Ошибка:', error);
  rl.close();
  process.exit(1);
});
