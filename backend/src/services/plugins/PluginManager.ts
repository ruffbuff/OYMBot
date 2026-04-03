import fs from 'fs/promises';
import path from 'path';
import { AgentConfig } from '../../types/agent.js';
import { Tool, ToolManager } from '../tools/ToolManager.js';
import { Command, CommandManager } from '../commands/CommandManager.js';
import { logger } from '../../utils/logger.js';

export interface PluginContext {
    agentId: string;
    agent?: AgentConfig;
    sessionKey?: string;
    [key: string]: any;
}

export interface Plugin {
    name: string;
    version: string;
    description: string;

    // Hooks
    beforeAgentStart?: (context: PluginContext) => Promise<void>;
    agentEnd?: (context: PluginContext) => Promise<void>;

    messageReceived?: (message: string, context: PluginContext) => Promise<string | void>;
    messageSent?: (message: string, context: PluginContext) => Promise<string | void>;

    beforeToolCall?: (toolName: string, params: any, context: PluginContext) => Promise<boolean | void>;
    afterToolCall?: (toolName: string, params: any, result: string, context: PluginContext) => Promise<string | void>;

    // Extensions
    tools?: Tool[];
    commands?: Command[];
}

export class PluginManager {
    private plugins: Map<string, Plugin> = new Map();
    private toolManager: ToolManager;
    private commandManager: CommandManager;

    constructor(toolManager: ToolManager, commandManager: CommandManager) {
        this.toolManager = toolManager;
        this.commandManager = commandManager;
    }

    async loadPlugins(pluginsDir: string = './plugins'): Promise<void> {
        try {
            await fs.access(pluginsDir);
        } catch {
            // Create if doesn't exist
            await fs.mkdir(pluginsDir, { recursive: true });
            return;
        }

        try {
            const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() || entry.name.endsWith('.js')) {
                    try {
                        const pluginPath = path.resolve(pluginsDir, entry.name);
                        const pluginModule = await import(pluginPath);
                        const plugin: Plugin = pluginModule.default || pluginModule.plugin;

                        if (plugin && plugin.name) {
                            this.registerPlugin(plugin);
                        }
                    } catch (error) {
                        logger.error(`Error loading plugin ${entry.name}:`, error);
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to read plugins directory:', error);
        }
    }

    public registerPlugin(plugin: Plugin): void {
        logger.info(`Registering plugin: ${plugin.name} v${plugin.version}`);
        this.plugins.set(plugin.name, plugin);

        // Register extensions
        if (plugin.tools) {
            for (const tool of plugin.tools) {
                this.toolManager.registerTool(tool);
                logger.info(`  - Registered tool: ${tool.name}`);
            }
        }

        if (plugin.commands) {
            for (const command of plugin.commands) {
                this.commandManager.registerCommand(command);
                logger.info(`  - Registered command: ${command.name}`);
            }
        }
    }

    // --- Hook Executors ---

    public async executeBeforeAgentStart(context: PluginContext): Promise<void> {
        for (const plugin of this.plugins.values()) {
            if (plugin.beforeAgentStart) {
                try {
                    await plugin.beforeAgentStart(context);
                } catch (e: any) {
                    logger.error(`Plugin ${plugin.name} error in beforeAgentStart:`, e);
                }
            }
        }
    }

    public async executeMessageReceived(message: string, context: PluginContext): Promise<string> {
        let finalMessage = message;
        for (const plugin of this.plugins.values()) {
            if (plugin.messageReceived) {
                try {
                    const modified = await plugin.messageReceived(finalMessage, context);
                    if (modified !== undefined && modified !== null) {
                        finalMessage = modified as string;
                    }
                } catch (e: any) {
                    logger.error(`Plugin ${plugin.name} error in messageReceived:`, e);
                }
            }
        }
        return finalMessage;
    }

    public async executeMessageSent(message: string, context: PluginContext): Promise<string> {
        let finalMessage = message;
        for (const plugin of this.plugins.values()) {
            if (plugin.messageSent) {
                try {
                    const modified = await plugin.messageSent(finalMessage, context);
                    if (modified !== undefined && modified !== null) {
                        finalMessage = modified as string;
                    }
                } catch (e: any) {
                    logger.error(`Plugin ${plugin.name} error in messageSent:`, e);
                }
            }
        }
        return finalMessage;
    }

    public async executeBeforeToolCall(toolName: string, params: any, context: PluginContext): Promise<boolean> {
        for (const plugin of this.plugins.values()) {
            if (plugin.beforeToolCall) {
                try {
                    const allowed = await plugin.beforeToolCall(toolName, params, context);
                    if (allowed === false) {
                        logger.warn(`Plugin ${plugin.name} prevented tool call: ${toolName}`);
                        return false;
                    }
                } catch (e: any) {
                    logger.error(`Plugin ${plugin.name} error in beforeToolCall:`, e);
                }
            }
        }
        return true;
    }

    public async executeAfterToolCall(toolName: string, params: any, result: string, context: PluginContext): Promise<string> {
        let finalResult = result;
        for (const plugin of this.plugins.values()) {
            if (plugin.afterToolCall) {
                try {
                    const modified = await plugin.afterToolCall(toolName, params, finalResult, context);
                    if (modified !== undefined && modified !== null) {
                        finalResult = modified as string;
                    }
                } catch (e: any) {
                    logger.error(`Plugin ${plugin.name} error in afterToolCall:`, e);
                }
            }
        }
        return finalResult;
    }
}
