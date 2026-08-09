import { JiraIssue, Sprint } from '@/types';
import { getStoryPoints } from './issue-helpers';
import { computeVelocity } from './sprint-performance-metrics';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type EmReportRole = 'engineer' | 'qa';

export interface EmReportIssueRef {
    key: string;
    summary: string;
    points: number;
}

export interface EmReportHighlight extends EmReportIssueRef {
    /** 'adhoc' = matched an ad-hoc label; 'added' = pulled into sprint mid-way */
    kind: 'adhoc' | 'added';
}

export interface EmReportRoleRow {
    role: EmReportRole;
    memberCount: number;
    /** SP committed at sprint start (scope changes excluded) */
    committedStart: number;
    /** Final sprint scope: committed + everything added mid-sprint */
    committedFinal: number;
    /** Delivered SP from planned sprint work (done, non-adhoc) */
    deliveredSprint: number;
    /** Delivered SP from ad-hoc work (done, adhoc-labelled) */
    deliveredAdhoc: number;
    deliveredTotal: number;
    carryOverPoints: number;
    carryOverIssues: EmReportIssueRef[];
    /** deliveredTotal ÷ committedStart × 100 */
    productivityScore: number;
    /** Auto-derived extra/adhoc deliveries for the highlights column */
    autoHighlights: EmReportHighlight[];
}

export interface EmReportData {
    rows: EmReportRoleRow[];
}

// ─── Ad-hoc detection ──────────────────────────────────────────────────────────

function getAdhocLabels(): string[] {
    const raw = process.env.ADHOC_LABELS || 'adhoc,ad-hoc';
    return raw.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
}

const ADHOC_SUMMARY_PATTERN = /\bad-?hoc\b/i;

export function isAdhocIssue(issue: JiraIssue, adhocLabels: string[] = getAdhocLabels()): boolean {
    const labels = issue.fields.labels;
    if (labels?.some(l => adhocLabels.includes(l.toLowerCase()))) return true;
    // Teams often mark ad-hoc work in the summary ("[ADHOC] ...", "QA ADHOC - ...")
    return ADHOC_SUMMARY_PATTERN.test(issue.fields.summary);
}

// ─── Carry-over (shared with YTD aggregation) ──────────────────────────────────

function isDone(issue: JiraIssue): boolean {
    return issue.fields.status?.statusCategory?.name === 'Done';
}

/** Sum of not-done story points per role. Used for both the report row and YTD averages. */
export function computeCarryOverByRole(
    issues: JiraIssue[],
    roleMap: Map<string, EmReportRole>,
): Record<EmReportRole, number> {
    const result: Record<EmReportRole, number> = { engineer: 0, qa: 0 };
    for (const issue of issues) {
        if (isDone(issue)) continue;
        const points = getStoryPoints(issue);
        if (points <= 0) continue;
        const role = resolveRole(issue, roleMap);
        result[role] += points;
    }
    return result;
}

function resolveRole(issue: JiraIssue, roleMap: Map<string, EmReportRole>): EmReportRole {
    const accountId = issue.fields.assignee?.accountId;
    return (accountId && roleMap.get(accountId)) || 'engineer';
}

// ─── EM report per role ────────────────────────────────────────────────────────

/**
 * Build the "Completed Sprints Performance" rows: one per role (Eng, QA/QE).
 * - committedStart → committedFinal mirrors the "66 -> 78" scope-growth column
 * - delivered is split into planned sprint work vs ad-hoc (Jira label match)
 * - productivityScore = deliveredTotal ÷ committedStart × 100
 */
export function computeEmReport(
    sprint: Sprint,
    issues: JiraIssue[],
    roleMap: Map<string, EmReportRole>,
    memberCounts: Record<EmReportRole, number>,
): EmReportData {
    const adhocLabels = getAdhocLabels();
    const byRole: Record<EmReportRole, JiraIssue[]> = { engineer: [], qa: [] };
    for (const issue of issues) {
        byRole[resolveRole(issue, roleMap)].push(issue);
    }

    const rows: EmReportRoleRow[] = (['engineer', 'qa'] as EmReportRole[]).map(role => {
        const roleIssues = byRole[role];
        const velocity = computeVelocity(sprint, roleIssues);

        let deliveredAdhoc = 0;
        let deliveredTotal = 0;
        let carryOverPoints = 0;
        const carryOverIssues: EmReportIssueRef[] = [];
        const autoHighlights: EmReportHighlight[] = [];
        const addedKeys = new Set<string>();

        // Re-detect mid-sprint additions the same way computeVelocity does, so
        // highlight entries stay consistent with the committed/added numbers.
        const startDayEnd = (() => { const d = new Date(sprint.startDate); d.setHours(23, 59, 59, 999); return d.getTime(); })();
        for (const issue of roleIssues) {
            if (Date.parse(issue.fields.created ?? '') > startDayEnd) addedKeys.add(issue.key);
        }

        for (const issue of roleIssues) {
            const points = getStoryPoints(issue);
            const adhoc = isAdhocIssue(issue, adhocLabels);

            if (isDone(issue)) {
                deliveredTotal += points;
                if (adhoc) deliveredAdhoc += points;
                if (points > 0 && (adhoc || addedKeys.has(issue.key))) {
                    autoHighlights.push({
                        key: issue.key,
                        summary: issue.fields.summary,
                        points,
                        kind: adhoc ? 'adhoc' : 'added',
                    });
                }
            } else if (points > 0) {
                carryOverPoints += points;
                carryOverIssues.push({ key: issue.key, summary: issue.fields.summary, points });
            }
        }

        const committedStart = velocity.committedPoints;
        const committedFinal = velocity.totalPoints;
        const deliveredSprint = deliveredTotal - deliveredAdhoc;
        const productivityScore = committedStart > 0
            ? Math.round((deliveredTotal / committedStart) * 10000) / 100
            : 0;

        carryOverIssues.sort((a, b) => b.points - a.points);
        autoHighlights.sort((a, b) => b.points - a.points);

        return {
            role,
            memberCount: memberCounts[role],
            committedStart,
            committedFinal,
            deliveredSprint: Math.round(deliveredSprint * 100) / 100,
            deliveredAdhoc: Math.round(deliveredAdhoc * 100) / 100,
            deliveredTotal: Math.round(deliveredTotal * 100) / 100,
            carryOverPoints: Math.round(carryOverPoints * 100) / 100,
            carryOverIssues,
            productivityScore,
            autoHighlights,
        };
    });

    return { rows };
}
