# 🎯 TODO: Project Roadmap

## ✅ Completed
- [x] **Basic Gateway & Runtime**
- [x] **Context Control**: Session-aware context implemented
- [x] **Basic Blessed TUI**: Chat and thoughts panels (improved text wrapping)
- [x] **Basic Tool System**: File access, shell exec, web search, codebase search
- [x] **Fix CLI Session Creation**: CLI sessions registered in Gateway
- [x] **Robust Tool Parsing**: Agent JSON parsing fixed
- [x] **Frontend Session Selection**: Web UI picks existing sessions
- [x] **Unified CLI**: Single `npm run chat` command
- [x] **Autonomous Planner**: Architect + Engineer mode for complex tasks
- [x] **Hot-reload**: Auto-reload AGENT.md on changes
- [x] **Full FS Access**: Absolute paths, relative paths, ~ support
- [x] **SOUL.md Integration**: Personality loaded into system prompt
- [x] **Advanced Memory System**: Two-layer memory with search capabilities
  - [x] Daily logs (memory/*.md) with auto-logging
  - [x] Memory search (search_memory, search_sessions, get_recent_activity)
  - [x] Auto-search memory for relevant questions
  - [x] Improved system prompts with mandatory memory instructions
- [x] **Agent Startup Validation**: Gateway won't start without agents
- [x] **TOOLS.md Auto-generation**: Documentation created during onboarding

## 🔴 Critical (Must Have)

### Security & Safety
- [x] **Tool Policies System**: Layered policies (global → agent → group → sandbox)
  - [x] Tool groups (group:fs, group:runtime, group:network)
  - [x] Per-agent tool allowlist/denylist
  - [x] Per-channel tool restrictions
  - [x] Dangerous command confirmation
- [x] **Sandboxed Execution**: Workspace isolation for file operations
  - [x] Restrict file access to workspace by default
  - [x] Whitelist for absolute paths
  - [x] Safe shell command execution
- [x] **Telegram Whitelist**: Restrict access by User ID + Pair Codes
- [x] **Rate Limiting**: Prevent abuse (Message throttling)

### Plugin System
- [x] **Plugin Architecture**: Hook-based extensibility (like OpenClaw)
  - [x] before_tool_call / after_tool_call hooks
  - [x] before_agent_start / agent_end hooks
  - [x] message_received / message_sent hooks
  - [x] Plugin registry and loader
- [x] **Plugin Tools**: Plugins can register custom tools
- [x] **Plugin Commands**: Plugins can add custom commands

## 🟡 Important (Should Have)

### Memory & Context
- [x] **Memory Search**: Semantic search in MEMORY.md + memory/*.md
  - [x] search_memory tool
  - [x] search_sessions tool
  - [x] get_recent_activity tool
  - [x] Auto-search for relevant questions
  - [ ] Vector embeddings (optional, for semantic search)
- [x] **Daily Memory Logs**: Automatic memory/YYYY-MM-DD.md files
- [x] **Auto-logging**: Automatic logging of user requests and task completions
- [x] **Advanced Context Control**: Token-aware manager for different model windows
- [x] **Memory Compaction**: Automatic summarization of old memories
- [x] **Memory Flush**: Save important context before compaction

### Skills System
- [x] **Skills Architecture**: Reusable prompt templates
  - [x] Workspace skills (workspace/skills/)
  - [x] Global skills (~/.oym-bot/skills/)
  - [x] Skill loading and injection
- [ ] **Skill Marketplace**: Browse and install community skills

### Multi-Agent
- [x] **Subagents**: Spawn child agents for subtasks (Implemented via `delegate_task` tool)
- [ ] **Agent Routing**: Route messages to different agents
- [ ] **Agent Collaboration**: Agents can work together

### Advanced Tools
- [ ] **Browser Tool**: Headless browser control (Playwright/Puppeteer)
- [ ] **Firecrawl Integration**: Better web scraping
- [ ] **App Integrations**: Notion, Obsidian, Linear
- [ ] **Image Generation**: DALL-E, Stable Diffusion
- [ ] **TTS/STT**: Voice input/output

## 🟢 Nice to Have (Could Have)

### UI/UX
- [ ] **Advanced TUI**: Real-time resource monitoring (RAM/CPU)
- [ ] **Model Selection in TUI**: Switch models on the fly
- [ ] **CLI Onboarding**: Improved UX with better prompts
- [ ] **Web UI Improvements**: 
  - [ ] Plan visualization
  - [ ] Tool execution timeline
  - [ ] Agent status dashboard

### Infrastructure
- [ ] **Cron Jobs**: Scheduled tasks
- [ ] **Webhooks**: External integrations
- [ ] **API Gateway**: REST API for external access
- [ ] **Docker Support**: Containerized deployment
- [ ] **Cloud Deployment**: Deploy to cloud providers

### Channels
- [ ] **Discord Integration**
- [ ] **Slack Integration**
- [ ] **WhatsApp Integration**
- [ ] **Signal Integration**
- [ ] **iMessage Integration** (macOS only)

### Developer Experience
- [ ] **Testing Suite**: Unit and integration tests
- [ ] **Documentation**: API docs, architecture docs
- [ ] **Examples**: Sample agents and use cases
- [ ] **Debugging Tools**: Better logging and tracing

## 🎨 Unique Features (Our Differentiators)

### Already Implemented ✅
- [x] **Autonomous Planner**: Break down complex tasks automatically
- [x] **Visual Office**: Mini-game interface for agent management
- [x] **Dual Mode**: Reactive (simple) + Planner (complex)
- [x] **Hot-reload**: Live config updates

### Planned 🚀
- [ ] **Agent Personalities**: Rich personality system beyond SOUL.md
- [ ] **Learning System**: Agents learn from interactions
- [ ] **Workflow Builder**: Visual workflow creation
- [ ] **Agent Marketplace**: Share and discover agents
- [ ] **Collaborative Agents**: Multiple agents working on same task

## 📊 Development Status

### Current Features ✅
- Autonomous Planner
- Full FS access
- SOUL.md integration
- Hot-reload
- Advanced Memory System
- Agent startup validation
- TOOLS.md auto-generation
- CLI text wrapping improvements

### Next Priorities 🔄
- Agent Routing
- Browser Tool
- Advanced TUI

### Future Goals 🚀
- All critical features
- Production-ready security
- Full documentation
- Testing suite

## 🐛 Known Issues & Bugs
- [ ] TypeScript errors in some files (need npm install)
- [x] Session persistence could be improved (Save active connections to SQLite)
- [x] Error handling in planner needs work (Loop prevention mechanisms)
- [x] Tool execution timeout handling (Plugin blocking can stall execution)
- [x] **Dangerous Action Leak**: `ToolManager` stores pending hashes forever if unused; needs a TTL/cleanup mechanism.
- [x] **Memory Flush not implemented**: Agents don't save context before compaction
- [ ] **No vector embeddings**: Only basic text search available
- [x] **No memory compaction**: Old logs accumulate without summarization

## 💡 Ideas for Future & Improvements
- **Mission Control Panel**: Comprehensive frontend dashboard covering all agents, models, memory logs, and tasks.
- **Top-Down Agent Visualizer**: React/Web renderer in frontend showing agents as workers (working/resting/sleeping) in a facility.
- [x] **System Heartbeat & Cron jobs**: Recurring tasks, health-checking agents, and waking them up via scheduling.
- Plugin installation from NPM / Git (Like OpenClaw's plugin marketplace)
- [x] SQLite Auto-pruning for logs older than 30 days
- Multi-Agent "Orchestrator" Agent template (Specialized in breaking down and spawning child agents)
- Agent-to-agent communication protocol
- Distributed agent network
- Agent memory sharing
- Agent specialization (coding, writing, research)
- Integration with external AI services
- Mobile app for agent management
