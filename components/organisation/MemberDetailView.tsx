import Image from 'next/image';
import { getUtilColor } from '@/lib/ui-colors';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MemberSummary {
    totalStoryPoints: number;
    totalAvailableDays: number;
    avgUtilization: number;
    totalDeliveredSubTasks: number;
    totalDeliveredSubChores: number;
    totalDeliveredOther: number;
    totalDelivered: number;
    totalAssigned: number;
    avgCompletionRate: number;
    sprintCount: number;
    avgCycleTime: number | null;
    avgLeadTime: number | null;
    totalThroughput: number;
    avgThroughput: number;
}

interface MemberData {
    accountId: string;
    name: string;
    role: string;
    title: string;
    avatarUrl: string;
    sprints: any[];
    summary: MemberSummary;
}

interface IssueData {
    key: string;
    summary: string;
    issueType: string;
    status: string;
    statusCategory: string;
    storyPoints: number;
    parentKey: string | null;
    parentSummary: string | null;
}

interface MemberSprint {
    sprintId: number;
    sprintName: string;
    sprintState: string;
    issues: IssueData[];
}

interface MemberDetailViewProps {
    member: MemberData;
    memberIssues: MemberSprint[] | null;
    jiraDomain: string;
    detailLoading: boolean;
    detailError: string | null;
    expandedSprints: Set<string>;
    sprintCount: number;
    onBack: () => void;
    onToggleSprint: (sprintId: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCompletionColor(pct: number) {
    if (pct >= 90) return 'text-green-500';
    if (pct >= 70) return 'text-blue-500';
    if (pct >= 50) return 'text-yellow-500';
    return 'text-red-500';
}

function getCycleColor(days: number | null) {
    if (days === null) return 'text-muted-foreground';
    if (days <= 2) return 'text-green-500';
    if (days <= 5) return 'text-blue-500';
    if (days <= 10) return 'text-yellow-500';
    return 'text-red-500';
}

function getStatusBadgeColor(category: string) {
    if (category === 'Done') return 'bg-green-500/15 text-green-400 border-green-500/30';
    if (category === 'In Progress') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
}

function getTypeIcon(type: string) {
    const lower = type.toLowerCase();
    if (lower === 'story') return { color: 'text-green-400', icon: '📗' };
    if (lower === 'bug' || lower === 'defect') return { color: 'text-red-400', icon: '🐛' };
    if (lower === 'sub-task') return { color: 'text-blue-400', icon: '📋' };
    if (lower === 'sub-chore') return { color: 'text-purple-400', icon: '🔧' };
    if (lower === 'task') return { color: 'text-cyan-400', icon: '✅' };
    if (lower === 'chore' || lower === 'technical initiative') return { color: 'text-amber-400', icon: '⚙️' };
    return { color: 'text-zinc-400', icon: '📝' };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MemberDetailView({
    member,
    memberIssues,
    jiraDomain,
    detailLoading,
    detailError,
    expandedSprints,
    sprintCount,
    onBack,
    onToggleSprint,
}: MemberDetailViewProps) {
    const s = member.summary;

    return (
        <div>
            {/* Back + member identity */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>
                <div className="w-px h-6 bg-border" />
                {member.avatarUrl ? (
                    <Image src={member.avatarUrl} alt="" width={36} height={36} className="rounded-full" unoptimized />
                ) : (
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {member.name.charAt(0)}
                    </div>
                )}
                <div>
                    <h3 className="text-lg font-bold text-foreground">{member.name}</h3>
                    <p className="text-xs text-muted-foreground">
                        {member.title} ·{' '}
                        <span className={member.role === 'qa' ? 'text-purple-400' : 'text-blue-400'}>
                            {member.role.toUpperCase()}
                        </span>
                        {' '}· last {sprintCount} sprints
                    </p>
                </div>
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {[
                    { label: 'Story Points', value: String(s.totalStoryPoints), sub: `${s.totalAvailableDays}d avail`, color: 'text-foreground' },
                    { label: 'Utilization', value: `${s.avgUtilization}%`, sub: 'avg across sprints', color: getUtilColor(s.avgUtilization) },
                    { label: 'Completion', value: `${s.avgCompletionRate}%`, sub: `${s.totalDelivered}/${s.totalAssigned} issues`, color: getCompletionColor(s.avgCompletionRate) },
                    { label: 'Cycle Time', value: s.avgCycleTime !== null ? `${s.avgCycleTime}d` : '—', sub: 'avg/issue', color: getCycleColor(s.avgCycleTime) },
                    { label: 'Lead Time', value: s.avgLeadTime !== null ? `${s.avgLeadTime}d` : '—', sub: 'avg/issue', color: getCycleColor(s.avgLeadTime) },
                    { label: 'Throughput', value: String(s.totalThroughput), sub: `${s.avgThroughput}/sprint`, color: 'text-foreground' },
                ].map(card => (
                    <div key={card.label} className="bg-muted/20 border border-border rounded-xl px-4 py-3">
                        <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">{card.label}</div>
                        <div className={`text-xl font-bold tabular-nums ${card.color}`}>{card.value}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</div>
                    </div>
                ))}
            </div>

            {/* Loading */}
            {detailLoading && (
                <div className="flex items-center justify-center py-12 gap-3">
                    <div className="w-5 h-5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                    <span className="text-muted-foreground text-sm">Loading issues…</span>
                </div>
            )}

            {detailError && !detailLoading && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-4">
                    <p className="text-red-400 text-sm">{detailError}</p>
                </div>
            )}

            {/* Sprint sections */}
            {memberIssues && !detailLoading && (
                <div className="space-y-3">
                    {memberIssues.map(sprint => {
                        const isOpen = expandedSprints.has(String(sprint.sprintId));
                        const doneCount = sprint.issues.filter(i => i.statusCategory === 'Done').length;
                        const sprintSP = sprint.issues.reduce((acc, i) => acc + i.storyPoints, 0);

                        return (
                            <div key={sprint.sprintId} className="bg-muted/20 border border-border rounded-xl overflow-hidden">
                                <button
                                    onClick={() => onToggleSprint(sprint.sprintId)}
                                    className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer text-left"
                                >
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sprint.sprintState === 'active' ? 'bg-green-400 animate-pulse' : 'bg-zinc-500'}`} />
                                    <div className="flex-1 min-w-0">
                                        <span className="font-semibold text-foreground text-sm">{sprint.sprintName}</span>
                                        {sprint.sprintState === 'active' && (
                                            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 rounded-full">Active</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span>{sprint.issues.length} issues</span>
                                        <span className="text-green-400">{doneCount} done</span>
                                        <span>{sprintSP} SP</span>
                                    </div>
                                    <svg className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {isOpen && sprint.issues.length > 0 && (
                                    <div className="border-t border-border overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-[11px] text-muted-foreground bg-muted/20">
                                                    <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide whitespace-nowrap">Key</th>
                                                    <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide">Summary</th>
                                                    <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide whitespace-nowrap">Type</th>
                                                    <th className="text-left px-4 py-2 font-semibold uppercase tracking-wide whitespace-nowrap">Status</th>
                                                    <th className="text-right px-4 py-2 font-semibold uppercase tracking-wide whitespace-nowrap">SP</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sprint.issues.map(issue => {
                                                    const typeInfo = getTypeIcon(issue.issueType);
                                                    return (
                                                        <tr key={issue.key} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                                <a
                                                                    href={`https://${jiraDomain || 'jira.atlassian.net'}/browse/${issue.key}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-blue-400 hover:text-blue-300 font-mono text-xs font-medium"
                                                                >
                                                                    {issue.key}
                                                                </a>
                                                            </td>
                                                            <td className="px-4 py-2.5">
                                                                <div className="text-foreground text-sm truncate max-w-[500px]" title={issue.summary}>
                                                                    {issue.summary}
                                                                </div>
                                                                {issue.parentKey && (
                                                                    <div className="text-[10px] text-muted-foreground truncate max-w-[500px] mt-0.5" title={issue.parentSummary || ''}>
                                                                        ↳ {issue.parentKey}: {issue.parentSummary}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                                <span className="text-xs" title={issue.issueType}>
                                                                    {typeInfo.icon}{' '}
                                                                    <span className={typeInfo.color}>{issue.issueType}</span>
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                                <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border ${getStatusBadgeColor(issue.statusCategory)}`}>
                                                                    {issue.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right tabular-nums text-foreground font-medium">
                                                                {issue.storyPoints > 0 ? issue.storyPoints : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {isOpen && sprint.issues.length === 0 && (
                                    <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
                                        No issues assigned in this sprint.
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
