'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useFetch } from '@/hooks/useFetch';
import { MetricsData } from '@/types';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import CollapsibleSection from '@/components/CollapsibleSection';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    LineChart, Line, ResponsiveContainer,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KPIData {
    completionRate: number;
    avgCycleTime: number | null;
    medianCycleTime: number | null;
}

interface VelocityData {
    committedPoints: number;
    actualPoints: number;
    totalPoints: number;
    addedMidSprintPoints: number;
    addedMidSprintCount: number;
    commitmentAccuracy: number;
}

interface CapacityDaysData {
    sprintWorkingDays: number;
    members: Array<{
        accountId: string;
        name: string;
        role: 'engineer' | 'qa';
        title: string;
        excluded: boolean;
        sprintWorkingDays: number;
        leaveDays: number;
        allocationFactor: number;
        theoreticalMandays: number;
    }>;
    teamTheoreticalMandays: number;
}

interface BufferData {
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

interface IssueAccuracy {
    key: string;
    summary: string;
    assigneeId: string | null;
    assigneeName: string | null;
    sp: number;
    expectedHours: number;
    loggedHours: number | null;
    ratio: number | null;
}

interface AccuracyRollup {
    totalSp: number;
    totalExpectedHours: number;
    totalLoggedHours: number;
    ratio: number | null;
    issueCount: number;
    issuesWithData: number;
}

interface AccuracyData {
    team: AccuracyRollup;
    worstIssues: IssueAccuracy[];
}

interface EngineerMetric {
    accountId: string;
    name: string;
    role: 'qa' | 'engineer';
    title: string;
    avatarUrl: string;
    storyPoints: number;
    theoreticalMandays: number;
    assignedAtStart: number;
    completedIssues: number;
    committedIssues: number;
    completionRate: number;
    cycleTimeAvg: number | null;
    leadTimeAvg: number | null;
}

interface NonDevDay {
    date: string;
    reason: string | null;
}

interface Allocation {
    memberName: string;
    type: string;
    capacityPercent: number;
    startDate: string;
    endDate: string;
}

interface SprintPerfResponse {
    sprint: { id: number; name: string; state: string; startDate: string; endDate: string };
    kpis: KPIData;
    velocity: VelocityData;
    capacityDays: CapacityDaysData | null;
    buffer: BufferData | null;
    accuracy: AccuracyData | null;
    engineerMetrics: EngineerMetric[];
    nonDevDays: NonDevDay[];
    allocations: Allocation[];
    jiraDomain: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(hours: number | null): string {
    if (hours === null) return '—';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    if (days < 1.5) return `${hours.toFixed(0)}h`;
    return `${days.toFixed(1)}d`;
}

function getTimeColor(hours: number | null, thresholds: [number, number]): string {
    if (hours === null) return 'text-muted-foreground';
    if (hours <= thresholds[0]) return 'text-green-400';
    if (hours <= thresholds[1]) return 'text-yellow-400';
    return 'text-red-400';
}

function KPIStatusBadge({ value }: { value: number }) {
    let color = 'bg-red-500/20 text-red-400';
    if (value >= 90) color = 'bg-emerald-500/20 text-emerald-400';
    else if (value >= 75) color = 'bg-yellow-500/20 text-yellow-400';
    else if (value >= 50) color = 'bg-orange-500/20 text-orange-400';
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{value.toFixed(1)}%</span>;
}

function KPICard({ label, value, unit, subtitle, status }: { label: string; value: string; unit?: string; subtitle?: string; status?: number }) {
    return (
        <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
            <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">{value}</span>
                {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
                {status !== undefined && <KPIStatusBadge value={status} />}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="p-3 bg-muted/20 border border-border rounded-lg">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
        </div>
    );
}

function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const escape = (v: string | number | null | undefined) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Inner Component (uses useSearchParams) ────────────────────────────────────

function SprintDetailInner() {
    const params = useParams();
    const searchParams = useSearchParams();
    const sprintId = params.id as string;
    const boardId = searchParams.get('boardId');

    // Fetch sprint performance data
    const perfUrl = (sprintId && boardId)
        ? `/api/sprint-performance?sprintId=${sprintId}&boardId=${boardId}`
        : null;
    const { data: perfData, loading: perfLoading, error: perfError } = useFetch<SprintPerfResponse>(perfUrl);

    // Fetch flow metrics data
    const metricsUrl = (sprintId && boardId)
        ? `/api/metrics?sprintId=${sprintId}&boardId=${boardId}`
        : null;
    const { data: metricsData, loading: metricsLoading, error: metricsError } = useFetch<MetricsData>(metricsUrl);

    // AI Summary
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const generateAiSummary = async () => {
        if (!metricsData) return;
        setIsGeneratingAI(true);
        setAiError(null);
        try {
            const response = await fetch('/api/ai-metrics-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'sprint',
                    sprintMetrics: metricsData,
                    sprintId: Number(sprintId),
                    boardId: Number(boardId),
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate summary');
            setAiSummary(data.summary);
        } catch (err) {
            setAiError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsGeneratingAI(false);
        }
    };

    const exportCSV = () => {
        if (!perfData?.engineerMetrics.length) return;
        const headers = ['Name', 'Role', 'Title', 'SP', 'Theoretical Mandays', 'Assigned At Start', 'Completion %', 'Cycle Time', 'Lead Time'];
        const rows = perfData.engineerMetrics.map(e => [
            e.name, e.role, e.title, e.storyPoints, e.theoreticalMandays.toFixed(1),
            e.assignedAtStart.toFixed(1),
            e.completionRate.toFixed(1), e.cycleTimeAvg?.toFixed(1) ?? '', e.leadTimeAvg?.toFixed(1) ?? '',
        ]);
        downloadCSV(`sprint-${perfData.sprint.name.replace(/\s+/g, '-')}.csv`, headers, rows);
    };

    const loading = perfLoading || metricsLoading;
    const error = perfError || metricsError;

    return (
        <div className="min-h-screen bg-background p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        href="/analytics"
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
                    >
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {perfData?.sprint.name || `Sprint ${sprintId}`}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Sprint performance & flow metrics detail
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {metricsData && !aiSummary && (
                        <button
                            onClick={generateAiSummary}
                            disabled={isGeneratingAI}
                            className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-40 flex items-center gap-2"
                        >
                            {isGeneratingAI ? (
                                <Spinner size="sm" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                            )}
                            AI Summary
                        </button>
                    )}
                    <button
                        onClick={exportCSV}
                        disabled={!perfData?.engineerMetrics.length}
                        className="px-4 py-2 bg-muted border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Spinner size="md" />
                    <span className="text-sm">Loading sprint data…</span>
                </div>
            )}

            {/* Error */}
            {error && <ErrorAlert message={error} variant="card" />}

            {/* AI Summary */}
            {(aiSummary || aiError) && (
                <div className="p-6 bg-muted/50 border border-border rounded-xl shadow-sm relative animate-fadeIn">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                        AI Sprint Analysis
                    </h3>
                    {aiError ? (
                        <div className="text-red-400 text-sm">{aiError}</div>
                    ) : (
                        <div className="text-sm text-foreground/80 space-y-4 leading-relaxed">
                            {aiSummary?.split('\n').filter(line => line.trim()).map((line, i) => {
                                if (line.startsWith('**')) {
                                    return (
                                        <h4 key={i} className="text-sm font-bold text-muted-foreground tracking-wide uppercase mt-6 mb-2 first:mt-0 border-b border-border pb-1 inline-block">
                                            {line.replace(/\*\*/g, '')}
                                        </h4>
                                    );
                                }
                                const isListItem = line.startsWith('-') || line.startsWith('*');
                                const cleanLine = line.replace(/^\*?\*?[\-\*]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-bold">$1</strong>');
                                return (
                                    <div key={i} className={`flex gap-3 items-start ${!isListItem ? 'ml-4' : ''}`}>
                                        {isListItem && <span className="text-muted-foreground mt-[5px] flex-shrink-0 text-xs">•</span>}
                                        <span dangerouslySetInnerHTML={{ __html: cleanLine }} className="font-medium" />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Sprint Performance Content */}
            {perfData && !loading && (
                <SprintPerfSection data={perfData} />
            )}

            {/* Flow Metrics Content */}
            {metricsData && !loading && (
                <FlowMetricsSection data={metricsData} />
            )}
        </div>
    );
}

// ─── Sprint Performance Section ────────────────────────────────────────────────

function SprintPerfSection({ data }: { data: SprintPerfResponse }) {
    const { kpis, velocity, capacityDays, buffer, accuracy, engineerMetrics, sprint, nonDevDays, allocations, jiraDomain } = data;
    const utilizationPct = buffer && buffer.theoreticalMandays > 0
        ? (buffer.assignedAtStart / buffer.theoreticalMandays) * 100
        : null;

    return (
        <div className="space-y-6">
            {/* Sprint Overview Header */}
            <div className="bg-muted/20 border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                    <h2 className="text-lg font-bold text-foreground">{sprint.name}</h2>
                    <p className="text-sm text-muted-foreground">
                        {new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                        {new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
                <div className="flex items-center gap-6 text-sm">
                    <div><span className="text-muted-foreground">State:</span>{' '}
                        <span className={`font-medium ${sprint.state === 'active' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            {sprint.state.charAt(0).toUpperCase() + sprint.state.slice(1)}
                        </span>
                    </div>
                    {capacityDays && (
                        <>
                            <div><span className="text-muted-foreground">Working Days:</span> <span className="font-medium text-foreground">{capacityDays.sprintWorkingDays}</span></div>
                            <div><span className="text-muted-foreground">Theoretical Mandays:</span> <span className="font-medium text-foreground">{capacityDays.teamTheoreticalMandays.toFixed(1)}</span></div>
                        </>
                    )}
                </div>
            </div>

            {/* 8 KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard
                    label="Utilization"
                    value={utilizationPct !== null ? utilizationPct.toFixed(1) : '—'}
                    unit={utilizationPct !== null ? '%' : undefined}
                    status={utilizationPct ?? undefined}
                    subtitle={buffer ? `${buffer.assignedAtStart} / ${buffer.theoreticalMandays} MD assigned` : undefined}
                />
                <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Buffer</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-foreground">{buffer ? buffer.buffer.toFixed(1) : '—'}</span>
                        <span className="text-sm text-muted-foreground">MD</span>
                        {buffer && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${buffer.verdict === 'fit' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {buffer.verdict === 'fit' ? 'Fit' : 'Overload'}
                            </span>
                        )}
                    </div>
                    {buffer && <p className="text-xs text-muted-foreground">{buffer.theoreticalMandays.toFixed(1)} theoretical − {buffer.assignedAtStart.toFixed(1)} assigned</p>}
                </div>
                <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Added Mid-Sprint</p>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-bold ${buffer && buffer.verdict === 'overload' ? 'text-red-400' : 'text-foreground'}`}>{buffer ? buffer.addedDuringSprint.toFixed(1) : '—'}</span>
                        <span className="text-sm text-muted-foreground">MD</span>
                    </div>
                    {buffer && buffer.overloadSP > 0 && <p className="text-xs text-red-400">{buffer.overloadSP.toFixed(1)} MD over buffer</p>}
                </div>
                <KPICard
                    label="Task Accuracy"
                    value={accuracy?.team.ratio !== null && accuracy?.team.ratio !== undefined ? accuracy.team.ratio.toFixed(2) : '—'}
                    unit={accuracy?.team.ratio !== null && accuracy?.team.ratio !== undefined ? 'x' : undefined}
                    subtitle={accuracy ? `${accuracy.team.totalLoggedHours.toFixed(1)}h logged / ${accuracy.team.totalExpectedHours.toFixed(1)}h expected` : undefined}
                />
                <KPICard label="Completion Rate" value={kpis.completionRate.toFixed(1)} unit="%" status={kpis.completionRate} />
                <KPICard label="Velocity" value={String(velocity.actualPoints)} unit="SP" subtitle={`${velocity.committedPoints} committed, ${velocity.commitmentAccuracy}% accuracy`} />
                <KPICard label="Avg Cycle Time" value={kpis.avgCycleTime?.toFixed(1) ?? '—'} unit="days" />
                <KPICard label="Median Cycle Time" value={kpis.medianCycleTime?.toFixed(1) ?? '—'} unit="days" />
            </div>

            {/* Worst Estimated Tasks */}
            {accuracy && accuracy.worstIssues.length > 0 && (
                <CollapsibleSection title={`Worst Estimated Tasks (${accuracy.worstIssues.length})`} defaultOpen={false}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-muted-foreground border-b border-border">
                                    <th className="pb-2 pr-4">Key</th>
                                    <th className="pb-2 pr-4">Summary</th>
                                    <th className="pb-2 pr-4 text-right">SP</th>
                                    <th className="pb-2 pr-4 text-right">Expected</th>
                                    <th className="pb-2 pr-4 text-right">Logged</th>
                                    <th className="pb-2 text-right">Ratio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accuracy.worstIssues.map(issue => (
                                    <tr key={issue.key} className="border-b border-border/50">
                                        <td className="py-2 pr-4 font-medium">
                                            {jiraDomain ? (
                                                <a
                                                    href={`https://${jiraDomain}/browse/${issue.key}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-purple-400 hover:underline"
                                                >
                                                    {issue.key}
                                                </a>
                                            ) : (
                                                <span className="text-foreground">{issue.key}</span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-4 text-muted-foreground max-w-[300px] truncate">{issue.summary}</td>
                                        <td className="py-2 pr-4 text-right">{issue.sp}</td>
                                        <td className="py-2 pr-4 text-right">{issue.expectedHours.toFixed(1)}h</td>
                                        <td className="py-2 pr-4 text-right">{issue.loggedHours !== null ? `${issue.loggedHours.toFixed(1)}h` : '—'}</td>
                                        <td className="py-2 text-right font-medium">{issue.ratio !== null ? `${issue.ratio.toFixed(2)}x` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CollapsibleSection>
            )}

            {/* Totals Row */}
            <CollapsibleSection title="Totals & Velocity" defaultOpen={false}>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                    <Stat label="Committed SP" value={velocity.committedPoints} />
                    <Stat label="Actual SP" value={velocity.actualPoints} />
                    <Stat label="Added Mid-Sprint" value={`${velocity.addedMidSprintPoints} SP (${velocity.addedMidSprintCount} issues)`} />
                    <Stat label="Total SP" value={velocity.totalPoints} />
                    <Stat label="Commitment Accuracy" value={`${velocity.commitmentAccuracy}%`} />
                    {capacityDays && <Stat label="Theoretical Mandays" value={capacityDays.teamTheoreticalMandays.toFixed(1)} />}
                </div>
            </CollapsibleSection>

            {/* Non-Dev Days */}
            {nonDevDays.length > 0 && (
                <CollapsibleSection title={`Non-Dev Days (${nonDevDays.length})`} defaultOpen={false}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {nonDevDays.map((nd, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-muted/20 border border-border rounded-lg">
                                <div className="w-2 h-2 rounded-full bg-orange-400" />
                                <div>
                                    <p className="text-sm font-medium text-foreground">{new Date(nd.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                    <p className="text-xs text-muted-foreground">{nd.reason || 'No reason specified'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {/* Capacity Allocations */}
            {allocations.length > 0 && (
                <CollapsibleSection title={`Capacity Allocations (${allocations.length})`} defaultOpen={false}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-muted-foreground border-b border-border">
                                    <th className="pb-2 pr-4">Member</th>
                                    <th className="pb-2 pr-4">Type</th>
                                    <th className="pb-2 pr-4">Capacity</th>
                                    <th className="pb-2 pr-4">Period</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allocations.map((a, i) => (
                                    <tr key={i} className="border-b border-border/50">
                                        <td className="py-2 pr-4 font-medium text-foreground">{a.memberName}</td>
                                        <td className="py-2 pr-4"><span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">{a.type}</span></td>
                                        <td className="py-2 pr-4">{a.capacityPercent}%</td>
                                        <td className="py-2 pr-4 text-muted-foreground">{a.startDate} → {a.endDate}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CollapsibleSection>
            )}

            {/* Engineer Metrics Table */}
            <CollapsibleSection title="Engineer Metrics">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="pb-2 pr-3">Engineer</th>
                                <th className="pb-2 pr-3 text-right">SP</th>
                                <th className="pb-2 pr-3 text-right">Theoretical MD</th>
                                <th className="pb-2 pr-3 text-right">Assigned At Start</th>
                                <th className="pb-2 pr-3 text-right">Completion</th>
                                <th className="pb-2 pr-3 text-right">Cycle</th>
                                <th className="pb-2 text-right">Lead</th>
                            </tr>
                        </thead>
                        <tbody>
                            {engineerMetrics.map(e => (
                                <tr key={e.accountId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                    <td className="py-2.5 pr-3">
                                        <div className="flex items-center gap-2">
                                            {e.avatarUrl ? (
                                                <img src={e.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">{e.name.charAt(0)}</div>
                                            )}
                                            <div>
                                                <p className="font-medium text-foreground">{e.name}</p>
                                                <p className="text-xs text-muted-foreground">{e.title} · {e.role}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-2.5 pr-3 text-right font-medium">{e.storyPoints}</td>
                                    <td className="py-2.5 pr-3 text-right">{e.theoreticalMandays.toFixed(1)}</td>
                                    <td className="py-2.5 pr-3 text-right">{e.assignedAtStart.toFixed(1)}</td>
                                    <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={e.completionRate} /></td>
                                    <td className="py-2.5 pr-3 text-right text-muted-foreground">{e.cycleTimeAvg?.toFixed(1) ?? '—'}</td>
                                    <td className="py-2.5 text-right text-muted-foreground">{e.leadTimeAvg?.toFixed(1) ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CollapsibleSection>
        </div>
    );
}

// ─── Flow Metrics Section ──────────────────────────────────────────────────────

function FlowMetricsSection({ data }: { data: MetricsData }) {
    return (
        <div className="space-y-8 border-t border-border pt-8">
            <div className="mb-2">
                <h2 className="text-xl font-bold text-foreground">Flow Metrics</h2>
                <p className="text-sm text-muted-foreground">Delivery speed, cycle time, and issue breakdown</p>
            </div>

            {/* Time Metrics Cards (MTD, MTT, MTTD) */}
            <TimeMetricsCards data={data} />

            {/* Cycle Time / Lead Time / Throughput */}
            <CycleTimeCards data={data} />

            {/* Issue Breakdown */}
            <IssueBreakdownCards data={data} />

            {/* Per-member flow metrics */}
            {data.memberTimeMetrics && data.memberTimeMetrics.length > 0 && (
                <CollapsibleSection title="Team Delivery Performance" defaultOpen={false}>
                    <MemberTimeMetricsTable data={data} />
                </CollapsibleSection>
            )}

            {/* Issue Totals */}
            <IssueTotalsCards data={data} />

            {/* Weekly Charts */}
            <WeeklyIssueChart data={data} />
            <CompletionRateChart data={data} />
        </div>
    );
}

// ─── Flow Metric Sub-Components ────────────────────────────────────────────────

function TimeMetricsCards({ data }: { data: MetricsData }) {
    const { timeMetrics } = data;
    const cards = [
        { label: 'Mean Time to Deliver', sublabel: 'Sprint Start → In Progress', value: timeMetrics.meanTimeToDeliver, sample: timeMetrics.sampleSize.deliver, thresholds: [24, 72] as [number, number], icon: '⚡', color: 'text-blue-400' },
        { label: 'Mean Time to Test', sublabel: 'In Progress → QA/Review', value: timeMetrics.meanTimeToTest, sample: timeMetrics.sampleSize.test, thresholds: [48, 120] as [number, number], icon: '🧪', color: 'text-purple-400' },
        { label: 'Mean Time to Done', sublabel: 'Sprint Start → Done', value: timeMetrics.meanTimeToDone, sample: timeMetrics.sampleSize.done, thresholds: [120, 240] as [number, number], icon: '✅', color: 'text-green-400' },
    ];

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-foreground rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-background" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-foreground">Delivery Speed</h3>
                    <p className="text-sm text-muted-foreground">Average time for issue lifecycle stages</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map(card => (
                    <div key={card.label} className="p-6 bg-muted/50 rounded-xl border border-border">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xl">{card.icon}</span>
                            <div>
                                <div className="text-sm font-semibold text-foreground">{card.label}</div>
                                <div className="text-[10px] text-muted-foreground">{card.sublabel}</div>
                            </div>
                        </div>
                        <div className={`text-4xl font-bold mb-1 ${getTimeColor(card.value, card.thresholds)}`}>
                            {formatDuration(card.value)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Based on {card.sample} issue{card.sample !== 1 ? 's' : ''}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CycleTimeCards({ data }: { data: MetricsData }) {
    const ct = data.cycleTimeMetrics;
    if (!ct) return null;

    const getCycleColor = (days: number | null, thresholds: [number, number]) => {
        if (days === null) return 'text-muted-foreground';
        if (days <= thresholds[0]) return 'text-green-400';
        if (days <= thresholds[1]) return 'text-yellow-400';
        return 'text-red-400';
    };

    const cards = [
        { label: 'Avg Cycle Time', sublabel: 'In Progress → Done', value: ct.avgCycleTimeDays, display: ct.avgCycleTimeDays !== null ? `${ct.avgCycleTimeDays}d` : '—', color: getCycleColor(ct.avgCycleTimeDays, [5, 10]) },
        { label: 'Avg Lead Time', sublabel: 'Created → Done', value: ct.avgLeadTimeDays, display: ct.avgLeadTimeDays !== null ? `${ct.avgLeadTimeDays}d` : '—', color: getCycleColor(ct.avgLeadTimeDays, [7, 14]) },
        { label: 'Throughput', sublabel: 'Issues completed', value: ct.throughput, display: `${ct.throughput}`, color: 'text-foreground' },
    ];

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-foreground">Cycle & Lead Time</h3>
                    <p className="text-sm text-muted-foreground">Average business days · {ct.sampleSize} issues measured</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map(card => (
                    <div key={card.label} className="p-6 bg-muted/50 rounded-xl border border-border">
                        <div className="text-sm font-semibold text-foreground mb-1">{card.label}</div>
                        <div className="text-[10px] text-muted-foreground mb-3">{card.sublabel}</div>
                        <div className={`text-4xl font-bold ${card.color}`}>{card.display}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function IssueBreakdownCards({ data }: { data: MetricsData }) {
    const bd = data.issueBreakdown;
    if (!bd) return null;

    const getCompletionColor = (delivered: number, total: number) => {
        if (total === 0) return 'text-muted-foreground';
        const pct = (delivered / total) * 100;
        if (pct >= 90) return 'text-green-400';
        if (pct >= 70) return 'text-blue-400';
        if (pct >= 50) return 'text-yellow-400';
        return 'text-red-400';
    };

    const cards = [
        { label: 'Sub-Tasks', delivered: bd.subTasks.delivered, total: bd.subTasks.total, bg: 'bg-blue-500/20' },
        { label: 'Sub-Chores', delivered: bd.subChores.delivered, total: bd.subChores.total, bg: 'bg-purple-500/20' },
        { label: 'Other', delivered: bd.other.delivered, total: bd.other.total, bg: 'bg-pink-500/20' },
    ];

    const totalDelivered = bd.subTasks.delivered + bd.subChores.delivered + bd.other.delivered;
    const totalAll = bd.subTasks.total + bd.subChores.total + bd.other.total;

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-foreground">Issue Breakdown</h3>
                    <p className="text-sm text-muted-foreground">Delivered vs total · {totalDelivered}/{totalAll} completed</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map(card => {
                    const pct = card.total > 0 ? Math.round((card.delivered / card.total) * 100) : 0;
                    return (
                        <div key={card.label} className="p-6 bg-muted/50 rounded-xl border border-border">
                            <div className="text-sm font-semibold text-foreground mb-3">{card.label}</div>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className={`text-3xl font-bold ${getCompletionColor(card.delivered, card.total)}`}>{card.delivered}</span>
                                <span className="text-lg text-muted-foreground">/ {card.total}</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${card.bg.replace('/20', '')}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1">{pct}% completion</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function MemberTimeMetricsTable({ data }: { data: MetricsData }) {
    const { memberTimeMetrics } = data;
    const getCycleColor = (days: number | null) => {
        if (days === null) return 'text-muted-foreground/50';
        if (days <= 2) return 'text-green-400';
        if (days <= 5) return 'text-blue-400';
        if (days <= 10) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
                <thead>
                    <tr className="bg-muted/30 text-xs uppercase text-muted-foreground tracking-wider">
                        <th className="p-3 pl-4 font-medium">Team Member</th>
                        <th className="p-3 font-medium text-center">MTD</th>
                        <th className="p-3 font-medium text-center border-l border-border">MTTD</th>
                        <th className="p-3 font-medium text-center border-l border-border">Cycle Time</th>
                        <th className="p-3 font-medium text-center border-l border-border">Lead Time</th>
                        <th className="p-3 font-medium text-center border-l border-border">Throughput</th>
                        <th className="p-3 font-medium text-center border-l border-border">Sub-Tasks</th>
                        <th className="p-3 font-medium text-center border-l border-border">Sub-Chores</th>
                        <th className="p-3 font-medium text-center border-l border-border">Other</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground/70 bg-background/30">
                    {memberTimeMetrics.map(member => (
                        <tr key={member.accountId} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3 pl-4">
                                <div className="flex items-center gap-2.5">
                                    {member.avatarUrl ? (
                                        <img src={member.avatarUrl} alt={member.displayName} className="w-6 h-6 rounded-full" />
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs uppercase">
                                            {member.displayName.slice(0, 2)}
                                        </div>
                                    )}
                                    <span className="font-semibold text-foreground">{member.displayName}</span>
                                </div>
                            </td>
                            <td className="p-3 text-center">
                                {member.meanTimeToDeliver !== null ? (
                                    <span className={`font-mono font-bold ${getTimeColor(member.meanTimeToDeliver, [24, 72])}`}>{formatDuration(member.meanTimeToDeliver)}</span>
                                ) : <span className="text-muted-foreground/50">—</span>}
                            </td>
                            <td className="p-3 text-center border-l border-border">
                                {member.meanTimeToDone !== null ? (
                                    <span className={`font-mono font-bold ${getTimeColor(member.meanTimeToDone, [120, 240])}`}>{formatDuration(member.meanTimeToDone)}</span>
                                ) : <span className="text-muted-foreground/50">—</span>}
                            </td>
                            <td className="p-3 text-center border-l border-border">
                                <span className={`font-mono font-bold ${getCycleColor(member.cycleTimeAvg)}`}>{member.cycleTimeAvg !== null ? `${member.cycleTimeAvg}d` : '—'}</span>
                            </td>
                            <td className="p-3 text-center border-l border-border">
                                <span className={`font-mono font-bold ${getCycleColor(member.leadTimeAvg)}`}>{member.leadTimeAvg !== null ? `${member.leadTimeAvg}d` : '—'}</span>
                            </td>
                            <td className="p-3 text-center border-l border-border font-bold text-foreground">{member.throughput}</td>
                            <td className="p-3 text-center border-l border-border tabular-nums">
                                <span className="font-semibold text-foreground">{member.subTasks.delivered}</span><span className="text-muted-foreground">/{member.subTasks.total}</span>
                            </td>
                            <td className="p-3 text-center border-l border-border tabular-nums">
                                <span className="font-semibold text-foreground">{member.subChores.delivered}</span><span className="text-muted-foreground">/{member.subChores.total}</span>
                            </td>
                            <td className="p-3 text-center border-l border-border tabular-nums">
                                <span className="font-semibold text-foreground">{member.other.delivered}</span><span className="text-muted-foreground">/{member.other.total}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function IssueTotalsCards({ data }: { data: MetricsData }) {
    const { totals } = data;
    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className="text-3xl font-bold text-foreground mb-1">{totals.totalCount}</div>
                <div className="text-xs text-muted-foreground">Total Issues</div>
            </div>
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className="text-3xl font-bold text-blue-400 mb-1">{totals.storyCount}</div>
                <div className="text-xs text-muted-foreground">Stories</div>
            </div>
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className="text-3xl font-bold text-blue-400 mb-1">{totals.taskCount}</div>
                <div className="text-xs text-muted-foreground">Tasks</div>
            </div>
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className="text-3xl font-bold text-indigo-400 mb-1">{totals.testCount}</div>
                <div className="text-xs text-muted-foreground">Tests</div>
            </div>
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className={`text-3xl font-bold mb-1 ${totals.completionRate >= 80 ? 'text-green-400' : totals.completionRate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {totals.completionRate.toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">Completion Rate</div>
            </div>
        </div>
    );
}

function WeeklyIssueChart({ data }: { data: MetricsData }) {
    const chartData = data.weeklyMetrics.map(w => ({
        name: w.weekLabel,
        Story: w.storyCount,
        Task: w.taskCount,
        Test: w.testCount,
    }));

    if (chartData.length === 0) return null;

    return (
        <div className="bg-muted/30 rounded-xl p-6 border border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-1">Issue Count by Type</h3>
            <p className="text-xs text-muted-foreground mb-4">Story, Task, and Test issues per week</p>
            <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={{ stroke: '#4B5563' }} />
                    <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={{ stroke: '#4B5563' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#F3F4F6' }} />
                    <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
                    <Bar dataKey="Story" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Task" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Test" fill="#F472B6" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function CompletionRateChart({ data }: { data: MetricsData }) {
    const chartData = data.weeklyMetrics.map(w => ({
        name: w.weekLabel,
        'Completion %': parseFloat(w.completionRate.toFixed(1)),
        'Total Issues': w.totalCount,
        'Done Issues': w.doneCount,
    }));

    if (chartData.length === 0) return null;

    return (
        <div className="bg-muted/30 rounded-xl p-6 border border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-1">Completion Rate</h3>
            <p className="text-xs text-muted-foreground mb-4">Percentage of issues completed per week</p>
            <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={{ stroke: '#4B5563' }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={{ stroke: '#4B5563' }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#F3F4F6' }}
                        formatter={(value: any, name: any) => name === 'Completion %' ? [`${value}%`, name] : [value, name]}
                    />
                    <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
                    <Line type="monotone" dataKey="Completion %" stroke="#34D399" strokeWidth={3} dot={{ fill: '#34D399', r: 5, strokeWidth: 2 }} activeDot={{ r: 7 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Page Export (with Suspense for useSearchParams) ────────────────────────────

export default function SprintDetailPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <Spinner size="lg" />
            </div>
        }>
            <SprintDetailInner />
        </Suspense>
    );
}
