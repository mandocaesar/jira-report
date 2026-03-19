import { JiraIssue, Sprint, SprintVelocityEntry, SprintCommitmentCategory, WorklogReportData } from '@/types';
import { SprintCapacity } from './capacity-pipeline';
import { getStoryPoints, isStoryPointField, sprintFieldContainsId } from './issue-helpers';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SprintPerformanceKPIs {
  /** Committed SP × team standard hours ÷ SP per day → or simply committedPoints */
  committedHours: number;
  /** Logged hours from worklogs */
  loggedHours: number;
  /** Total capacity hours from allocation pipeline */
  capacityHours: number;
  /** Committed Hours / Capacity Hours */
  plannedUtilisation: number;
  /** Logged Hours / Capacity Hours */
  executionUtilisation: number;
  /** Logged Hours / Committed Hours */
  execVsCommitment: number;
  /** Completed Tasks / Committed Tasks */
  completionRate: number;
  /** Committed SP / Committed Hours (or capacity) */
  spPerHour: number;
  /** Total SP / Active Sprint Count (for multi-sprint views) */
  avgVelocity: number;
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
  availableHours: number;
  allocatedHours: number;
  loggedHours: number;
  capacityPercent: number;
  effectiveMandays: number;
  plannedUtilisation: number;
  executionUtilisation: number;
  completedIssues: number;
  committedIssues: number;
  completionRate: number;
  cycleTimeAvg: number | null;
  leadTimeAvg: number | null;
}

export interface SprintPerformanceData {
  sprint: Sprint;
  kpis: SprintPerformanceKPIs;
  velocity: SprintVelocityEntry;
  engineerMetrics: EngineerSprintMetrics[];
  capacity: SprintCapacity | null;
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

function isAddedMidSprint(issue: JiraIssue, sprint: Sprint, sprintStartDayEnd: number): boolean {
  if (issue.fields.created && new Date(issue.fields.created).getTime() > sprintStartDayEnd) return true;
  if (issue.changelog?.histories) {
    for (const h of issue.changelog.histories) {
      const t = new Date(h.created).getTime();
      if (t <= sprintStartDayEnd) continue;
      for (const item of h.items) {
        if (item.field === 'Sprint' || item.fieldId === 'customfield_10020') {
          if (sprintFieldContainsId(item.to, sprint.id) || item.toString?.includes(sprint.name)) return true;
        }
      }
    }
  }
  return false;
}

export function computeVelocity(sprint: Sprint, issues: JiraIssue[]): SprintVelocityEntry {
  const startDayEnd = (() => { const d = new Date(sprint.startDate); d.setHours(23, 59, 59, 999); return d.getTime(); })();
  const mkCat = (): SprintCommitmentCategory => ({ committed: 0, actual: 0, count: 0, addedMidSprint: 0, addedMidSprintCount: 0 });
  const breakdown: Record<CategoryKey, SprintCommitmentCategory> = { stories: mkCat(), subTasks: mkCat(), subChores: mkCat(), incidents: mkCat() };

  let committedPoints = 0, actualPoints = 0, addedMidSprintPoints = 0, addedMidSprintCount = 0;
  for (const issue of issues) {
    const cat = getCategory(issue);
    const added = isAddedMidSprint(issue, sprint, startDayEnd);
    const currentPts = getStoryPoints(issue);
    const committedPts = added ? 0 : getPointsAtStart(issue, startDayEnd);
    const done = issue.fields.status?.statusCategory?.name === 'Done';
    breakdown[cat].count++;
    breakdown[cat].committed += committedPts;
    if (done) breakdown[cat].actual += currentPts;
    if (added) { breakdown[cat].addedMidSprint += currentPts; breakdown[cat].addedMidSprintCount++; addedMidSprintPoints += currentPts; addedMidSprintCount++; }
    else { committedPoints += committedPts; }
    if (done) actualPoints += currentPts;
  }

  const totalPoints = issues.reduce((s, i) => s + getStoryPoints(i), 0);
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

// ─── Cycle / Lead Time ─────────────────────────────────────────────────────────

function classifyStatus(statusName: string): string {
  const lower = statusName.toLowerCase();
  if (['to do', 'open', 'backlog', 'new', 'reopened', 'funnel', 'selected for development'].some(s => lower === s)) return 'To Do';
  if (['done', 'closed', 'resolved', 'released', 'completed'].some(s => lower === s)) return 'Done';
  return 'In Progress';
}

function businessDaysBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  let count = 0;
  const current = new Date(start); current.setHours(0, 0, 0, 0);
  const endNorm = new Date(end); endNorm.setHours(0, 0, 0, 0);
  while (current <= endNorm) { const day = current.getDay(); if (day !== 0 && day !== 6) count++; current.setDate(current.getDate() + 1); }
  return Math.max(count, 1);
}

function calculateIssueTimes(issue: JiraIssue): { cycleTimeDays: number; leadTimeDays: number } | null {
  if (issue.fields.status?.statusCategory?.name !== 'Done') return null;
  const histories = issue.changelog?.histories || [];
  let firstInProgressDate: Date | null = null;
  let doneDate: Date | null = null;
  const sorted = [...histories].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  for (const history of sorted) {
    for (const item of history.items) {
      if (item.field !== 'status') continue;
      if (!firstInProgressDate && item.toString && classifyStatus(item.toString) === 'In Progress') firstInProgressDate = new Date(history.created);
      if (item.toString && classifyStatus(item.toString) === 'Done') doneDate = new Date(history.created);
    }
  }
  if (!doneDate) return null;
  const createdDate = new Date(issue.fields.created);
  const leadTimeDays = businessDaysBetween(createdDate, doneDate);
  const cycleTimeDays = firstInProgressDate ? businessDaysBetween(firstInProgressDate, doneDate) : leadTimeDays;
  return { cycleTimeDays, leadTimeDays };
}

// ─── KPI Calculator ────────────────────────────────────────────────────────────

export function calculateSprintKPIs(
  sprint: Sprint,
  issues: JiraIssue[],
  capacity: SprintCapacity | null,
  worklogData: WorklogReportData | null,
  velocity: SprintVelocityEntry,
): SprintPerformanceKPIs {
  const capacityHours = capacity?.totalCapacityHours ?? 0;
  const committedPoints = velocity.committedPoints;
  const totalPoints = velocity.totalPoints;

  // Committed hours: committedPoints × teamStandardHours (1 SP = 1 manday = standardHours hours)
  const teamStdHours = capacity?.teamStandardHours ?? 8;
  const committedHours = committedPoints * teamStdHours;

  // Logged hours from worklogs
  const loggedHours = worklogData
    ? worklogData.memberWorklogs.reduce((sum, m) => sum + m.totalHours, 0)
    : 0;

  // Planned utilisation: committedHours / capacityHours
  const plannedUtilisation = capacityHours > 0 ? (committedHours / capacityHours) * 100 : 0;

  // Execution utilisation: loggedHours / capacityHours
  const executionUtilisation = capacityHours > 0 ? (loggedHours / capacityHours) * 100 : 0;

  // Exec vs commitment: loggedHours / committedHours
  const execVsCommitment = committedHours > 0 ? (loggedHours / committedHours) * 100 : 0;

  // Completion rate: completed issues / total committed issues
  const committedIssues = issues.length;
  const completedIssues = issues.filter(i => i.fields.status?.statusCategory?.name === 'Done').length;
  const completionRate = committedIssues > 0 ? (completedIssues / committedIssues) * 100 : 0;

  // SP per hour: committedPoints / committedHours
  const spPerHour = committedHours > 0 ? committedPoints / committedHours : 0;

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
    committedHours,
    loggedHours,
    capacityHours,
    plannedUtilisation: Math.round(plannedUtilisation * 10) / 10,
    executionUtilisation: Math.round(executionUtilisation * 10) / 10,
    execVsCommitment: Math.round(execVsCommitment * 10) / 10,
    completionRate: Math.round(completionRate * 10) / 10,
    spPerHour: Math.round(spPerHour * 100) / 100,
    avgVelocity: velocity.actualPoints,
    avgCycleTime,
    medianCycleTime,
  };
}

// ─── Per-Engineer Metrics ──────────────────────────────────────────────────────

export function calculateEngineerMetrics(
  issues: JiraIssue[],
  capacity: SprintCapacity | null,
  worklogData: WorklogReportData | null,
  teamMemberIds: Set<string>,
): EngineerSprintMetrics[] {
  const teamStdHours = capacity?.teamStandardHours ?? 8;

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

  // Build worklog map (accountId → hours)
  const worklogMap = new Map<string, number>();
  if (worklogData) {
    for (const mw of worklogData.memberWorklogs) {
      worklogMap.set(mw.accountId, mw.totalHours);
    }
  }

  // Build capacity map (accountId → MemberCapacity)
  const capacityMap = new Map<string, { availableHours: number; allocatedHours: number; capacityPercent: number; effectiveMandays: number }>();
  if (capacity) {
    for (const mc of capacity.members) {
      capacityMap.set(mc.accountId, {
        availableHours: mc.availableHours,
        allocatedHours: mc.allocatedHours,
        capacityPercent: mc.capacityPercent,
        effectiveMandays: mc.effectiveMandays,
      });
    }
  }

  const results: EngineerSprintMetrics[] = [];

  for (const accountId of teamMemberIds) {
    const issueData = memberIssueMap.get(accountId);
    const cap = capacityMap.get(accountId);
    const loggedHours = worklogMap.get(accountId) ?? 0;

    const sp = issueData?.sp ?? 0;
    const completed = issueData?.completed ?? 0;
    const total = issueData?.total ?? 0;
    const availableHours = cap?.availableHours ?? 0;
    const allocatedHours = cap?.allocatedHours ?? 0;
    const capacityPercent = cap?.capacityPercent ?? 100;
    const effectiveMandays = cap?.effectiveMandays ?? 0;

    const committedHours = sp * teamStdHours;
    const plannedUtilisation = allocatedHours > 0 ? (committedHours / allocatedHours) * 100 : 0;
    const executionUtilisation = allocatedHours > 0 ? (loggedHours / allocatedHours) * 100 : 0;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const avgCycle = issueData && issueData.cycleTimes.length > 0
      ? Math.round((issueData.cycleTimes.reduce((a, b) => a + b, 0) / issueData.cycleTimes.length) * 10) / 10
      : null;
    const avgLead = issueData && issueData.leadTimes.length > 0
      ? Math.round((issueData.leadTimes.reduce((a, b) => a + b, 0) / issueData.leadTimes.length) * 10) / 10
      : null;

    // We need member info from capacity or we'll fill in later
    const capMember = capacity?.members.find(m => m.accountId === accountId);

    results.push({
      accountId,
      name: capMember?.name ?? accountId,
      role: (capMember?.role ?? 'engineer') as 'qa' | 'engineer',
      title: capMember?.title ?? '',
      avatarUrl: '',
      storyPoints: sp,
      availableHours,
      allocatedHours,
      loggedHours,
      capacityPercent,
      effectiveMandays,
      plannedUtilisation: Math.round(plannedUtilisation * 10) / 10,
      executionUtilisation: Math.round(executionUtilisation * 10) / 10,
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
