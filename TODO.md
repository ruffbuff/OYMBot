# 🎯 TODO: Project Roadmap

This file tracks the major milestones for turning this project into a robust, secure, and user-friendly platform for AI agents.

## 🏛️ Core Architecture
- [ ] **Memory Architecture**: Finalize the long-term memory system. Implement vector-based search (like in ZeroClaw) for more efficient context retrieval.
- [ ] **Config Logic**: Improve the agent configuration (`AGENT.md`) to be more modular and secure, separating secrets from public settings.
- [ ] **Context Control**: Implement a token-aware context manager that truncates conversations based on the selected model's context window size (e.g., 4k, 8k, 128k).

## 🖥️ CLI / TUI
- [ ] **Ink TUI**: Replace the simple `chat.ts` with a full-featured Terminal User Interface (TUI) using Ink and React. It should display agent status, logs, and verbose steps in real-time.
- [ ] **Advanced Onboarding**: Enhance the `onboard` process within the new TUI to allow easy switching between models and providers without manual file edits.

## 📦 Installation & Distribution
- [ ] **Installers**: Create native installers for macOS and Windows to simplify the setup process for non-technical users.

## 🧩 Extensibility (Skills & Integrations)
- [ ] **Skill System**: Develop a formal "skill" system where new toolsets can be added to agents as plugins, similar to IronClaw's WASM or OpenClaw's extensions.
- [ ] **Firecrawl Integration**: Add Firecrawl as a powerful tool for web scraping and internet research.
- [ ] **App Integrations**: Add skills for interacting with popular applications like Notion and Obsidian.

## 🔐 Security & Access Control
- [ ] **Telegram User Whitelist**: Add an option in `AGENT.md` to specify a list of allowed Telegram user IDs, restricting bot access to only authorized users.
