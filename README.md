# Open Your Mind Bot

A self-hosted, open-source platform for running autonomous AI agents. Inspired by OpenClaw, this project provides a robust backend, a visual frontend, and multi-channel support (CLI, Telegram).

## ✨ Features

- **Autonomous Agents**: Agents can execute multi-step tasks, use tools, and learn from their actions.
- **Advanced Memory System**: Two-layer memory (long-term + daily logs) with search capabilities, inspired by OpenClaw but improved.
- **Tooling**: Built-in tools for file system access (`read`, `write`, `exec`) and internet search.
- **Multi-Channel**: Interact with your agents via CLI, Telegram, or a web-based "Office" UI.
- **Extensible**: Easily add new agents and tools.
- **Real-time Monitoring**: A visual frontend and verbose CLI logging let you see your agent's thoughts and actions in real-time.

## 🚀 Getting Started

This project is divided into a `backend` (the agent gateway) and a `frontend` (the visual office).

### 1. Backend Setup

The backend runs the agent, manages sessions, and serves the API.

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Run the onboarding process to create your first agent
# This will ask for your AI provider keys and create a .env file.
npm run onboard

# 4. Start the gateway server (only works after onboarding)
# The server will run on http://localhost:4001
npm run gateway
```

**Important:** You must run `npm run onboard` before starting the gateway. The gateway will not start without at least one agent configured.

### 2. Interacting with Your Agent

You have three ways to chat with your agent:

**A) CLI Chat (Recommended for Power Users)**

For direct and fast interaction.

```bash
# In a new terminal, while the gateway is running:
cd backend
npm run chat
```

**B) Web UI (Visual Office)**

For a visual representation of your agents.

```bash
# In a new terminal:
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Your agent should appear in the office.

**C) Telegram**

If you configured a Telegram bot during onboarding, simply start a chat with your bot in the Telegram app.

## 🔧 How It Works

- **Agents**: Each agent is defined by a set of Markdown files in the `backend/agents/` directory (e.g., `AGENT.md`, `MEMORY.md`).
- **Memory System**: Two-layer architecture with long-term memory (MEMORY.md) and daily logs (memory/*.md). Agents can search through memory and past conversations. See [MEMORY_GUIDE.md](./MEMORY_GUIDE.md) for details.
- **Gateway**: A central Node.js server that handles WebSocket connections, API requests, and agent task execution.
- **Tools**: Agents can use tools like `shell_exec`, `search_web`, `write_file`, `search_memory`, and more to interact with the environment.
- **Sessions**: The system maintains separate conversation sessions for each channel (CLI, Web, Telegram).

##  roadmap

See [TODO.md](TODO.md) for the full project roadmap.

## 🤝 Contributing

This project is in active development. Contributions, issues, and feature requests are welcome!
