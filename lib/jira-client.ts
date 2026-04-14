import { Sprint, JiraIssue } from '@/types';
import { STORY_POINTS_FIELDS } from './issue-helpers';
import { apiCache } from './cache';

interface JiraConfig {
    domain: string;
    email: string;
    apiToken: string;
    projectKey: string;
}

class JiraClient {
    private config: JiraConfig;
    private baseUrl: string;
    private authHeader: string;
    private storyPointsFields: string[];

    constructor(config: JiraConfig) {
        this.config = config;
        this.baseUrl = `https://${config.domain}/rest/agile/1.0`;

        // Create Basic Auth header
        const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
        this.authHeader = `Basic ${auth}`;

        this.storyPointsFields = STORY_POINTS_FIELDS;
    }

    private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': this.authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Jira API error (${response.status}): ${errorText}`);
        }

        return response.json();
    }

    /**
     * Get all boards for the project
     */
    async getBoards(): Promise<any> {
        return this.fetch(`/board?projectKeyOrId=${this.config.projectKey}`);
    }

    /**
   * Get all sprints for a board (cached for 5 minutes)
   */
    async getSprints(boardId?: number): Promise<Sprint[]> {
        let targetBoardId = boardId;

        if (!targetBoardId) {
            // Get the first board for the project or use env variable
            const boardIds = process.env.JIRA_BOARD_IDS;
            if (boardIds) {
                // Use first board ID from comma-separated list
                targetBoardId = parseInt(boardIds.split(',')[0].trim(), 10);
            } else {
                // Fallback: Get first board from project
                const boards = await this.getBoards();
                if (!boards.values || boards.values.length === 0) {
                    throw new Error('No boards found for the project');
                }
                targetBoardId = boards.values[0].id;
            }
        }

        const endpoint = `/board/${targetBoardId}/sprint`;
        const cacheKey = `sprints:${targetBoardId}`;
        const cached = apiCache.get<Sprint[]>(cacheKey);
        if (cached) return cached;

        const response = await this.fetch<{ values: Sprint[] }>(endpoint);
        apiCache.set(cacheKey, response.values);
        return response.values;
    }

    /**
   * Get team ID for a board from environment configuration
   */
    private getTeamIdForBoard(boardId: number): string | null {
        const mapping = process.env.JIRA_BOARD_TEAM_MAP;
        if (!mapping) return null;

        // Format: "boardId1:teamId1,boardId2:teamId2"
        const entries = mapping.split(',');
        for (const entry of entries) {
            const [bid, teamId] = entry.split(':');
            if (parseInt(bid.trim(), 10) === boardId) {
                return teamId.trim();
            }
        }
        return null;
    }

    /**
     * Get issues for a specific sprint with optional team filtering.
     * Uses Agile API with client-side filtering (JQL endpoints deprecated).
     * When includeChangelog is true, fetches changelog + created field for metrics.
     * A cached changelog response can also serve non-changelog requests.
     */
    async getSprintIssues(sprintId: number, boardId?: number, options?: { includeChangelog?: boolean }): Promise<JiraIssue[]> {
        const includeChangelog = options?.includeChangelog ?? false;
        const teamId = boardId ? this.getTeamIdForBoard(boardId) : null;
        const baseKey = `sprintIssues:${sprintId}:${boardId || 'default'}`;
        const changelogKey = `${baseKey}:changelog`;

        // If requesting without changelog, check if a changelog version is cached (superset)
        if (!includeChangelog) {
            const cachedChangelog = apiCache.get<JiraIssue[]>(changelogKey);
            if (cachedChangelog) return cachedChangelog;
        }

        const cacheKey = includeChangelog ? changelogKey : baseKey;
        const cached = apiCache.get<JiraIssue[]>(cacheKey);
        if (cached) return cached;

        // Use Agile API and filter client-side to avoid deprecated JQL endpoints
        // Include customfield_10014 (Epic Link) for epic grouping
        const baseFields = `summary,assignee,issuetype,status,parent,subtasks,worklog,customfield_10001,customfield_10014,${this.storyPointsFields.join(',')}`;
        const fields = includeChangelog ? `${baseFields},created` : baseFields;
        const expand = includeChangelog ? '&expand=changelog' : '';
        const endpoint = `/sprint/${sprintId}/issue?fields=${fields}${expand}&maxResults=1000`;

        console.log(`[getSprintIssues] Fetching sprint ${sprintId} for board ${boardId}, changelog: ${includeChangelog}, team filter: ${teamId || 'none'}`);

        const response = await this.fetch<{ issues: JiraIssue[] }>(endpoint);
        let issues = response.issues;

        // Client-side team filtering if team ID is configured
        if (teamId) {
            const originalCount = issues.length;
            issues = issues.filter(issue => {
                const team = issue.fields['customfield_10001'];
                return team && team.id === teamId;
            });
            console.log(`[getSprintIssues] Filtered from ${originalCount} to ${issues.length} issues for team ${teamId}`);
        }

        apiCache.set(cacheKey, issues);
        return issues;
    }

    /**
     * Get all epics for a board
     */
    async getEpics(boardId: number): Promise<any[]> {
        const endpoint = `/board/${boardId}/epic?maxResults=1000`;
        console.log(`[getEpics] Fetching epics for board ${boardId}`);

        try {
            const response = await this.fetch<{ values: any[] }>(endpoint);
            console.log(`[getEpics] Found ${response.values.length} epics`);
            return response.values;
        } catch (error) {
            console.error(`[getEpics] Error fetching epics:`, error);
            return [];
        }
    }

    /**
     * Get issues for a sprint WITH changelog history for metrics calculations.
     * @deprecated Use getSprintIssues(sprintId, boardId, { includeChangelog: true }) instead.
     */
    async getSprintIssuesWithChangelog(sprintId: number, boardId?: number): Promise<JiraIssue[]> {
        return this.getSprintIssues(sprintId, boardId, { includeChangelog: true });
    }

    /**
     * Get a single sprint by ID
     */
    async getSprint(sprintId: number): Promise<Sprint> {
        return this.fetch<Sprint>(`/sprint/${sprintId}`);
    }

    /**
     * Get sprints for a board filtered by state(s).
     * @param boardId - The board ID
     * @param states - Comma-separated states, e.g. 'active,future'
     */
    async getSprintsByState(boardId: number, states: string): Promise<Sprint[]> {
        const endpoint = `/board/${boardId}/sprint?state=${states}&maxResults=50`;
        const response = await this.fetch<{ values: Sprint[] }>(endpoint);
        return response.values;
    }
    /**
     * Discover board members by extracting unique assignees from recent sprints.
     * Jira Cloud doesn't have a direct board-members API, so we scan sprint issues.
     */
    async discoverBoardMembers(boardId: number): Promise<Array<{
        accountId: string;
        displayName: string;
        emailAddress: string;
        avatarUrl: string;
    }>> {
        const cacheKey = `boardMembers:${boardId}`;
        const cached = apiCache.get<Array<{ accountId: string; displayName: string; emailAddress: string; avatarUrl: string }>>(cacheKey);
        if (cached) return cached;

        // Get last 3 sprints (active + recent closed) to discover members
        const sprints = await this.getSprints(boardId);
        const recentSprints = sprints
            .filter(s => s.state === 'active' || s.state === 'closed')
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .slice(0, 3);

        const memberMap = new Map<string, { accountId: string; displayName: string; emailAddress: string; avatarUrl: string }>();

        for (const sprint of recentSprints) {
            const issues = await this.getSprintIssues(sprint.id, boardId);
            for (const issue of issues) {
                const assignee = issue.fields.assignee;
                if (assignee && !memberMap.has(assignee.accountId)) {
                    memberMap.set(assignee.accountId, {
                        accountId: assignee.accountId,
                        displayName: assignee.displayName,
                        emailAddress: assignee.emailAddress || '',
                        avatarUrl: assignee.avatarUrls?.['48x48'] || '',
                    });
                }
            }
        }

        const members = Array.from(memberMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
        apiCache.set(cacheKey, members, 600_000); // Cache 10 minutes
        return members;
    }
}

/**
 * Create a Jira client instance from environment variables
 */
export function createJiraClient(): JiraClient {
    const config: JiraConfig = {
        domain: process.env.JIRA_DOMAIN || '',
        email: process.env.JIRA_EMAIL || '',
        apiToken: process.env.JIRA_API_TOKEN || '',
        projectKey: process.env.JIRA_PROJECT_KEY || '',
    };

    // Validate configuration
    if (!config.domain || !config.email || !config.apiToken || !config.projectKey) {
        throw new Error('Missing required Jira configuration in environment variables');
    }

    return new JiraClient(config);
}

export default JiraClient;
