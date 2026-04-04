# Open Your Mind (OYM)

Self-hosted platform for running autonomous AI agents. Each agent has memory, tools, a personality, and can work across multiple channels — CLI, Telegram, browser.

## Stack

- **Backend** — Node.js + TypeScript, Express, Socket.io, SQLite
- **Frontend** — Next.js 14, Tailwind, Zustand (visual office, optional)
- **LLM** — OpenRouter, OpenAI, Anthropic, Ollama, Ollama Cloud

## Quick Start

```bash
cd backend
npm install
npm run onboard
```

Onboarding walks you through: agent name + personality, LLM provider + model (fetched live from API), optional Telegram + Firecrawl keys. After it finishes, the gateway starts automatically and you pick how to connect:

- **TUI** — terminal chat right there
- **Control UI** — opens browser at `http://localhost:4001`
- **Later** — gateway keeps running, connect manually

## Commands

```bash
npm run onboard     # first-time setup, creates agent + .env
npm run hatch       # start gateway + pick TUI or browser (skip onboarding)
npm run gateway     # start gateway only
npm run chat        # TUI chat (gateway must be running)
```

## How to Connect

| Interface | How |
|-----------|-----|
| TUI | `npm run chat` |
| Control UI (chat + settings) | `http://localhost:4001` |
| Visual Office (agent visualizer) | `cd frontend && npm run dev` → `http://localhost:3000` |
| Telegram | configure token during onboarding, bot starts with gateway |

## Agent Files

Each agent lives in `backend/agents/<id>/`:

| File | Purpose |
|------|---------|
| `AGENT.md` | Config — LLM, tools, skills, channels |
| `SOUL.md` | Personality and tone |
| `MEMORY.md` | Long-term facts (weeks/months) |
| `USER.md` | User profile, filled during bootstrap |
| `BOOTSTRAP.md` | First-run ritual — agent interviews user, then self-deletes |
| `TOOLS.md` | Tool reference for the agent |
| `memory/YYYY-MM-DD.md` | Daily activity log |
| `sessions/*.jsonl` | Conversation transcripts (source of truth) |

## Tools Available to Agents

**File system** — `read_file`, `write_file`, `list_directory`, `get_file_tree`, `search_files`, `search_codebase`  
**Shell** — `shell_exec`  
**Web** — `search_web`, `scrape_website`, `firecrawl_scrape`, `firecrawl_crawl`  
**Memory** — `remember_fact`, `log_daily`, `search_memory`, `search_sessions`, `get_recent_activity`  
**Multi-agent** — `delegate_task`, `ask_agent`, `broadcast_to_agents`  
**Scheduling** — `schedule_cron`

## In-chat Commands

```
/status          agent status + context usage
/model           show or change model: /model openrouter/gpt-4o
/clear           clear session context
/configure       show integration status: /configure show
/configure firecrawl <key>   set Firecrawl key live
/agents          list all agents
/switch <name>   switch to another agent
/help            all commands
```

## Environment Variables

```env
OPENROUTER_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_ENDPOINT=http://localhost:11434   # optional
FIRECRAWL_API_KEY=                       # optional
TELEGRAM_BOT_TOKEN=                      # optional
PORT=4001
AGENTS_DIR=./agents
```

## Roadmap

See [TODO.md](TODO.md).
