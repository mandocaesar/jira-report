'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SprintData {
    sprintId: number;
    sprintName: string;
    storyPoints: number;
    availableDays: number;
    utilizationPercent: number;
    deliveredSubTasks: number;
    deliveredSubChores: number;
    deliveredOther: number;
    totalSubTasks: number;
    totalSubChores: number;
    totalOther: number;
    completionRate: number;
    cycleTimeAvg: number | null;
    leadTimeAvg: number | null;
    throughput: number;
}

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
    sprints: SprintData[];
    summary: MemberSummary;
}

interface TeamReportData {
    boardId: number;
    sprintCount: number;
    sprintNames: string[];
    members: MemberData[];
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function getUtilColor(pct: number) {
    if (pct >= 100) return 'text-green-500';
    if (pct >= 80) return 'text-blue-500';
    if (pct >= 60) return 'text-yellow-500';
    return 'text-red-500';
}

function getCompletionColor(pct: number) {
    if (pct >= 90) return 'text-green-500';
    if (pct >= 70) return 'text-blue-500';
    if (pct >= 50) return 'text-yellow-500';
    return 'text-red-500';
}

function getBarWidth(pct: number) { return `${Math.min(pct, 100)}%`; }

function getBarColor(pct: number) {
    if (pct >= 100) return 'bg-green-500';
    if (pct >= 80) return 'bg-blue-500';
    if (pct >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
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

interface MemberReportProps {
    boardId: number;
}

export default function MemberReport({ boardId }: MemberReportProps) {
    const [sprintCount, setSprintCount] = useState(5);
    const [data, setData] = useState<TeamReportData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());

    // Member detail state
    const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
    const [memberIssues, setMemberIssues] = useState<MemberSprint[] | null>(null);
    const [jiraDomain, setJiraDomain] = useState('');
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set());

    const fetchReport = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/team-report?boardId=${boardId}&sprintCount=${sprintCount}`);
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setData(result.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load report');
        } finally {
            setLoading(false);
        }
    }, [boardId, sprintCount]);

    useEffect(() => {
        setSelectedMember(null);
        fetchReport();
    }, [fetchReport]);

    const openMemberDetail = useCallback(async (member: MemberData) => {
        setSelectedMember(member);
        setMemberIssues(null);
        setDetailError(null);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/team-report/member?boardId=${boardId}&sprintCount=${sprintCount}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to load');
            setJiraDomain(json.data.jiraDomain || '');
            const found = (json.data.members as Array<{ accountId: string; sprints: MemberSprint[] }>)
                .find(m => m.accountId === member.accountId);
            setMemberIssues(found?.sprints || []);
            const active = new Set<string>();
            found?.sprints?.forEach(s => {
                if (s.sprintState === 'active') active.add(String(s.sprintId));
            });
            setExpandedSprints(active);
        } catch (err) {
            setDetailError(err instanceof Error ? err.message : 'Failed to load issues');
        } finally {
            setDetailLoading(false);
        }
    }, [boardId, sprintCount]);

    const toggleSprint = (sprintId: number) => {
        const key = String(sprintId);
        setExpandedSprints(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleMember = (id: string) => {
        setExpandedMembers(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // ── Member detail view ─────────────────────────────────────────────────────

    if (selectedMember) {
        const s = selectedMember.summary;
        return (
            <div>
                {/* Back + member identity */}
                <div className="flex items-center gap-3 mb-6">
                    <button
                        onClick={() => setSelectedMember(null)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                    </button>
                    <div className="w-px h-6 bg-border" />
                    {selectedMember.avatarUrl ? (
                        <Image src={selectedMember.avatarUrl} alt="" width={36} height={36} className="rounded-full" unoptimized />
                    ) : (
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                            {selectedMember.name.charAt(0)}
                        </div>
                    )}
                    <div>
                        <h3 className="text-lg font-bold text-foreground">{selectedMember.name}</h3>
                        <p className="text-xs text-muted-foreground">
                            {selectedMember.title} ·{' '}
                            <span className={selectedMember.role === 'qa' ? 'text-purple-400' : 'text-blue-400'}>
                                {selectedMember.role.toUpperCase()}
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
                                        onClick={() => toggleSprint(sprint.sprintId)}
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

    // ── Overview table ─────────────────────────────────────────────────────────

    return (
        <div>
            {/* Controls */}
            <div className="flex items-center justify-between mb-4">
                <p className="text-muted-foreground text-xs">Per-member sprint metrics · click a member to see issues</p>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Sprints:</label>
                    <select
                        value={sprintCount}
                        onChange={(e) => setSprintCount(parseInt(e.target.value))}
                        className="bg-muted border border-border rounded-lg px-2 py-1 text-sm text-foreground"
                    >
                        {[3, 5, 7, 10].map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-muted-foreground text-sm ml-3">Loading member report...</span>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {/* Data */}
            {data && !loading && (
                <div className="space-y-3">
                    {/* Summary bar */}
                    <div className="p-3 bg-muted/30 border border-border rounded-xl flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">{data.members.length}</span> members across{' '}
                            <span className="font-semibold text-foreground">{data.sprintCount}</span> sprints
                        </div>
                        <div className="text-xs text-muted-foreground hidden md:block">
                            {data.sprintNames.join(' · ')}
                        </div>
                    </div>

                    {/* Table Header (desktop) */}
                    <div className="hidden lg:grid lg:grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr_0.6fr_auto] gap-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <div>Member</div>
                        <div className="text-right">Story Points</div>
                        <div className="text-right">Utilization</div>
                        <div className="text-right">Completion</div>
                        <div className="text-right">Cycle Time</div>
                        <div className="text-right">Lead Time</div>
                        <div className="text-right">Throughput</div>
                        <div className="text-right">Sub-Tasks</div>
                        <div className="text-right">Sub-Chores</div>
                        <div className="text-right">Other</div>
                        <div className="w-24" />
                    </div>

                    {/* Member Rows */}
                    {data.members.map((member) => {
                        const isExpanded = expandedMembers.has(member.accountId);
                        const ms = member.summary;

                        return (
                            <div key={member.accountId} className="bg-muted/20 border border-border rounded-xl overflow-hidden">
                                {/* Main Row */}
                                <div className="grid grid-cols-1 lg:grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr_0.6fr_auto] gap-2 px-4 py-3 items-center">
                                    <button
                                        onClick={() => toggleMember(member.accountId)}
                                        className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                                    >
                                        <svg className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                        {member.avatarUrl ? (
                                            <Image src={member.avatarUrl} alt="" width={32} height={32} className="rounded-full shrink-0" unoptimized />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                                                {member.name.charAt(0)}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-foreground truncate">{member.name}</div>
                                            <div className="text-[11px] text-muted-foreground">
                                                {member.title} ·{' '}
                                                <span className={member.role === 'qa' ? 'text-purple-400' : 'text-blue-400'}>
                                                    {member.role.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Desktop stats */}
                                    <div className="hidden lg:block text-right">
                                        <div className="text-sm font-bold text-foreground tabular-nums">{ms.totalStoryPoints}</div>
                                        <div className="text-[10px] text-muted-foreground">{ms.totalAvailableDays}d avail</div>
                                    </div>
                                    <div className="hidden lg:block text-right">
                                        <div className={`text-sm font-bold tabular-nums ${getUtilColor(ms.avgUtilization)}`}>{ms.avgUtilization}%</div>
                                        <div className="mt-0.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${getBarColor(ms.avgUtilization)}`} style={{ width: getBarWidth(ms.avgUtilization) }} />
                                        </div>
                                    </div>
                                    <div className="hidden lg:block text-right">
                                        <div className={`text-sm font-bold tabular-nums ${getCompletionColor(ms.avgCompletionRate)}`}>{ms.avgCompletionRate}%</div>
                                        <div className="text-[10px] text-muted-foreground">{ms.totalDelivered}/{ms.totalAssigned}</div>
                                    </div>
                                    <div className="hidden lg:block text-right">
                                        <div className={`text-sm font-bold tabular-nums ${getCycleColor(ms.avgCycleTime)}`}>
                                            {ms.avgCycleTime !== null ? `${ms.avgCycleTime}d` : '—'}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">avg/issue</div>
                                    </div>
                                    <div className="hidden lg:block text-right">
                                        <div className={`text-sm font-bold tabular-nums ${getCycleColor(ms.avgLeadTime)}`}>
                                            {ms.avgLeadTime !== null ? `${ms.avgLeadTime}d` : '—'}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">avg/issue</div>
                                    </div>
                                    <div className="hidden lg:block text-right">
                                        <div className="text-sm font-bold text-foreground tabular-nums">{ms.totalThroughput}</div>
                                        <div className="text-[10px] text-muted-foreground">{ms.avgThroughput}/sprint</div>
                                    </div>
                                    <div className="hidden lg:block text-right">
                                        <div className="text-sm font-semibold text-foreground tabular-nums">{ms.totalDeliveredSubTasks}</div>
                                    </div>
                                    <div className="hidden lg:block text-right">
                                        <div className="text-sm font-semibold text-foreground tabular-nums">{ms.totalDeliveredSubChores}</div>
                                    </div>
                                    <div className="hidden lg:block text-right">
                                        <div className="text-sm font-semibold text-foreground tabular-nums">{ms.totalDeliveredOther}</div>
                                    </div>

                                    {/* View Issues button */}
                                    <div className="hidden lg:flex justify-end">
                                        <button
                                            onClick={() => openMemberDetail(member)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                                        >
                                            View Issues
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Mobile stats */}
                                    <div className="lg:hidden flex flex-wrap gap-3 mt-1 text-xs items-center">
                                        <span><span className="text-muted-foreground">SP:</span> <span className="font-bold">{ms.totalStoryPoints}</span></span>
                                        <span><span className="text-muted-foreground">Util:</span> <span className={`font-bold ${getUtilColor(ms.avgUtilization)}`}>{ms.avgUtilization}%</span></span>
                                        <span><span className="text-muted-foreground">Done:</span> <span className={`font-bold ${getCompletionColor(ms.avgCompletionRate)}`}>{ms.avgCompletionRate}%</span></span>
                                        <span><span className="text-muted-foreground">Cycle:</span> <span className={`font-bold ${getCycleColor(ms.avgCycleTime)}`}>{ms.avgCycleTime !== null ? `${ms.avgCycleTime}d` : '—'}</span></span>
                                        <span><span className="text-muted-foreground">Thru:</span> <span className="font-bold">{ms.totalThroughput}</span></span>
                                        <button
                                            onClick={() => openMemberDetail(member)}
                                            className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg transition-colors cursor-pointer"
                                        >
                                            Issues
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Sprint Metrics */}
                                {isExpanded && (
                                    <div className="border-t border-border bg-muted/10">
                                        <div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-2 px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                                            <div>Sprint</div>
                                            <div className="text-right">SP / Avail</div>
                                            <div className="text-right">Utilization</div>
                                            <div className="text-right">Completion</div>
                                            <div className="text-right">Cycle Time</div>
                                            <div className="text-right">Lead Time</div>
                                            <div className="text-right">Throughput</div>
                                            <div className="text-right">Sub-Tasks</div>
                                            <div className="text-right">Sub-Chores</div>
                                            <div className="text-right">Other</div>
                                        </div>
                                        {member.sprints.map((sp) => (
                                            <div key={sp.sprintId} className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-2 px-4 py-2 text-xs hover:bg-muted/20 transition-colors border-b border-border/50 last:border-0">
                                                <div className="text-foreground/80 truncate">{sp.sprintName}</div>
                                                <div className="text-right tabular-nums">
                                                    <span className="font-semibold text-foreground">{sp.storyPoints}</span>
                                                    <span className="text-muted-foreground"> / {sp.availableDays}d</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`font-semibold tabular-nums ${getUtilColor(sp.utilizationPercent)}`}>{sp.utilizationPercent}%</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`font-semibold tabular-nums ${getCompletionColor(sp.completionRate)}`}>{sp.completionRate}%</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`font-semibold tabular-nums ${getCycleColor(sp.cycleTimeAvg)}`}>
                                                        {sp.cycleTimeAvg !== null ? `${sp.cycleTimeAvg}d` : '—'}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`font-semibold tabular-nums ${getCycleColor(sp.leadTimeAvg)}`}>
                                                        {sp.leadTimeAvg !== null ? `${sp.leadTimeAvg}d` : '—'}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-semibold text-foreground tabular-nums">{sp.throughput}</span>
                                                </div>
                                                <div className="text-right tabular-nums">
                                                    <span className="font-semibold text-foreground">{sp.deliveredSubTasks}</span>
                                                    <span className="text-muted-foreground">/{sp.totalSubTasks}</span>
                                                </div>
                                                <div className="text-right tabular-nums">
                                                    <span className="font-semibold text-foreground">{sp.deliveredSubChores}</span>
                                                    <span className="text-muted-foreground">/{sp.totalSubChores}</span>
                                                </div>
                                                <div className="text-right tabular-nums">
                                                    <span className="font-semibold text-foreground">{sp.deliveredOther}</span>
                                                    <span className="text-muted-foreground">/{sp.totalOther}</span>
                                                </div>
                                            </div>
                                        ))}
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
