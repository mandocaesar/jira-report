import { NextRequest, NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { JiraIssue } from '@/types';

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

// Story points fields to check
const storyPointsFields = ['customfield_10036', 'customfield_10052'];

function getStoryPoints(issue: JiraIssue): number {
    for (const fieldName of storyPointsFields) {
        const value = issue.fields[fieldName];
        if (value !== undefined && value !== null && typeof value === 'number') {
            return value;
        }
    }
    return 0;
}

function getStatusCategory(issue: JiraIssue): string {
    return issue.fields.status?.statusCategory?.name || 'To Do';
}

function getStatusName(issue: JiraIssue): string {
    return issue.fields.status?.name || 'Unknown';
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

        for (const issue of issues) {
            // Only process sub-tasks for points like Sprint Report, OR process everything?
            // The prompt says "keep the breakdown in story level", so parent = story, issue = sub-tasks.
            // Let's process all issues and group by parent.

            const epicKey = issue.fields['customfield_10014'] || noEpicKey;
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
