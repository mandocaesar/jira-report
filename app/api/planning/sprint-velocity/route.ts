import { apiSuccess, apiError } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';
import { getStoryPoints, isStoryPointField, sprintFieldContainsId } from '@/lib/issue-helpers';
import { JiraIssue, Sprint, SprintVelocityEntry, SprintVelocityData, SprintCommitmentCategory } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CategoryKey = 'stories' | 'subTasks' | 'subChores' | 'incidents';

function getCategory(issue: JiraIssue): CategoryKey {
    const name = issue.fields.issuetype.name.toLowerCase();
    if (name.includes('sub-chore') || name === 'sub chore') return 'subChores';
    if (issue.fields.issuetype.subtask === true) return 'subTasks';
    if (['incident', 'bug', 'defect'].includes(name)) return 'incidents';
    return 'stories';
}

/**
 * Roll back any story point changes that happened AFTER sprint start.
 * Returns the story points value the issue had at sprint start.
 */
function getPointsAtStart(issue: JiraIssue, sprintStartDayEnd: number): number {
    const current = getStoryPoints(issue);
    if (!issue.changelog?.histories) return current;

    const laterChanges: Array<{ time: number; fromVal: string }> = [];
    for (const h of issue.changelog.histories) {
        const t = new Date(h.created).getTime();
        if (t <= sprintStartDayEnd) continue;
        for (const item of h.items) {
            if (isStoryPointField(item.fieldId, item.field)) {
                laterChanges.push({ time: t, fromVal: item.fromString || '0' });
            }
        }
    }
    if (laterChanges.length === 0) return current;
    laterChanges.sort((a, b) => a.time - b.time);
    return parseFloat(laterChanges[0].fromVal || '0');
}

/**
 * Returns true if the issue was added to this sprint AFTER the sprint start day.
 */
function isAddedMidSprint(issue: JiraIssue, sprint: Sprint, sprintStartDayEnd: number): boolean {
    // Created after sprint start
    if (issue.fields.created) {
        if (new Date(issue.fields.created).getTime() > sprintStartDayEnd) return true;
    }
    // Sprint field changed to include this sprint after start
    if (issue.changelog?.histories) {
        for (const h of issue.changelog.histories) {
            const t = new Date(h.created).getTime();
            if (t <= sprintStartDayEnd) continue;
            for (const item of h.items) {
                if (item.field === 'Sprint' || item.fieldId === 'customfield_10020') {
                    if (
                        sprintFieldContainsId(item.to, sprint.id) ||
                        item.toString?.includes(sprint.name)
                    ) return true;
                }
            }
        }
    }
    return false;
}

// ─── Core Computation ─────────────────────────────────────────────────────────

function computeVelocityEntry(
    sprint: Sprint,
    issues: JiraIssue[]
): Omit<SprintVelocityEntry, 'committedDelta' | 'actualDelta'> {
    const startDayEnd = (() => {
        const d = new Date(sprint.startDate);
        d.setHours(23, 59, 59, 999);
        return d.getTime();
    })();

    const mkCat = (): SprintCommitmentCategory => ({
        committed: 0, actual: 0, count: 0,
        addedMidSprint: 0, addedMidSprintCount: 0,
    });
    const breakdown: Record<CategoryKey, SprintCommitmentCategory> = {
        stories: mkCat(), subTasks: mkCat(), subChores: mkCat(), incidents: mkCat(),
    };

    let committedPoints = 0;
    let actualPoints = 0;
    let addedMidSprintPoints = 0;
    let addedMidSprintCount = 0;

    for (const issue of issues) {
        const cat = getCategory(issue);
        const added = isAddedMidSprint(issue, sprint, startDayEnd);
        const currentPts = getStoryPoints(issue);
        const committedPts = added ? 0 : getPointsAtStart(issue, startDayEnd);
        const done = issue.fields.status?.statusCategory?.name === 'Done';

        breakdown[cat].count++;
        breakdown[cat].committed += committedPts;
        if (done) breakdown[cat].actual += currentPts;

        if (added) {
            breakdown[cat].addedMidSprint += currentPts;
            breakdown[cat].addedMidSprintCount++;
            addedMidSprintPoints += currentPts;
            addedMidSprintCount++;
        } else {
            committedPoints += committedPts;
        }

        if (done) actualPoints += currentPts;
    }

    const totalPoints = issues.reduce((s, i) => s + getStoryPoints(i), 0);
    const commitmentAccuracy = committedPoints > 0
        ? Math.round((actualPoints / committedPoints) * 100)
        : 0;

    return {
        sprint,
        committedPoints,
        actualPoints,
        totalPoints,
        addedMidSprintPoints,
        addedMidSprintCount,
        commitmentAccuracy,
        breakdown,
    };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const boardId = searchParams.get('boardId');
        const countParam = searchParams.get('count') || '8';

        if (!boardId) {
            return apiError('Missing boardId', 400);
        }

        const bId = parseInt(boardId, 10);
        const count = Math.min(parseInt(countParam, 10) || 8, 20);

        const client = createJiraClient();
        const allSprints = await client.getSprints(bId);

        // Most-recent N closed/active sprints, oldest-first for display
        const eligible = allSprints
            .filter(s => (s.state === 'closed' || s.state === 'active') && s.startDate)
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .slice(0, count)
            .reverse();

        // Fetch issues with changelog in batches of 3
        const rawEntries: Array<Omit<SprintVelocityEntry, 'committedDelta' | 'actualDelta'>> = [];
        const chunkSize = 3;
        for (let i = 0; i < eligible.length; i += chunkSize) {
            const chunk = eligible.slice(i, i + chunkSize);
            const results = await Promise.all(
                chunk.map(async sprint => {
                    try {
                        const issues = await client.getSprintIssuesWithChangelog(sprint.id, bId);
                        return computeVelocityEntry(sprint, issues);
                    } catch (err) {
                        console.error(`[velocity] Error for sprint ${sprint.id}:`, err);
                        return null;
                    }
                })
            );
            rawEntries.push(...(results.filter(Boolean) as typeof rawEntries));
        }

        // Attach sprint-to-sprint deltas
        const entries: SprintVelocityEntry[] = rawEntries.map((e, i) => ({
            ...e,
            committedDelta: i === 0 ? null : e.committedPoints - rawEntries[i - 1].committedPoints,
            actualDelta: i === 0 ? null : e.actualPoints - rawEntries[i - 1].actualPoints,
        }));

        const data: SprintVelocityData = { boardId: bId, sprints: entries };
        return apiSuccess(data);

    } catch (error) {
        console.error('[velocity] Route error:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to compute sprint velocity', 500);
    }
}
