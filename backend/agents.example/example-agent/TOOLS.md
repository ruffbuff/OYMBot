# Available Tools

This agent has access to the following tools:

## File System
- **read_file** - Read contents of any file (supports absolute, relative, and ~ paths)
- **write_file** - Create or modify files (protected from overwriting agent config files)
- **list_directory** - List files and directories in a path
- **get_file_tree** - Get recursive directory structure (tree view)
- **get_working_directory** - Get current directory

## Execution
- **shell_exec** - Execute shell commands

## Web & Search
- **search_web** - Search internet using DuckDuckGo
- **scrape_website** - Deeply scrape a website to get its full text content
- **search_files** - Search for text patterns inside files in the project
- **search_codebase** - Search for patterns in codebase using grep

## Memory & Learning
- **remember_fact** - Save important information to long-term memory (MEMORY.md)
- **log_daily** - Log today's actions and decisions to daily log (memory/YYYY-MM-DD.md)
- **search_memory** - Search through long-term memory and daily logs
- **search_sessions** - Search through past conversation sessions
- **get_recent_activity** - Get summary of recent activity from daily logs
- **update_skills** - Add new skills to agent configuration

## Tool Usage Format

Tools are called using JSON format:
```json
{"tool": "tool_name", "params": {"key": "value"}}
```

## Examples

### File Operations
```json
{"tool": "read_file", "params": {"path": "./README.md"}}
{"tool": "write_file", "params": {"path": "./test.txt", "content": "Hello World"}}
{"tool": "list_directory", "params": {"path": "~/Desktop"}}
```

### Memory Operations
```json
{"tool": "remember_fact", "params": {"fact": "User prefers TypeScript over JavaScript"}}
{"tool": "log_daily", "params": {"entry": "Created new React project with TypeScript"}}
{"tool": "search_memory", "params": {"query": "React project"}}
```

### Web & Search
```json
{"tool": "search_web", "params": {"query": "Next.js documentation"}}
{"tool": "scrape_website", "params": {"url": "https://nextjs.org/docs"}}
{"tool": "search_files", "params": {"pattern": "useState", "directory": "./src"}}
```

### Execution
```json
{"tool": "shell_exec", "params": {"command": "npm install react"}}
{"tool": "get_file_tree", "params": {"path": "./src", "maxDepth": 2}}
```

## Tool Policies

- File operations are restricted from modifying agent configuration files (AGENT.md, MEMORY.md, etc.)
- Shell commands should be used carefully and with user confirmation for potentially dangerous operations
- Memory tools should be used proactively to maintain context across sessions
- Web scraping respects robots.txt and rate limits

## Memory System

The agent uses a two-layer memory system:

1. **Long-term Memory (MEMORY.md)**: Important facts, preferences, decisions that matter weeks/months later
2. **Daily Logs (memory/*.md)**: Today's actions, context, temporary notes

Use `remember_fact` for long-term information and `log_daily` for session-specific actions.

## Best Practices

- Always log important actions using `log_daily`
- Save user preferences with `remember_fact`
- Search memory before answering questions about past interactions
- Use appropriate file paths (absolute vs relative)
- Confirm dangerous operations with user
- Explain what you're doing when using tools