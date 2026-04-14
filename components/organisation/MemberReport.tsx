'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { getUtilColor } from '@/lib/ui-colors';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import MemberDetailView from './MemberDetailView';

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
        return (
            <MemberDetailView
                member={selectedMember}
                memberIssues={memberIssues}
                jiraDomain={jiraDomain}
                detailLoading={detailLoading}
                detailError={detailError}
                expandedSprints={expandedSprints}
                sprintCount={sprintCount}
                onBack={() => setSelectedMember(null)}
                onToggleSprint={toggleSprint}
            />
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
                    <Spinner size="md" />
                    <span className="text-muted-foreground text-sm ml-3">Loading member report...</span>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <ErrorAlert message={error} variant="card" />
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
