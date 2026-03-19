// Sprint-related types
export interface Sprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate: string;
  endDate: string;
  originBoardId?: number;
}

// Board types
export interface Board {
  id: number;
  name: string;
  type: string;
  location?: {
    projectKey: string;
    projectName: string;
  };
}

// Jira Issue types
export interface JiraIssue {
  id: string;
  key: string;
  changelog?: {
    histories: Array<{
      id: string;
      author: {
        accountId: string;
        displayName: string;
      };
      created: string;
      items: Array<{
        field: string;
        fieldtype: string;
        fieldId?: string;
        from?: string | null;
        fromString?: string | null;
        to?: string | null;
        toString?: string | null;
      }>;
    }>;
  };
  fields: {
    summary: string;
    issuetype: {
      name: string;
      subtask: boolean;
    };
    assignee: {
      accountId: string;
      displayName: string;
      emailAddress: string;
      avatarUrls: {
        '48x48': string;
      };
    } | null;
    parent?: {
      id: string;
      key: string;
      fields: {
        summary: string;
        issuetype?: {
          name: string;
        };
      };
    };
    subtasks?: Array<{
      id: string;
      key: string;
      fields: {
        summary: string;
      };
    }>;
    status?: {
      name: string;
      statusCategory: {
        name: string;
      };
    };
    worklog?: {
      worklogs: Array<{
        author: {
          accountId: string;
          displayName: string;
        };
        timeSpentSeconds: number;
        started: string;
      }>;
    };
    [key: string]: any; // For custom fields like story points
    created: string;
  };
}

// Sprint Report types
export interface ReportIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  points: number;
  assignee: string | null;
}

export interface StatusGroup {
  statusCategory: string;
  points: number;
  count: number;
  issues: ReportIssue[];
}

export interface MemberBreakdown {
  user: User;
  role: 'qa' | 'engineer';
  title: string;
  totalPoints: number;
  completedPoints: number;
  carryOverPoints: number;
  completionPercent: number;
  statusGroups: StatusGroup[];
}

export interface ScopeChange {
  issueKey: string;
  summary: string;
  issueType: string;
  parentKey?: string;
  parentSummary?: string;
  assignee: string | null;
  type: 'added' | 'points_changed';
  changeDate: string;
  oldValue?: string;
  newValue?: string;
  description: string;
}

export interface SprintReportData {
  sprint: Sprint;
  totalPoints: number;
  completedPoints: number;
  carryOverPoints: number;
  completionPercent: number;
  statusGroups: StatusGroup[];
  memberBreakdowns: MemberBreakdown[];
  carryOverIssues: ReportIssue[];
  scopeChanges: ScopeChange[];
}

// User information
export interface User {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrl: string;
}

// User utilization data
// Work type statistics (e.g., "Story": 5, "Bug": 2)
export interface WorkTypeStats {
  [type: string]: number;
}

// User utilization data
export interface UserUtilization {
  user: User;
  storyPoints: number;
  workingDays: number;
  leaveDays: number;
  availableDays: number;
  utilizationPercent: number;
  status: 'under' | 'optimal' | 'over';
  role: 'qa' | 'engineer';
  title: string;
  workTypeStats: WorkTypeStats;
  isUnrecognized?: boolean;
  // Hours-based capacity fields
  workingHoursPerDay: number;      // Resolved hours (member override or team default)
  teamStandardHours: number;       // Team's standard hours/day
  availableHours: number;          // availableDays × workingHoursPerDay
  effectiveMandays: number;        // availableHours / teamStandardHours (normalized)
}

// Sprint summary
export interface SprintSummary {
  sprint: Sprint;
  totalStoryPoints: number;
  totalWorkingDays: number;
  averageUtilization: number;
  userUtilizations: UserUtilization[];
  // QA vs Engineer breakdown
  qaStats: {
    count: number;
    mandays: number;
    storyPoints: number;
    leaveDays: number;
    workTypeStats: WorkTypeStats;
    totalHours: number;
    effectiveMandays: number;
  };
  engineerStats: {
    count: number;
    mandays: number;
    storyPoints: number;
    leaveDays: number;
    workTypeStats: WorkTypeStats;
    totalHours: number;
    effectiveMandays: number;
  };
  // Overall sprint work distribution
  workTypeStats: WorkTypeStats;
  // Detected Indonesian Holidays
  holidays: Holiday[];
  // Hours-based capacity totals
  teamStandardHours: number;
  totalAvailableHours: number;
  totalEffectiveMandays: number;
}

// Indonesian holiday
export interface Holiday {
  holiday_date: string;
  holiday_name: string;
  is_national_holiday: boolean;
}

// API response from libur.deno.dev
export interface HolidayApiResponse {
  data: Holiday[];
}

// Metrics Dashboard types
export interface WeeklyMetrics {
  weekLabel: string; // e.g. "Week 1", "Week 2"
  weekStart: string; // ISO date
  weekEnd: string;   // ISO date
  storyCount: number;
  taskCount: number;
  testCount: number;
  totalCount: number;
  doneCount: number;
  completionRate: number; // percentage
}

export interface TimeMetrics {
  meanTimeToDeliver: number | null;  // hours
  meanTimeToTest: number | null;     // hours
  meanTimeToDone: number | null;     // hours
  sampleSize: {
    deliver: number;
    test: number;
    done: number;
  };
}

export interface MemberTimeMetrics {
  accountId: string;
  displayName: string;
  avatarUrl: string;
  meanTimeToDeliver: number | null;
  meanTimeToDone: number | null;
  sampleSize: {
    deliver: number;
    done: number;
  };
  // Cycle/lead time in business days
  cycleTimeAvg: number | null;
  leadTimeAvg: number | null;
  throughput: number;
  subTasks: { delivered: number; total: number };
  subChores: { delivered: number; total: number };
  other: { delivered: number; total: number };
}

export interface MetricsData {
  sprint: Sprint;
  weeklyMetrics: WeeklyMetrics[];
  timeMetrics: TimeMetrics;
  memberTimeMetrics: MemberTimeMetrics[];
  totals: {
    storyCount: number;
    taskCount: number;
    testCount: number;
    totalCount: number;
    doneCount: number;
    completionRate: number;
  };
  // Cycle time / lead time / throughput
  cycleTimeMetrics: {
    avgCycleTimeDays: number | null;
    avgLeadTimeDays: number | null;
    throughput: number;
    sampleSize: number;
  };
  issueBreakdown: {
    subTasks: { delivered: number; total: number };
    subChores: { delivered: number; total: number };
    other: { delivered: number; total: number };
  };
}

// Worklog Report types
export interface DailyWorklog {
  date: string; // YYYY-MM-DD
  hours: number;
}

export interface MemberWorklog {
  accountId: string;
  displayName: string;
  avatarUrl: string;
  role: 'qa' | 'engineer';
  title: string;
  dailyLogs: DailyWorklog[];
  totalHours: number;
}

export interface WorklogReportData {
  sprintId: number;
  dates: string[];
  memberWorklogs: MemberWorklog[];
}

export interface BoardMetricsData {
  boardId: number;
  year: number;
  sprintMetrics: MetricsData[];
}

// Sprint Velocity / Commitment Tracking types

export interface SprintCommitmentCategory {
  committed: number;       // points committed at sprint start
  actual: number;          // points completed at sprint end
  count: number;           // total issue count (committed + added mid-sprint)
  addedMidSprint: number;  // points added after sprint start
  addedMidSprintCount: number;
}

export interface SprintVelocityEntry {
  sprint: Sprint;
  committedPoints: number;      // total points at sprint start (excl. mid-sprint additions)
  actualPoints: number;         // total completed points
  totalPoints: number;          // all points (committed + added mid-sprint)
  addedMidSprintPoints: number; // points from issues added after sprint start
  addedMidSprintCount: number;  // number of issues added mid-sprint
  commitmentAccuracy: number;   // actualPoints / committedPoints * 100
  breakdown: {
    stories: SprintCommitmentCategory;    // Stories, Tasks, Tech Initiatives
    subTasks: SprintCommitmentCategory;   // Sub-Tasks
    subChores: SprintCommitmentCategory;  // Sub-Chores
    incidents: SprintCommitmentCategory;  // Incidents, Bugs, Defects
  };
  committedDelta: number | null;  // vs previous sprint
  actualDelta: number | null;
}

export interface SprintVelocityData {
  boardId: number;
  sprints: SprintVelocityEntry[];
}
