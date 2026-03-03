import { Sprint, JiraIssue } from '@/types';

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

        // Common story points custom field IDs
        this.storyPointsFields = [
            'customfield_10036', // Story Points (your Jira instance)
            'customfield_10052', // QA Story Point
            'customfield_10016', // Story point estimate (fallback)
            'customfield_10026', // Another common field (fallback)
            'customfield_10004', // Yet another common field (fallback)
        ];
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
   * Get all sprints for a board
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
        const response = await this.fetch<{ values: Sprint[] }>(endpoint);
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
     * Get issues for a specific sprint with optional team filtering
     * Uses Agile API with client-side filtering (JQL endpoints deprecated)
     */
    async getSprintIssues(sprintId: number, boardId?: number): Promise<JiraIssue[]> {
        const teamId = boardId ? this.getTeamIdForBoard(boardId) : null;

        // Use Agile API and filter client-side to avoid deprecated JQL endpoints
        // Include customfield_10014 (Epic Link) for epic grouping
        const endpoint = `/sprint/${sprintId}/issue?` +
            `fields=summary,assignee,issuetype,status,parent,subtasks,worklog,customfield_10001,customfield_10014,${this.storyPointsFields.join(',')}&` +
            `maxResults=1000`;

        console.log(`[getSprintIssues] Fetching sprint ${sprintId} for board ${boardId}, team filter: ${teamId || 'none'}`);

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
     * Includes created date and full status transition history.
     */
    async getSprintIssuesWithChangelog(sprintId: number, boardId?: number): Promise<JiraIssue[]> {
        const teamId = boardId ? this.getTeamIdForBoard(boardId) : null;

        const endpoint = `/sprint/${sprintId}/issue?` +
            `fields=summary,assignee,issuetype,status,created,parent,subtasks,customfield_10001,customfield_10014,${this.storyPointsFields.join(',')}&` +
            `expand=changelog&` +
            `maxResults=1000`;

        console.log(`[getSprintIssuesWithChangelog] Fetching sprint ${sprintId} with changelog`);

        const response = await this.fetch<{ issues: JiraIssue[] }>(endpoint);
        let issues = response.issues;

        // Client-side team filtering
        if (teamId) {
            const originalCount = issues.length;
            issues = issues.filter(issue => {
                const team = issue.fields['customfield_10001'];
                return team && team.id === teamId;
            });
            console.log(`[getSprintIssuesWithChangelog] Filtered from ${originalCount} to ${issues.length} issues for team ${teamId}`);
        }

        return issues;
    }

    /**
     * Get a single sprint by ID
     */
    async getSprint(sprintId: number): Promise<Sprint> {
        return this.fetch<Sprint>(`/sprint/${sprintId}`);
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
