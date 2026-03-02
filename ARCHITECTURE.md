# 🏗 AI Office Platform - Architecture

## Философия

Создаем **file-first** систему как OpenClaw, где:
- Все данные в markdown файлах (не БД)
- Агент может читать и модифицировать свою конфигурацию
- Система может улучшать саму себя
- Прозрачность и простота

## Структура Агента

```
backend/agents/<agent-id>/
├── AGENT.md              # Конфигурация агента (YAML frontmatter)
├── SOUL.md               # Личность и характер агента
├── MEMORY.md             # Долгосрочная память (факты, предпочтения)
├── CONTEXT.md            # Текущая сессия (последние N сообщений)
├── TOOLS.md              # Доступные тулы и их конфигурация
├── memory/               # Дополнительные файлы памяти
│   ├── facts.md          # Важные факты
│   ├── preferences.md    # Предпочтения пользователя
│   └── decisions.md      # Принятые решения
└── sessions/             # История сессий
    ├── transcript-2026-03-02.jsonl  # Транскрипт дня
    └── rotated-2026-03-02T10-30-00.md  # Ротированный контекст
```

## AGENT.md - Главный файл конфигурации

```yaml
---
id: myagent
name: MyAgent
version: 1.0.0
created: 2026-03-02T10:00:00Z
updated: 2026-03-02T15:30:00Z

# LLM Configuration
llm:
  provider: openrouter
  model: openai/gpt-3.5-turbo
  temperature: 0.7
  maxTokens: 2000
  fallbacks:
    - provider: openai
      model: gpt-4
    - provider: ollama
      model: llama2

# Tools Configuration
tools:
  enabled:
    - read_file
    - write_file
    - list_directory
    - web_search
    - execute_command
  disabled:
    - delete_file
  config:
    web_search:
      timeout: 30000
      maxContentLength: 10000
    execute_command:
      allowedCommands:
        - npm
        - git
        - ls
      workingDirectory: /workspace

# Skills (будущее - как в OpenClaw)
skills:
  - conversation
  - coding
  - analysis
  - file_operations

# Memory Configuration
memory:
  enabled: true
  vectorSearch: false  # Будущее
  maxContextSize: 50000
  rotationThreshold: 45000
  retentionDays: 30

# Platform Integrations
telegram:
  token: "123456:ABC-DEF..."
  enabled: true
  allowedUsers: []  # Пусто = все
  
whatsapp:
  enabled: false
  
discord:
  token: ""
  enabled: false

# Capabilities
capabilities:
  - text_generation
  - code_generation
  - web_browsing
  - file_operations
  - self_modification  # Может менять свою конфигурацию!

# Permissions
permissions:
  canModifyConfig: true
  canModifyMemory: true
  canExecuteCommands: false
  canAccessNetwork: true
  canModifyFiles: true
  workspaceRoot: ./

# Metadata
metadata:
  purpose: "AI assistant for development and automation"
  owner: "user@example.com"
  tags:
    - development
    - automation
    - assistant
---

# Agent Configuration

This agent is configured for development and automation tasks.

## Personality

See SOUL.md for detailed personality configuration.

## Usage

- Telegram: @myagent_bot
- Web: http://localhost:3000
```

## SOUL.md - Личность агента

```markdown
# Agent Soul - MyAgent

## Core Identity

I am MyAgent, an AI assistant focused on development and automation.

## Personality Traits

- **Professional**: Clear, concise communication
- **Proactive**: Anticipate needs and suggest improvements
- **Curious**: Ask clarifying questions when needed
- **Helpful**: Always try to find solutions
- **Honest**: Admit when I don't know something

## Communication Style

- Use technical language when appropriate
- Provide examples and code snippets
- Break down complex topics
- Ask for feedback

## Values

- **Transparency**: Always explain my reasoning
- **Privacy**: Respect user data and confidentiality
- **Quality**: Strive for accurate, well-tested solutions
- **Learning**: Continuously improve from interactions

## Boundaries

- I don't execute dangerous commands without confirmation
- I don't modify critical files without explicit permission
- I ask for clarification when instructions are ambiguous
- I respect user preferences and working style
```

## MEMORY.md - Долгосрочная память

```markdown
# Long-term Memory

## User Preferences

### Communication
- Prefers concise responses
- Likes code examples
- Works in timezone: UTC+3

### Development
- Primary language: TypeScript
- Preferred framework: Next.js
- Code style: ESLint + Prettier

## Important Facts

### Project: AI Office Platform
- Repository: github.com/user/aipanel
- Stack: Next.js + Express + Socket.io
- Architecture: File-first, inspired by OpenClaw
- Started: 2026-03-01

### Decisions Made

#### 2026-03-02: Architecture Choice
- Chose file-first approach over database
- Reason: Transparency, simplicity, self-modification capability
- Files: AGENT.md, MEMORY.md, CONTEXT.md, sessions/*.jsonl

#### 2026-03-02: 1 Agent = 1 Bot
- Each agent has its own Telegram/WhatsApp/Discord bot
- Token stored in AGENT.md
- Allows independent scaling and management

## Learned Patterns

### User Working Style
- Prefers to test incrementally
- Likes to understand architecture before implementation
- Values clean, maintainable code

### Common Tasks
- Building AI agents
- Integrating messaging platforms
- File operations and automation
```

## TOOLS.md - Конфигурация тулов

```markdown
# Available Tools

## File Operations

### read_file
**Status**: ✅ Enabled
**Description**: Read contents of a file
**Parameters**:
- `path` (string): File path relative to workspace

### write_file
**Status**: ✅ Enabled
**Description**: Write content to a file
**Parameters**:
- `path` (string): File path
- `content` (string): Content to write

### list_directory
**Status**: ✅ Enabled
**Description**: List files in a directory
**Parameters**:
- `path` (string): Directory path

## Web Operations

### web_search
**Status**: ✅ Enabled
**Description**: Fetch content from a URL
**Configuration**:
- Timeout: 30s
- Max content: 10KB
**Parameters**:
- `query` (string): URL to fetch

## Command Execution

### execute_command
**Status**: ❌ Disabled
**Description**: Execute shell commands
**Security**: Requires explicit permission
**Allowed commands**: npm, git, ls

## Future Tools

### memory_search
**Status**: 🔮 Planned
**Description**: Semantic search in memory files

### code_analysis
**Status**: 🔮 Planned
**Description**: Analyze code structure and quality

### git_operations
**Status**: 🔮 Planned
**Description**: Git commit, push, pull, branch operations
```

## Session Management

### JSONL Transcript Format

```jsonl
{"type":"message","timestamp":"2026-03-02T10:00:00Z","message":{"role":"user","content":"Hello"}}
{"type":"message","timestamp":"2026-03-02T10:00:01Z","message":{"role":"assistant","content":"Hi!"}}
{"type":"tool_use","timestamp":"2026-03-02T10:00:05Z","tool":"read_file","params":{"path":"README.md"}}
{"type":"tool_result","timestamp":"2026-03-02T10:00:06Z","tool":"read_file","result":"# Project..."}
{"type":"context_rotation","timestamp":"2026-03-02T10:30:00Z","reason":"size_limit","oldSize":52000,"newSize":5000}
```

### Context Rotation

Когда CONTEXT.md превышает 50KB:
1. Сохранить полный контекст в `sessions/rotated-<timestamp>.md`
2. Очистить CONTEXT.md
3. Оставить только последние 10 сообщений
4. Записать событие в транскрипт

## Memory System (Future)

### Vector Search
- Индексация MEMORY.md и memory/*.md
- Семантический поиск по истории
- Автоматическое извлечение важных фактов

### Auto-Memory
- Автоматически сохранять важные факты в MEMORY.md
- Извлекать предпочтения пользователя
- Запоминать принятые решения

## Self-Modification

Агент может модифицировать свою конфигурацию через специальные команды:

### /config set <key> <value>
Изменить настройку в AGENT.md

### /tools enable <tool>
Включить тул

### /tools disable <tool>
Выключить тул

### /memory add <fact>
Добавить факт в MEMORY.md

### /soul update <trait>
Обновить личность в SOUL.md

## Security

### Permissions Model
- `canModifyConfig`: Может менять AGENT.md
- `canModifyMemory`: Может менять MEMORY.md
- `canExecuteCommands`: Может выполнять shell команды
- `canAccessNetwork`: Может делать HTTP запросы
- `canModifyFiles`: Может менять файлы в workspace

### Workspace Isolation
- Агент работает только в своем workspace
- Не может выйти за пределы workspaceRoot
- Все пути проверяются на безопасность

## API для агента

Агент имеет доступ к специальным тулам для самомодификации:

```typescript
// Чтение своей конфигурации
const config = await tools.self_config_read();

// Обновление конфигурации
await tools.self_config_update({
  llm: {
    temperature: 0.8
  }
});

// Добавление в память
await tools.self_memory_append({
  type: 'fact',
  content: 'User prefers TypeScript over JavaScript'
});

// Чтение памяти
const memory = await tools.self_memory_read();

// Поиск в памяти (будущее)
const results = await tools.self_memory_search({
  query: 'user preferences'
});
```

## Roadmap

### Phase 1: Core (Current)
- ✅ File-first architecture
- ✅ AGENT.md, MEMORY.md, CONTEXT.md
- ✅ JSONL transcripts
- ✅ Basic tools (file, web)
- ✅ Telegram integration
- ✅ Commands system

### Phase 2: Memory (Next)
- ⏳ Vector search in memory
- ⏳ Auto-memory extraction
- ⏳ Semantic search in history
- ⏳ SOUL.md, TOOLS.md implementation

### Phase 3: Self-Modification
- 🔮 Self-config modification
- 🔮 Self-memory management
- 🔮 Self-improvement loops
- 🔮 Agent can update its own code

### Phase 4: Advanced
- 🔮 Skills system (like OpenClaw)
- 🔮 MCP servers integration
- 🔮 Multi-agent collaboration
- 🔮 Docker isolation
- 🔮 WhatsApp/Discord integration

## Comparison with OpenClaw

| Feature | OpenClaw | Our System | Status |
|---------|----------|------------|--------|
| File-first | ✅ | ✅ | Done |
| JSONL transcripts | ✅ | ✅ | Done |
| Memory system | ✅ Vector | ⏳ Basic | In Progress |
| Skills | ✅ | 🔮 | Planned |
| MCP | ✅ | 🔮 | Planned |
| Self-modification | ❌ | ✅ | Unique! |
| Multi-platform | ✅ | ⏳ | Telegram done |
| Docker isolation | ✅ | 🔮 | Planned |

## Why This Architecture?

1. **Transparency**: All data in readable files
2. **Simplicity**: No database, no complex setup
3. **Self-improvement**: Agent can modify itself
4. **Debugging**: Easy to inspect and fix
5. **Portability**: Just copy the agents/ folder
6. **Version Control**: Can git commit agent state
7. **Collaboration**: Multiple agents can work together
8. **Learning**: Agent learns from its own history
