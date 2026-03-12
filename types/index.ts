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
  };
  engineerStats: {
    count: number;
    mandays: number;
    storyPoints: number;
    leaveDays: number;
    workTypeStats: WorkTypeStats;
  };
  // Overall sprint work distribution
  workTypeStats: WorkTypeStats;
  // Detected Indonesian Holidays
  holidays: Holiday[];
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
