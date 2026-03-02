---
id: example-agent
name: ExampleAgent
type: api-assistant
status: idle
energy: 100
version: 1.0.0
created: 2024-01-01T00:00:00.000Z
updated: 2024-01-01T00:00:00.000Z
llm:
  provider: openrouter
  model: openai/gpt-3.5-turbo
  temperature: 0.7
  maxTokens: 2000
skills:
  - conversation
  - help
  - analysis
  - file_operations
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
telegram:
  token: YOUR_TELEGRAM_BOT_TOKEN_HERE
  enabled: false
capabilities:
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
