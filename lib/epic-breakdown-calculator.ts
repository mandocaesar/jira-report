import { getStoryPoints, getStatusCategory, getStatusName } from '@/lib/issue-helpers';

export interface EpicIssue {
    key: string;
    summary: string;
    issueType: string;
    storyPoints: number;
    assignee: string | null;
    status: string;
    statusCategory: string;
}

export interface StoryGroup {
    key: string;
    summary: string;
    issues: EpicIssue[];
    totalPoints: number;
    completedPoints: number;
}

export interface EpicBreakdown {
    epicKey: string;
    epicName: string;
    stories: StoryGroup[];
    totalPoints: number;
    completedPoints: number;
    completionPercent: number;
}

interface EpicInfo {
    key: string;
    name: string;
}

export function calculateEpicBreakdowns(
    epics: Array<{ key: string; summary?: string; name?: string }>,
    issues: any[]
): EpicBreakdown[] {
    const epicMap = new Map<string, EpicInfo>();
    for (const epic of epics) {
        epicMap.set(epic.key, {
            key: epic.key,
            name: epic.summary || epic.name || epic.key,
        });
    }

    const epicBreakdowns = new Map<string, EpicBreakdown>();
    const noEpicKey = 'NO_EPIC';

    // PASS 1: Build map of explicit Epic associations
    const issueEpicMap = new Map<string, string>();
    for (const issue of issues) {
        let epicKey = issue.fields['customfield_10014'];
        if (!epicKey && issue.fields.parent && issue.fields.parent.fields.issuetype?.name === 'Epic') {
            epicKey = issue.fields.parent.key;
        }
        if (epicKey) {
            issueEpicMap.set(issue.key, epicKey);
        }
    }

    // PASS 2: Assign all issues to their Epic (inheriting from parent if needed)
    for (const issue of issues) {
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
                completionPercent: 0,
            });
        }

        const breakdown = epicBreakdowns.get(epicKey)!;
        const points = getStoryPoints(issue);
        const statusCat = getStatusCategory(issue);
        const isCompleted = statusCat === 'Done';

        breakdown.totalPoints += points;
        if (isCompleted) breakdown.completedPoints += points;

        const parentKey = issue.fields.parent?.key || 'Standalone';
        const parentSummary = issue.fields.parent?.fields.summary || 'Standalone Issues';

        let storyGroup = breakdown.stories.find(s => s.key === parentKey);
        if (!storyGroup) {
            storyGroup = { key: parentKey, summary: parentSummary, issues: [], totalPoints: 0, completedPoints: 0 };
            breakdown.stories.push(storyGroup);
        }

        storyGroup.issues.push({
            key: issue.key,
            summary: issue.fields.summary,
            issueType: issue.fields.issuetype.name,
            storyPoints: points,
            assignee: issue.fields.assignee?.displayName || null,
            status: getStatusName(issue),
            statusCategory: statusCat,
        });
        storyGroup.totalPoints += points;
        if (isCompleted) storyGroup.completedPoints += points;
    }

    // Calculate percentages and sort
    return Array.from(epicBreakdowns.values())
        .map(breakdown => {
            breakdown.completionPercent = breakdown.totalPoints > 0
                ? (breakdown.completedPoints / breakdown.totalPoints) * 100
                : 0;
            breakdown.stories.sort((a, b) => b.totalPoints - a.totalPoints);
            return breakdown;
        })
        .sort((a, b) => b.totalPoints - a.totalPoints);
}
