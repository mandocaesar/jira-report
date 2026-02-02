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
      };
    };
    subtasks?: Array<{
      id: string;
      key: string;
      fields: {
        summary: string;
      };
    }>;
    [key: string]: any; // For custom fields like story points
  };
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
