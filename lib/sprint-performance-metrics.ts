import { JiraIssue, Sprint, SprintVelocityEntry, SprintCommitmentCategory } from '@/types';
import { getStoryPoints, isStoryPointField, sprintFieldContainsId, calculateIssueTimes } from './issue-helpers';
import { MemberCapacityDays } from './capacity-engine';
import { AssignmentResult } from './sprint-assignment';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SprintPerformanceKPIs {
  /** Completed Tasks / Committed Tasks */
  completionRate: number;
  /** Average business days In Progress → Done */
  avgCycleTime: number | null;
  /** Median business days In Progress → Done */
  medianCycleTime: number | null;
}

export type KPIStatus = 'green' | 'yellow' | 'orange' | 'red';

export function getKPIStatus(value: number, thresholds?: { green: number; yellow: number; orange: number }): KPIStatus {
  const t = thresholds ?? { green: 90, yellow: 75, orange: 50 };
  if (value >= t.green) return 'green';
  if (value >= t.yellow) return 'yellow';
  if (value >= t.orange) return 'orange';
  return 'red';
}

export interface EngineerSprintMetrics {
  accountId: string;
  name: string;
  role: 'qa' | 'engineer';
  title: string;
  avatarUrl: string;
  storyPoints: number;
  theoreticalMandays: number;
  assignedAtStart: number;
  completedIssues: number;
  committedIssues: number;
  completionRate: number;
  cycleTimeAvg: number | null;
  leadTimeAvg: number | null;
}

// ─── Velocity ──────────────────────────────────────────────────────────────────

type CategoryKey = 'stories' | 'subTasks' | 'subChores' | 'incidents';

function getCategory(issue: JiraIssue): CategoryKey {
  const name = issue.fields.issuetype.name.toLowerCase();
  if (name.includes('sub-chore') || name === 'sub chore') return 'subChores';
  if (issue.fields.issuetype.subtask === true) return 'subTasks';
  if (['incident', 'bug', 'defect'].includes(name)) return 'incidents';
  return 'stories';
}

/**
 * Single-pass changelog analysis: computes both addedMidSprint and pointsAtStart
 * in one traversal instead of two separate passes.
 */
export function analyzeIssueChangelog(
  issue: JiraIssue,
  sprint: Sprint,
  sprintStartDayEnd: number
): { addedMidSprint: boolean; pointsAtStart: number } {
  const current = getStoryPoints(issue);

  if (Date.parse(issue.fields.created) > sprintStartDayEnd) {
    return { addedMidSprint: true, pointsAtStart: 0 };
  }

  if (!issue.changelog?.histories) {
    return { addedMidSprint: false, pointsAtStart: current };
  }

  let addedMidSprint = false;
  const laterPointChanges: Array<{ time: number; fromVal: string }> = [];

  for (const h of issue.changelog.histories) {
    const t = Date.parse(h.created);
    if (t <= sprintStartDayEnd) continue;

    for (const item of h.items) {
      if (!addedMidSprint && (item.field === 'Sprint' || item.fieldId === 'customfield_10020')) {
        if (sprintFieldContainsId(item.to, sprint.id) || item.toString?.includes(sprint.name)) {
          addedMidSprint = true;
        }
      }
      if (isStoryPointField(item.fieldId, item.field)) {
        laterPointChanges.push({ time: t, fromVal: item.fromString || '0' });
      }
    }
  }

  if (addedMidSprint) {
    return { addedMidSprint: true, pointsAtStart: 0 };
  }

  let pointsAtStart = current;
  if (laterPointChanges.length > 0) {
    laterPointChanges.sort((a, b) => a.time - b.time);
    pointsAtStart = parseFloat(laterPointChanges[0].fromVal || '0');
  }

  return { addedMidSprint: false, pointsAtStart };
}

export function computeVelocity(sprint: Sprint, issues: JiraIssue[]): SprintVelocityEntry {
  const startDayEnd = (() => { const d = new Date(sprint.startDate); d.setHours(23, 59, 59, 999); return d.getTime(); })();
  const mkCat = (): SprintCommitmentCategory => ({ committed: 0, actual: 0, count: 0, addedMidSprint: 0, addedMidSprintCount: 0 });
  const breakdown: Record<CategoryKey, SprintCommitmentCategory> = { stories: mkCat(), subTasks: mkCat(), subChores: mkCat(), incidents: mkCat() };

  let committedPoints = 0, actualPoints = 0, addedMidSprintPoints = 0, addedMidSprintCount = 0;
  let totalPoints = 0;
  for (const issue of issues) {
    const cat = getCategory(issue);
    const currentPts = getStoryPoints(issue);
    totalPoints += currentPts;
    const { addedMidSprint: added, pointsAtStart: committedPts } = analyzeIssueChangelog(issue, sprint, startDayEnd);
    const done = issue.fields.status?.statusCategory?.name === 'Done';
    breakdown[cat].count++;
    breakdown[cat].committed += committedPts;
    if (done) breakdown[cat].actual += currentPts;
    if (added) { breakdown[cat].addedMidSprint += currentPts; breakdown[cat].addedMidSprintCount++; addedMidSprintPoints += currentPts; addedMidSprintCount++; }
    else { committedPoints += committedPts; }
    if (done) actualPoints += currentPts;
  }
  const commitmentAccuracy = committedPoints > 0 ? Math.round((actualPoints / committedPoints) * 100) : 0;

  return {
    sprint,
    committedPoints,
    actualPoints,
    totalPoints,
    addedMidSprintPoints,
    addedMidSprintCount,
    commitmentAccuracy,
    breakdown,
    committedDelta: null,
    actualDelta: null,
  };
}

// ─── KPI Calculator ────────────────────────────────────────────────────────────

export function calculateSprintKPIs(issues: JiraIssue[]): SprintPerformanceKPIs {
  // Completion rate: completed issues / total committed issues
  const committedIssues = issues.length;
  const completedIssues = issues.filter(i => i.fields.status?.statusCategory?.name === 'Done').length;
  const completionRate = committedIssues > 0 ? (completedIssues / committedIssues) * 100 : 0;

  // Cycle times
  const cycleTimes: number[] = [];
  for (const issue of issues) {
    const times = calculateIssueTimes(issue);
    if (times) cycleTimes.push(times.cycleTimeDays);
  }

  const avgCycleTime = cycleTimes.length > 0
    ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10
    : null;

  const medianCycleTime = cycleTimes.length > 0
    ? (() => {
        const sorted = [...cycleTimes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
      })()
    : null;

  return {
    completionRate: Math.round(completionRate * 10) / 10,
    avgCycleTime,
    medianCycleTime,
  };
}

// ─── Per-Engineer Metrics ──────────────────────────────────────────────────────

export function calculateEngineerMetrics(
  issues: JiraIssue[],
  capacityByAccount: Map<string, MemberCapacityDays>,
  assignment: AssignmentResult,
  teamMemberIds: Set<string>,
): EngineerSprintMetrics[] {
  // Build per-member issue aggregations
  const memberIssueMap = new Map<string, { sp: number; completed: number; total: number; cycleTimes: number[]; leadTimes: number[] }>();
  for (const issue of issues) {
    const assigneeId = issue.fields.assignee?.accountId;
    if (!assigneeId || !teamMemberIds.has(assigneeId)) continue;
    if (!memberIssueMap.has(assigneeId)) {
      memberIssueMap.set(assigneeId, { sp: 0, completed: 0, total: 0, cycleTimes: [], leadTimes: [] });
    }
    const m = memberIssueMap.get(assigneeId)!;
    m.sp += getStoryPoints(issue);
    m.total++;
    if (issue.fields.status?.statusCategory?.name === 'Done') {
      m.completed++;
      const times = calculateIssueTimes(issue);
      if (times) {
        m.cycleTimes.push(times.cycleTimeDays);
        m.leadTimes.push(times.leadTimeDays);
      }
    }
  }

  const results: EngineerSprintMetrics[] = [];

  for (const accountId of teamMemberIds) {
    const issueData = memberIssueMap.get(accountId);
    const cap = capacityByAccount.get(accountId);
    const memberAssign = assignment.perMember.get(accountId);

    const sp = issueData?.sp ?? 0;
    const completed = issueData?.completed ?? 0;
    const total = issueData?.total ?? 0;
    const theoreticalMandays = cap?.theoreticalMandays ?? 0;
    const assignedAtStart = memberAssign?.assignedAtStart ?? 0;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const avgCycle = issueData && issueData.cycleTimes.length > 0
      ? Math.round((issueData.cycleTimes.reduce((a, b) => a + b, 0) / issueData.cycleTimes.length) * 10) / 10
      : null;
    const avgLead = issueData && issueData.leadTimes.length > 0
      ? Math.round((issueData.leadTimes.reduce((a, b) => a + b, 0) / issueData.leadTimes.length) * 10) / 10
      : null;

    results.push({
      accountId,
      name: cap?.name ?? accountId,
      role: (cap?.role ?? 'engineer') as 'qa' | 'engineer',
      title: cap?.title ?? '',
      avatarUrl: '',
      storyPoints: sp,
      theoreticalMandays,
      assignedAtStart,
      completedIssues: completed,
      committedIssues: total,
      completionRate: Math.round(completionRate * 10) / 10,
      cycleTimeAvg: avgCycle,
      leadTimeAvg: avgLead,
    });
  }

  // Populate avatar URLs from issues
  for (const issue of issues) {
    const assigneeId = issue.fields.assignee?.accountId;
    if (!assigneeId) continue;
    const eng = results.find(r => r.accountId === assigneeId);
    if (eng && !eng.avatarUrl && issue.fields.assignee?.avatarUrls?.['48x48']) {
      eng.avatarUrl = issue.fields.assignee.avatarUrls['48x48'];
    }
    // Also update name from Jira if we only had accountId
    if (eng && eng.name === eng.accountId && issue.fields.assignee?.displayName) {
      eng.name = issue.fields.assignee.displayName;
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}
