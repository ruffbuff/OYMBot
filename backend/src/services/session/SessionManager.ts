import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export interface SessionKey {
  channel: 'telegram' | 'web' | 'cli' | 'whatsapp' | 'discord';
  userId: string;
  agentId: string;
}

export interface Session {
  sessionKey: string;
  channel: SessionKey['channel'];
  userId: string;
  agentId: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionsFile: string;

  constructor(agentsDir?: string) {
    const baseDir = agentsDir || path.join(process.cwd(), 'agents');
    this.sessionsFile = path.join(baseDir, '.sessions.json');
    this.loadSessionsFromDisk();
  }

  /**
   * Load sessions from disk
   */
  private async loadSessionsFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.sessionsFile, 'utf-8');
      const sessionsData = JSON.parse(data);
      
      for (const [key, value] of Object.entries(sessionsData)) {
        const session = value as any;
        this.sessions.set(key, {
          ...session,
          createdAt: new Date(session.createdAt),
          lastActivity: new Date(session.lastActivity),
        });
      }
      
      logger.info(`Loaded ${this.sessions.size} sessions from disk`);
    } catch (error) {
      // File doesn't exist or is invalid - start fresh
      logger.info('No existing sessions file, starting fresh');
    }
  }

  /**
   * Save sessions to disk
   */
  private async saveSessionsToDisk(): Promise<void> {
    try {
      const sessionsData: Record<string, Session> = {};
      for (const [key, value] of this.sessions.entries()) {
        sessionsData[key] = value;
      }
      
      await fs.writeFile(this.sessionsFile, JSON.stringify(sessionsData, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Failed to save sessions to disk:', error);
    }
  }

  /**
   * Generate session key from components
   * Format: "channel:userId:agentId"
   * Examples:
   * - "telegram:123456:mainaiagnet"
   * - "web:user1:mainaiagnet"
   * - "cli:local:mainaiagnet"
   */
  static generateSessionKey(channel: SessionKey['channel'], userId: string, agentId: string): string {
    return `${channel}:${userId}:${agentId}`;
  }

  /**
   * Parse session key into components
   */
  static parseSessionKey(sessionKey: string): SessionKey | null {
    const parts = sessionKey.split(':');
    if (parts.length !== 3) {
      logger.error(`Invalid session key format: ${sessionKey}`);
      return null;
    }

    const [channel, userId, agentId] = parts;
    
    if (!['telegram', 'web', 'cli', 'whatsapp', 'discord'].includes(channel)) {
      logger.error(`Invalid channel in session key: ${channel}`);
      return null;
    }

    return {
      channel: channel as SessionKey['channel'],
      userId,
      agentId,
    };
  }

  /**
   * Get or create session
   */
  getOrCreateSession(channel: SessionKey['channel'], userId: string, agentId: string): Session {
    const sessionKey = SessionManager.generateSessionKey(channel, userId, agentId);
    
    let session = this.sessions.get(sessionKey);
    
    if (!session) {
      session = {
        sessionKey,
        channel,
        userId,
        agentId,
        createdAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
      };
      
      this.sessions.set(sessionKey, session);
      logger.info(`✅ Created new session: ${sessionKey}`);
      this.saveSessionsToDisk(); // Persist to disk
    } else {
      // Update last activity
      session.lastActivity = new Date();
    }
    
    return session;
  }

  /**
   * Get session by key
   */
  getSession(sessionKey: string): Session | undefined {
    return this.sessions.get(sessionKey);
  }

  /**
   * Update session activity
   */
  updateSessionActivity(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.lastActivity = new Date();
      session.messageCount++;
      this.saveSessionsToDisk(); // Persist to disk
    }
  }

  /**
   * Get all sessions for an agent
   */
  getAgentSessions(agentId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      session => session.agentId === agentId
    );
  }

  /**
   * Get all sessions for a channel
   */
  getChannelSessions(channel: SessionKey['channel']): Session[] {
    return Array.from(this.sessions.values()).filter(
      session => session.channel === channel
    );
  }

  /**
   * Get all active sessions (activity in last 24 hours)
   */
  getActiveSessions(): Session[] {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return Array.from(this.sessions.values()).filter(
      session => session.lastActivity > oneDayAgo
    );
  }

  /**
   * Clear session
   */
  clearSession(sessionKey: string): boolean {
    const deleted = this.sessions.delete(sessionKey);
    if (deleted) {
      logger.info(`Cleared session: ${sessionKey}`);
      this.saveSessionsToDisk(); // Persist to disk
    }
    return deleted;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}
