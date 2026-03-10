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
- [ ] **Tool Policies System**: Layered policies (global → agent → group → sandbox)
  - [ ] Tool groups (group:fs, group:runtime, group:network)
  - [ ] Per-agent tool allowlist/denylist
  - [ ] Per-channel tool restrictions
  - [ ] Dangerous command confirmation
- [ ] **Sandboxed Execution**: Workspace isolation for file operations
  - [ ] Restrict file access to workspace by default
  - [ ] Whitelist for absolute paths
  - [ ] Safe shell command execution
- [ ] **Telegram Whitelist**: Restrict access by User ID
- [ ] **Rate Limiting**: Prevent abuse

### Plugin System
- [ ] **Plugin Architecture**: Hook-based extensibility (like OpenClaw)
  - [ ] before_tool_call / after_tool_call hooks
  - [ ] before_agent_start / agent_end hooks
  - [ ] message_received / message_sent hooks
  - [ ] Plugin registry and loader
- [ ] **Plugin Tools**: Plugins can register custom tools
- [ ] **Plugin Commands**: Plugins can add custom commands

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
- [ ] **Advanced Context Control**: Token-aware manager for different model windows
- [ ] **Memory Compaction**: Automatic summarization of old memories
- [ ] **Memory Flush**: Save important context before compaction

### Skills System
- [ ] **Skills Architecture**: Reusable prompt templates
  - [ ] Workspace skills (workspace/skills/)
  - [ ] Global skills (~/.oym-bot/skills/)
  - [ ] Skill loading and injection
- [ ] **Skill Marketplace**: Browse and install community skills

### Multi-Agent
- [ ] **Subagents**: Spawn child agents for subtasks
  - [ ] sessions_spawn tool
  - [ ] sessions_send tool
  - [ ] sessions_list tool
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
- Tool Policies (security)
- Plugin System (extensibility)
- Sandboxed Execution
- Skills System
- Subagents
- Browser Tool
- Advanced TUI

### Future Goals 🚀
- All critical features
- Production-ready security
- Full documentation
- Testing suite

## 🐛 Known Issues
- [ ] TypeScript errors in some files (need npm install)
- [ ] Session persistence could be improved
- [ ] Error handling in planner needs work
- [ ] Tool execution timeout handling
- [ ] **Memory Flush not implemented**: Agents don't save context before compaction
- [ ] **No vector embeddings**: Only basic text search available
- [ ] **No memory compaction**: Old logs accumulate without summarization

## 💡 Ideas for Future
- Agent-to-agent communication protocol
- Distributed agent network
- Agent memory sharing
- Agent specialization (coding, writing, research)
- Integration with external AI services
- Mobile app for agent management
