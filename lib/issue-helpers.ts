import { JiraIssue, User } from '@/types';

/**
 * Canonical story point field IDs for this Jira instance.
 * IMPORTANT: customfield_10026 is a DATE field, not story points!
 */
export const STORY_POINTS_FIELDS = [
    'customfield_10036', // Story Points (Bank Sinarmas instance)
    'customfield_10052', // QA Story Point
];

/**
 * Extract story points from a Jira issue.
 * Returns the first non-null numeric value from known story point fields.
 */
export function getStoryPoints(issue: JiraIssue): number {
    for (const fieldName of STORY_POINTS_FIELDS) {
        const value = issue.fields[fieldName];
        if (value !== undefined && value !== null && typeof value === 'number') {
            return value;
        }
    }
    return 0;
}

/**
 * Check if a changelog field ID or name refers to a story point field.
 */
export function isStoryPointField(fieldId?: string | null, fieldName?: string | null): boolean {
    if (fieldId) return STORY_POINTS_FIELDS.includes(fieldId);
    return fieldName === 'Story Points' || fieldName === 'QA Story Point';
}

/**
 * Extract user information from a Jira issue's assignee.
 */
export function extractUser(issue: JiraIssue): User | null {
    if (!issue.fields.assignee) return null;

    const assignee = issue.fields.assignee;
    return {
        accountId: assignee.accountId,
        displayName: assignee.displayName,
        emailAddress: assignee.emailAddress,
        avatarUrl: assignee.avatarUrls['48x48'],
    };
}

/**
 * Categorize issue type into high-level work categories:
 * - Product: Default category (Story, Task, Sub-task, etc.)
 * - Technical Initiatives: Technical Initiative, Chore
 * - Incident: Incident, Bug, Defect
 */
export function categorizeIssueType(typeName: string): 'Product' | 'Technical Initiatives' | 'Incident' {
    const lowerType = typeName.toLowerCase();

    if (lowerType.includes('technical') || lowerType === 'chore') {
        return 'Technical Initiatives';
    }

    if (lowerType === 'incident' || lowerType === 'bug' || lowerType === 'defect') {
        return 'Incident';
    }

    return 'Product';
}

/**
 * Get status category from an issue (e.g., "To Do", "In Progress", "Done").
 */
export function getStatusCategory(issue: JiraIssue): string {
    return issue.fields.status?.statusCategory?.name || 'Unknown';
}

/**
 * Get status name from an issue (e.g., "In Review", "QA Testing").
 */
export function getStatusName(issue: JiraIssue): string {
    return issue.fields.status?.name || 'Unknown';
}

/**
 * Parse the Sprint changelog `to` field and check for an exact sprint ID match.
 * The Sprint field value is typically a comma-separated list of sprint IDs
 * or a string like "Sprint Name 1, Sprint Name 2".
 */
export function sprintFieldContainsId(fieldValue: string | null | undefined, sprintId: number): boolean {
    if (!fieldValue) return false;
    // Sprint `to` field is comma-separated IDs like "123, 456" or sometimes "123"
    return fieldValue.split(',').some(part => part.trim() === String(sprintId));
}
