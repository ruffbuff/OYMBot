# 🎯 TODO: Project Roadmap

## 🏛️ Core Architecture
- [x] **Basic Gateway & Runtime**
- [ ] **Memory Architecture**: Finalize the long-term memory system. Implement vector-based search (like in ZeroClaw).
- [ ] **Config Logic**: Improve the agent configuration (`AGENT.md`).
- [x] **Context Control**: Basic session-aware context implemented.
- [ ] **Advanced Context Control**: Implement token-aware manager for different model windows.

## 🖥️ CLI / TUI
- [x] **Basic Blessed TUI**: Implemented with chat and thoughts panels.
- [ ] **Advanced TUI**: Add real-time resource monitoring (RAM/CPU) and model selection.
- [ ] **CLI Onboarding**: Improve the onboarding UX.

## 🧩 Extensibility
- [x] **Basic Tool System**: File access, shell exec, web search.
- [ ] **Firecrawl Integration**: For better web scraping.
- [ ] **App Integrations**: Notion, Obsidian.

## 🔐 Security
- [ ] **Telegram Whitelist**: Restrict access by User ID.
- [ ] **Sandboxed Exec**: More secure way to run shell commands.

## 🛠️ Current Bugfix Tasks
- [x] **Fix CLI Session Creation**: Ensure CLI sessions are registered in Gateway.
- [x] **Robust Tool Parsing**: Fix agent sending raw JSON to chat.
- [x] **Frontend Session Selection**: Allow Web UI to pick existing sessions.
- [x] **Unified CLI**: Move to a single `npm run chat` command.
