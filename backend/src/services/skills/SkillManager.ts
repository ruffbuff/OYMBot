import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { logger } from '../../utils/logger.js';

export interface Skill {
    id: string;
    name: string;
    description: string;
    version?: string;
    promptTemplate: string; // The markdown content
    requiredTools?: string[];
}

export class SkillManager {
    private globalSkillsDir: string;
    private workspaceSkillsDir: string;
    private skills: Map<string, Skill> = new Map();

    constructor() {
        this.workspaceSkillsDir = process.env.WORKSPACE_SKILLS_DIR || path.join(process.cwd(), 'skills');
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.globalSkillsDir = process.env.GLOBAL_SKILLS_DIR || path.join(homeDir, '.oym-bot', 'skills');
    }

    async initialize(): Promise<void> {
        await this.ensureDirectories();
        await this.loadSkillsFromDir(this.globalSkillsDir);
        await this.loadSkillsFromDir(this.workspaceSkillsDir);
    }

    private async ensureDirectories(): Promise<void> {
        try {
            await fs.mkdir(this.globalSkillsDir, { recursive: true });
            await fs.mkdir(this.workspaceSkillsDir, { recursive: true });
        } catch (e) {
            logger.error('Failed to create skill directories', e);
        }
    }

    private async loadSkillsFromDir(dirPath: string): Promise<void> {
        try {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                if (!file.endsWith('.md')) continue;

                try {
                    const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
                    const parsed = (matter as any)(content);

                    const skillId = path.basename(file, '.md');
                    const skill: Skill = {
                        id: parsed.data.id || skillId,
                        name: parsed.data.name || skillId,
                        description: parsed.data.description || 'No description provided',
                        version: parsed.data.version || '1.0.0',
                        requiredTools: parsed.data.requiredTools || [],
                        promptTemplate: parsed.content.trim()
                    };

                    this.skills.set(skill.id, skill);
                    logger.info(`Loaded skill: ${skill.name} (${skill.id})`);
                } catch (err) {
                    logger.error(`Error parsing skill file ${file}:`, err);
                }
            }
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                logger.error(`Error reading skills from ${dirPath}:`, error);
            }
        }
    }

    public getSkill(id: string): Skill | undefined {
        return this.skills.get(id);
    }

    public getAllSkills(): Skill[] {
        return Array.from(this.skills.values());
    }

    public getSkillsPromptSegment(skillIds: string[]): string {
        if (!skillIds || skillIds.length === 0) return '';

        let segment = '## Loaded Skills & Specialized Knowledge\n\n';
        let added = 0;

        for (const id of skillIds) {
            const skill = this.getSkill(id);
            if (skill) {
                segment += `### Skill: ${skill.name}\n${skill.promptTemplate}\n\n`;
                added++;
            } else {
                // Fallback for string-only skills from legacy config
                segment += `- ${id}\n`;
                added++;
            }
        }

        return added > 0 ? segment : '';
    }
}
