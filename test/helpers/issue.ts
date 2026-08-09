import { JiraIssue, Sprint } from '@/types';

export function makeSprint(opts: Partial<Sprint> = {}): Sprint {
  return {
    id: 100,
    name: 'Test Sprint 1',
    state: 'closed',
    startDate: '2026-06-15T03:00:00.000Z',
    endDate: '2026-06-26T10:00:00.000Z',
    ...opts,
  };
}

interface IssueOpts {
  key?: string;
  sp?: number;
  assigneeId?: string | null;
  assigneeName?: string;
  created?: string;            // ISO; default before sprint start
  done?: boolean;
  subtask?: boolean;
  typeName?: string;
  parentKey?: string;
  labels?: string[];
  summary?: string;
  worklogHours?: number[];     // one entry per worklog, all inside sprint
  changelog?: JiraIssue['changelog'];
}

let seq = 0;
export function makeIssue(opts: IssueOpts = {}): JiraIssue {
  seq += 1;
  const assigneeId = opts.assigneeId === undefined ? 'user-1' : opts.assigneeId;
  return {
    id: String(seq),
    key: opts.key ?? `T-${seq}`,
    changelog: opts.changelog,
    fields: {
      summary: opts.summary ?? `Issue ${seq}`,
      labels: opts.labels,
      issuetype: { name: opts.typeName ?? 'Sub-task', subtask: opts.subtask ?? true },
      assignee: assigneeId === null ? null : {
        accountId: assigneeId,
        displayName: opts.assigneeName ?? assigneeId,
        emailAddress: `${assigneeId}@x.com`,
        avatarUrls: { '48x48': '' },
      },
      parent: opts.parentKey ? { id: 'p', key: opts.parentKey, fields: { summary: 'parent' } } : undefined,
      status: { name: opts.done ? 'Done' : 'In Progress', statusCategory: { name: opts.done ? 'Done' : 'In Progress' } },
      worklog: opts.worklogHours ? {
        worklogs: opts.worklogHours.map(h => ({
          author: { accountId: assigneeId ?? 'user-1', displayName: 'x' },
          timeSpentSeconds: h * 3600,
          started: '2026-06-16T02:00:00.000Z',
        })),
      } : undefined,
      created: opts.created ?? '2026-06-01T00:00:00.000Z',
      customfield_10036: opts.sp ?? 0,
    },
  } as JiraIssue;
}

/** Changelog entry adding this issue to the sprint after start */
export function sprintAddedChangelog(sprintId: number, when: string): JiraIssue['changelog'] {
  return {
    histories: [{
      id: 'h1',
      author: { accountId: 'u', displayName: 'u' },
      created: when,
      items: [{ field: 'Sprint', fieldtype: 'jira', fieldId: 'customfield_10020', from: '', fromString: '', to: String(sprintId), toString: `Sprint ${sprintId}` }],
    }],
  };
}

/** Changelog entry changing story points after sprint start */
export function pointsChangedChangelog(when: string, fromPoints: number, toPoints: number): JiraIssue['changelog'] {
  return {
    histories: [{
      id: 'h2',
      author: { accountId: 'u', displayName: 'u' },
      created: when,
      items: [{ field: 'Story point estimate', fieldtype: 'jira', fieldId: 'customfield_10036', from: String(fromPoints), fromString: String(fromPoints), to: String(toPoints), toString: String(toPoints) }],
    }],
  };
}
