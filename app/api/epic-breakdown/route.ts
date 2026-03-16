import { NextRequest, NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { getStoryPoints, getStatusCategory, getStatusName } from '@/lib/issue-helpers';

// Interface for epic breakdown data
interface EpicIssue {
    key: string;
    summary: string;
    issueType: string;
    storyPoints: number;
    assignee: string | null;
    status: string;
    statusCategory: string;
}

interface StoryGroup {
    key: string;
    summary: string;
    issues: EpicIssue[];
    totalPoints: number;
    completedPoints: number;
}

interface EpicBreakdown {
    epicKey: string;
    epicName: string;
    stories: StoryGroup[];
    totalPoints: number;
    completedPoints: number;
    completionPercent: number;
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const boardId = searchParams.get('boardId');
        const sprintId = searchParams.get('sprintId');

        if (!boardId || !sprintId) {
            return NextResponse.json(
                { error: 'boardId and sprintId are required' },
                { status: 400 }
            );
        }

        const client = createJiraClient();

        // Fetch epics and issues in parallel
        const [epics, issues] = await Promise.all([
            client.getEpics(parseInt(boardId, 10)),
            client.getSprintIssues(parseInt(sprintId, 10), parseInt(boardId, 10))
        ]);

        // Create epic lookup map
        const epicMap = new Map<string, { key: string; name: string }>();
        for (const epic of epics) {
            epicMap.set(epic.key, {
                key: epic.key,
                name: epic.summary || epic.name || epic.key
            });
        }

        const epicBreakdowns = new Map<string, EpicBreakdown>();
        const noEpicKey = 'NO_EPIC';

        // PASS 1: Build a map of all explicit Epic associations (mostly Stories)
        const issueEpicMap = new Map<string, string>();
        for (const issue of issues) {
            let epicKey = issue.fields['customfield_10014']; // Classic Jira Epic Link

            // If Next-Gen/Team-Managed Jira, Epic is often the parent
            if (!epicKey && issue.fields.parent && issue.fields.parent.fields.issuetype?.name === 'Epic') {
                epicKey = issue.fields.parent.key;
            }

            if (epicKey) {
                issueEpicMap.set(issue.key, epicKey);
            }
        }

        // PASS 2: Assign all issues to their proper Epic Block (inheriting if needed)
        for (const issue of issues) {
            // Check if this issue has an Epic, or if its parent has an Epic
            let epicKey = issueEpicMap.get(issue.key);

            if (!epicKey && issue.fields.parent) {
                epicKey = issueEpicMap.get(issue.fields.parent.key);
            }

            epicKey = epicKey || noEpicKey;
            const epicInfo = epicMap.get(epicKey) || { key: epicKey, name: epicKey === noEpicKey ? 'No Epic' : epicKey };

            if (!epicBreakdowns.has(epicKey)) {
                epicBreakdowns.set(epicKey, {
                    epicKey: epicInfo.key,
                    epicName: epicInfo.name,
                    stories: [],
                    totalPoints: 0,
                    completedPoints: 0,
                    completionPercent: 0
                });
            }

            const breakdown = epicBreakdowns.get(epicKey)!;
            const points = getStoryPoints(issue);
            const statusCat = getStatusCategory(issue);
            const isCompleted = statusCat === 'Done';

            // Only sub-tasks usually have story points in this workflow, but we add up whatever has points
            breakdown.totalPoints += points;
            if (isCompleted) {
                breakdown.completedPoints += points;
            }

            // Determine parent story
            const parentKey = issue.fields.parent?.key || 'Standalone';
            const parentSummary = issue.fields.parent?.fields.summary || 'Standalone Issues';

            let storyGroup = breakdown.stories.find(s => s.key === parentKey);
            if (!storyGroup) {
                storyGroup = {
                    key: parentKey,
                    summary: parentSummary,
                    issues: [],
                    totalPoints: 0,
                    completedPoints: 0
                };
                breakdown.stories.push(storyGroup);
            }

            const epicIssue: EpicIssue = {
                key: issue.key,
                summary: issue.fields.summary,
                issueType: issue.fields.issuetype.name,
                storyPoints: points,
                assignee: issue.fields.assignee?.displayName || null,
                status: getStatusName(issue),
                statusCategory: statusCat
            };

            storyGroup.issues.push(epicIssue);
            storyGroup.totalPoints += points;
            if (isCompleted) {
                storyGroup.completedPoints += points;
            }
        }

        // Calculate percentages and sort
        const result = Array.from(epicBreakdowns.values()).map(breakdown => {
            breakdown.completionPercent = breakdown.totalPoints > 0
                ? (breakdown.completedPoints / breakdown.totalPoints) * 100
                : 0;

            // Sort stories by total points
            breakdown.stories.sort((a, b) => b.totalPoints - a.totalPoints);

            return breakdown;
        }).sort((a, b) => b.totalPoints - a.totalPoints);

        return NextResponse.json({ epicBreakdowns: result });
    } catch (error) {
        console.error('Error fetching epic breakdown:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
