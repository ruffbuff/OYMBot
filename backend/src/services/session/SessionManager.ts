import { logger } from '../../utils/logger.js';
import { AgentPlan } from '../../types/agent.js';
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
  currentPlan?: AgentPlan; // Active plan for autonomous execution
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionsFile: string;

  constructor(agentsDir?: string) {
    const baseDir = agentsDir || path.join(process.cwd(), 'agents');
    this.sessionsFile = path.join(baseDir, '.sessions.json');
    this.loadSessionsFromDisk();
  }

  private async loadSessionsFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.sessionsFile, 'utf-8');
      const sessionsData = JSON.parse(data);
      for (const [key, value] of Object.entries(sessionsData)) {
        const s = value as any;
        this.sessions.set(key, { 
          ...s, 
          createdAt: new Date(s.createdAt), 
          lastActivity: new Date(s.lastActivity) 
        });
      }
      logger.info(`Loaded ${this.sessions.size} sessions from disk`);
    } catch (error) {
      logger.info('No existing sessions file, starting fresh');
    }
  }

  private async saveSessionsToDisk(): Promise<void> {
    try {
      const data: Record<string, Session> = {};
      for (const [k, v] of this.sessions.entries()) {
        data[k] = v;
      }
      await fs.writeFile(this.sessionsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save sessions:', error);
    }
  }

  static generateSessionKey(channel: string, userId: string, agentId: string): string {
    return `${channel}:${userId}:${agentId}`;
  }

  static parseSessionKey(key: string): SessionKey | null {
    const parts = key.split(':');
    if (parts.length !== 3) return null;
    return { 
      channel: parts[0] as SessionKey['channel'], 
      userId: parts[1], 
      agentId: parts[2] 
    };
  }

  getOrCreateSession(channel: SessionKey['channel'], userId: string, agentId: string): Session {
    const key = SessionManager.generateSessionKey(channel, userId, agentId);
    let session = this.sessions.get(key);
    
    if (!session) {
      session = { 
        sessionKey: key, 
        channel, 
        userId, 
        agentId, 
        createdAt: new Date(), 
        lastActivity: new Date(), 
        messageCount: 0 
      };
      this.sessions.set(key, session);
      this.saveSessionsToDisk();
      logger.info(`✅ Created new session: ${key}`);
    } else {
      session.lastActivity = new Date();
    }
    
    return session;
  }

  getSession(key: string): Session | undefined {
    return this.sessions.get(key);
  }

  updateSessionActivity(key: string): void {
    const session = this.sessions.get(key);
    if (session) {
      session.lastActivity = new Date();
      session.messageCount++;
      this.saveSessionsToDisk();
    }
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  clearSession(key: string): boolean {
    const deleted = this.sessions.delete(key);
    if (deleted) {
      logger.info(`Cleared session: ${key}`);
      this.saveSessionsToDisk();
    }
    return deleted;
  }

  /**
   * Set plan for session
   */
  setSessionPlan(sessionKey: string, plan: AgentPlan): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.currentPlan = plan;
      this.saveSessionsToDisk();
      logger.info(`📋 Plan set for session: ${sessionKey}`);
    }
  }

  /**
   * Get plan for session
   */
  getSessionPlan(sessionKey: string): AgentPlan | undefined {
    const session = this.sessions.get(sessionKey);
    return session?.currentPlan;
  }

  /**
   * Clear plan for session
   */
  clearSessionPlan(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.currentPlan = undefined;
      this.saveSessionsToDisk();
      logger.info(`🗑️ Plan cleared for session: ${sessionKey}`);
    }
  }
}
