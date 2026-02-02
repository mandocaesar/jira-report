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
}

interface EpicBreakdown {
    epicKey: string;
    epicName: string;
    issues: {
        Product: EpicIssue[];
        'Technical Initiatives': EpicIssue[];
        Incident: EpicIssue[];
    };
    totalPoints: {
        Product: number;
        'Technical Initiatives': number;
        Incident: number;
    };
}

// Type definition for known issue categories
type IssueCategory = 'Product' | 'Technical Initiatives' | 'Incident';

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

/**
 * Categorize issue type:
 * - Technical Initiatives: Technical Initiative, Chore
 * - Incident: Incident, Bug, Defect
 * - Product: Everything else (Story, Task, Sub-task, etc.)
 */
function categorizeIssueType(typeName: string): IssueCategory {
    const lowerType = typeName.toLowerCase();

    // Technical Initiatives
    if (lowerType.includes('technical') || lowerType === 'chore') {
        return 'Technical Initiatives';
    }

    // Incident
    if (lowerType === 'incident' || lowerType === 'bug' || lowerType === 'defect') {
        return 'Incident';
    }

    // Product (default - Story, Task, Sub-task, etc.)
    return 'Product';
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

        // Group issues by epic
        const epicBreakdowns = new Map<string, EpicBreakdown>();
        const noEpicKey = 'NO_EPIC';

        for (const issue of issues) {
            const epicKey = issue.fields['customfield_10014'] || noEpicKey;
            const epicInfo = epicMap.get(epicKey) || { key: epicKey, name: epicKey === noEpicKey ? 'No Epic' : epicKey };

            if (!epicBreakdowns.has(epicKey)) {
                epicBreakdowns.set(epicKey, {
                    epicKey: epicInfo.key,
                    epicName: epicInfo.name,
                    issues: {
                        Product: [],
                        'Technical Initiatives': [],
                        Incident: []
                    },
                    totalPoints: {
                        Product: 0,
                        'Technical Initiatives': 0,
                        Incident: 0
                    }
                });
            }

            const breakdown = epicBreakdowns.get(epicKey)!;
            const typeName = issue.fields.issuetype.name;
            const category = categorizeIssueType(typeName);
            const points = getStoryPoints(issue);

            const epicIssue: EpicIssue = {
                key: issue.key,
                summary: issue.fields.summary,
                issueType: typeName,
                storyPoints: points,
                assignee: issue.fields.assignee?.displayName || null
            };

            breakdown.issues[category].push(epicIssue);
            breakdown.totalPoints[category] += points;
        }

        // Convert to array and sort by total points (highest first)
        const result = Array.from(epicBreakdowns.values()).sort((a, b) => {
            const totalA = Object.values(a.totalPoints).reduce((sum, p) => sum + p, 0);
            const totalB = Object.values(b.totalPoints).reduce((sum, p) => sum + p, 0);
            return totalB - totalA;
        });

        return NextResponse.json({ epicBreakdowns: result });
    } catch (error) {
        console.error('Error fetching epic breakdown:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
