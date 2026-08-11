// SP-side of the days-only model: who was assigned what at sprint start,
// what got added mid-sprint, and whether additions fit the visible buffer.
import { JiraIssue, Sprint } from '@/types';
import { getStoryPoints } from './issue-helpers';
import { analyzeIssueChangelog } from './sprint-performance-metrics';
import { isAdhocIssue } from './em-report';
import { SprintCapacityDays } from './capacity-engine';

export interface MemberAssignment {
  accountId: string;
  assignedAtStart: number;
  addedDuringSprint: number;
  delivered: number;
  adhocDelivered: number;
  carryOver: number;
}

export interface AssignmentResult {
  perMember: Map<string, MemberAssignment>;
  team: { assignedAtStart: number; addedDuringSprint: number; delivered: number; adhocDelivered: number; carryOver: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeAssignment(sprint: Sprint, issues: JiraIssue[]): AssignmentResult {
  const startDayEnd = (() => { const d = new Date(sprint.startDate); d.setHours(23, 59, 59, 999); return d.getTime(); })();
  const perMember = new Map<string, MemberAssignment>();
  const team = { assignedAtStart: 0, addedDuringSprint: 0, delivered: 0, adhocDelivered: 0, carryOver: 0 };

  const entry = (accountId: string): MemberAssignment => {
    if (!perMember.has(accountId)) {
      perMember.set(accountId, { accountId, assignedAtStart: 0, addedDuringSprint: 0, delivered: 0, adhocDelivered: 0, carryOver: 0 });
    }
    return perMember.get(accountId)!;
  };

  // Skip parent issues whose sub-tasks are also present in the sprint, same dedup
  // rule as groupByUser (lib/utilization-calculator.ts) — otherwise a parent
  // Story/Task's points would be double-counted on top of its sub-tasks' points.
  const subtaskParentKeys = new Set<string>();
  for (const issue of issues) {
    if (issue.fields.issuetype.subtask && issue.fields.parent?.key) {
      subtaskParentKeys.add(issue.fields.parent.key);
    }
  }

  for (const issue of issues) {
    if (!issue.fields.issuetype.subtask && subtaskParentKeys.has(issue.key)) continue;

    const points = getStoryPoints(issue);
    if (points <= 0) continue;
    const accountId = issue.fields.assignee?.accountId ?? 'UNASSIGNED';
    const m = entry(accountId);
    const { addedMidSprint, pointsAtStart } = analyzeIssueChangelog(issue, sprint, startDayEnd);
    const done = issue.fields.status?.statusCategory?.name === 'Done';

    if (addedMidSprint) {
      m.addedDuringSprint += points;
      team.addedDuringSprint += points;
    } else {
      m.assignedAtStart += pointsAtStart;
      team.assignedAtStart += pointsAtStart;
    }
    if (done) {
      m.delivered += points;
      team.delivered += points;
      if (isAdhocIssue(issue)) {
        m.adhocDelivered += points;
        team.adhocDelivered += points;
      }
    } else {
      m.carryOver += points;
      team.carryOver += points;
    }
  }

  for (const m of perMember.values()) {
    m.assignedAtStart = round2(m.assignedAtStart);
    m.addedDuringSprint = round2(m.addedDuringSprint);
    m.delivered = round2(m.delivered);
    m.adhocDelivered = round2(m.adhocDelivered);
    m.carryOver = round2(m.carryOver);
  }
  team.assignedAtStart = round2(team.assignedAtStart);
  team.addedDuringSprint = round2(team.addedDuringSprint);
  team.delivered = round2(team.delivered);
  team.adhocDelivered = round2(team.adhocDelivered);
  team.carryOver = round2(team.carryOver);

  return { perMember, team };
}

export interface BufferReport {
  theoreticalMandays: number;
  assignedAtStart: number;
  buffer: number;
  addedDuringSprint: number;
  overloadSP: number;
  verdict: 'fit' | 'overload';
  perMember: Array<{
    accountId: string; name: string;
    theoreticalMandays: number; assignedAtStart: number;
    buffer: number; addedDuringSprint: number; overloadSP: number;
  }>;
}

export function computeBufferReport(capacity: SprintCapacityDays, assignment: AssignmentResult): BufferReport {
  const memberRows = capacity.members.map(cm => {
    const a = assignment.perMember.get(cm.accountId);
    const assignedAtStart = a?.assignedAtStart ?? 0;
    const addedDuringSprint = a?.addedDuringSprint ?? 0;
    const buffer = round2(cm.theoreticalMandays - assignedAtStart);
    const overloadSP = round2(Math.max(0, addedDuringSprint - Math.max(0, buffer)));
    return {
      accountId: cm.accountId,
      name: cm.name,
      theoreticalMandays: cm.theoreticalMandays,
      assignedAtStart,
      buffer,
      addedDuringSprint,
      overloadSP,
    };
  });

  // Team totals are summed from the roster-only memberRows, not assignment.team —
  // assignment.team also includes UNASSIGNED and non-roster SP, which would
  // inflate assignedAtStart/addedDuringSprint against a roster-only theoreticalMandays.
  const theoreticalMandays = capacity.teamTheoreticalMandays;
  const assignedAtStart = round2(memberRows.reduce((s, m) => s + m.assignedAtStart, 0));
  const buffer = round2(theoreticalMandays - assignedAtStart);
  const addedDuringSprint = round2(memberRows.reduce((s, m) => s + m.addedDuringSprint, 0));
  const overloadSP = round2(Math.max(0, addedDuringSprint - Math.max(0, buffer)));

  return {
    theoreticalMandays,
    assignedAtStart,
    buffer,
    addedDuringSprint,
    overloadSP,
    verdict: overloadSP > 0 ? 'overload' : 'fit',
    perMember: memberRows,
  };
}
