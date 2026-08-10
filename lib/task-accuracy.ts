import { JiraIssue } from '@/types';
import { getStoryPoints } from './issue-helpers';
import { HOURS_PER_MANDAY } from './constants';

export interface IssueAccuracy {
  key: string;
  summary: string;
  assigneeId: string | null;
  assigneeName: string | null;
  sp: number;
  expectedHours: number;
  loggedHours: number | null;
  ratio: number | null;
}

export interface AccuracyRollup {
  totalSp: number;
  totalExpectedHours: number;
  totalLoggedHours: number;
  ratio: number | null;
  issueCount: number;
  issuesWithData: number;
}

export interface TaskAccuracyResult {
  issues: IssueAccuracy[];
  perMember: Map<string, AccuracyRollup>;
  team: AccuracyRollup;
}

function sumWorklogHours(issue: JiraIssue): number | null {
  const logs = issue.fields.worklog?.worklogs;
  if (!logs?.length) return null;
  const seconds = logs.reduce((s, l) => s + (l.timeSpentSeconds || 0), 0);
  return Math.round((seconds / 3600) * 100) / 100;
}

function emptyRollup(): AccuracyRollup {
  return { totalSp: 0, totalExpectedHours: 0, totalLoggedHours: 0, ratio: null, issueCount: 0, issuesWithData: 0 };
}

function addToRollup(r: AccuracyRollup, item: IssueAccuracy) {
  r.issueCount++;
  r.totalSp += item.sp;
  if (item.loggedHours !== null && item.sp > 0) {
    r.issuesWithData++;
    r.totalExpectedHours += item.expectedHours;
    r.totalLoggedHours += item.loggedHours;
  }
}

function finalizeRollup(r: AccuracyRollup) {
  r.ratio = r.totalExpectedHours > 0 ? Math.round((r.totalLoggedHours / r.totalExpectedHours) * 100) / 100 : null;
}

/** Hours-vs-SP accuracy lens. Hours NEVER feed capacity — display only. */
export function computeTaskAccuracy(issues: JiraIssue[]): TaskAccuracyResult {
  const items: IssueAccuracy[] = issues.map(issue => {
    const sp = getStoryPoints(issue);
    const loggedHours = sumWorklogHours(issue);
    const expectedHours = sp * HOURS_PER_MANDAY;
    const ratio = loggedHours !== null && sp > 0
      ? Math.round((loggedHours / expectedHours) * 100) / 100
      : null;
    return {
      key: issue.key,
      summary: issue.fields.summary,
      assigneeId: issue.fields.assignee?.accountId ?? null,
      assigneeName: issue.fields.assignee?.displayName ?? null,
      sp,
      expectedHours,
      loggedHours,
      ratio,
    };
  });

  items.sort((a, b) => {
    if (a.ratio === null && b.ratio === null) return 0;
    if (a.ratio === null) return 1;
    if (b.ratio === null) return -1;
    return b.ratio - a.ratio;
  });

  const perMember = new Map<string, AccuracyRollup>();
  const team = emptyRollup();
  for (const item of items) {
    addToRollup(team, item);
    if (item.assigneeId) {
      if (!perMember.has(item.assigneeId)) perMember.set(item.assigneeId, emptyRollup());
      addToRollup(perMember.get(item.assigneeId)!, item);
    }
  }
  finalizeRollup(team);
  for (const r of perMember.values()) finalizeRollup(r);

  return { issues: items, perMember, team };
}
