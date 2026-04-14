import { NextRequest } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { apiSuccess, apiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

// GET /api/team-report/member?boardId=xxx&sprintCount=5
// Returns per-member issue lists grouped by sprint
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const boardIdParam = searchParams.get('boardId');
        const sprintCountParam = searchParams.get('sprintCount') || '5';

        if (!boardIdParam) {
            return apiError('boardId is required', 400);
        }

        const boardId = parseInt(boardIdParam);
        const sprintCount = Math.min(parseInt(sprintCountParam), 10);
        const jiraClient = createJiraClient();

        // Fetch closed + active sprints
        const allSprints = await jiraClient.getSprints(boardId);
        const closedSprints = allSprints
            .filter(s => s.state === 'closed' && s.startDate && s.endDate)
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .slice(0, sprintCount);
        const activeSprints = allSprints.filter(s => s.state === 'active' && s.startDate && s.endDate);
        const sprints = [...activeSprints, ...closedSprints].slice(0, sprintCount);

        if (sprints.length === 0) {
            return apiSuccess({ boardId, members: [] });
        }

        // Fetch issues for all sprints in parallel (batches of 3)
        const sprintResults: Array<{
            sprintId: number;
            sprintName: string;
            sprintState: string;
            issues: Array<{
                key: string;
                summary: string;
                issueType: string;
                status: string;
                statusCategory: string;
                storyPoints: number;
                assigneeId: string | null;
                assigneeName: string | null;
                assigneeAvatar: string | null;
                parentKey: string | null;
                parentSummary: string | null;
            }>;
        }> = [];

        const chunkSize = 3;
        for (let i = 0; i < sprints.length; i += chunkSize) {
            const chunk = sprints.slice(i, i + chunkSize);
            const results = await Promise.all(
                chunk.map(async (sprint) => {
                    const issues = await jiraClient.getSprintIssues(sprint.id, boardId);
                    return {
                        sprintId: sprint.id,
                        sprintName: sprint.name,
                        sprintState: sprint.state,
                        issues: issues.map(issue => ({
                            key: issue.key,
                            summary: issue.fields.summary,
                            issueType: issue.fields.issuetype.name,
                            status: issue.fields.status?.name || 'Unknown',
                            statusCategory: issue.fields.status?.statusCategory?.name || 'Unknown',
                            storyPoints: issue.fields.customfield_10036 || issue.fields.customfield_10052 || 0,
                            assigneeId: issue.fields.assignee?.accountId || null,
                            assigneeName: issue.fields.assignee?.displayName || null,
                            assigneeAvatar: issue.fields.assignee?.avatarUrls?.['48x48'] || null,
                            parentKey: issue.fields.parent?.key || null,
                            parentSummary: issue.fields.parent?.fields?.summary || null,
                        })),
                    };
                })
            );
            sprintResults.push(...results);
        }

        // Build per-member structure
        const memberMap = new Map<string, {
            accountId: string;
            name: string;
            avatarUrl: string;
            sprints: Array<{
                sprintId: number;
                sprintName: string;
                sprintState: string;
                issues: Array<{
                    key: string;
                    summary: string;
                    issueType: string;
                    status: string;
                    statusCategory: string;
                    storyPoints: number;
                    parentKey: string | null;
                    parentSummary: string | null;
                }>;
            }>;
        }>();

        for (const sprint of sprintResults) {
            for (const issue of sprint.issues) {
                if (!issue.assigneeId) continue;

                if (!memberMap.has(issue.assigneeId)) {
                    memberMap.set(issue.assigneeId, {
                        accountId: issue.assigneeId,
                        name: issue.assigneeName || 'Unknown',
                        avatarUrl: issue.assigneeAvatar || '',
                        sprints: [],
                    });
                }

                const member = memberMap.get(issue.assigneeId)!;
                let memberSprint = member.sprints.find(s => s.sprintId === sprint.sprintId);
                if (!memberSprint) {
                    memberSprint = {
                        sprintId: sprint.sprintId,
                        sprintName: sprint.sprintName,
                        sprintState: sprint.sprintState,
                        issues: [],
                    };
                    member.sprints.push(memberSprint);
                }

                memberSprint.issues.push({
                    key: issue.key,
                    summary: issue.summary,
                    issueType: issue.issueType,
                    status: issue.status,
                    statusCategory: issue.statusCategory,
                    storyPoints: issue.storyPoints,
                    parentKey: issue.parentKey,
                    parentSummary: issue.parentSummary,
                });
            }
        }

        // Sort members by name, sprints chronologically, issues by status then key
        const members = Array.from(memberMap.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(m => ({
                ...m,
                sprints: m.sprints
                    .sort((a, b) => {
                        // Active first, then by sprint name desc
                        if (a.sprintState === 'active' && b.sprintState !== 'active') return -1;
                        if (b.sprintState === 'active' && a.sprintState !== 'active') return 1;
                        return b.sprintName.localeCompare(a.sprintName);
                    })
                    .map(s => ({
                        ...s,
                        issues: s.issues.sort((a, b) => {
                            // Done last, then by key
                            const catOrder = (c: string) => c === 'Done' ? 2 : c === 'In Progress' ? 0 : 1;
                            const diff = catOrder(a.statusCategory) - catOrder(b.statusCategory);
                            if (diff !== 0) return diff;
                            return a.key.localeCompare(b.key);
                        }),
                    })),
            }));

        return apiSuccess({
            boardId,
            sprintCount: sprints.length,
            jiraDomain: process.env.JIRA_DOMAIN || '',
            members,
        });
    } catch (error) {
        console.error('Error fetching member details:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch member details', 500);
    }
}
