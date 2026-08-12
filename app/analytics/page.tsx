'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import Link from 'next/link';
import BoardSelector from '@/components/BoardSelector';
import SprintSelector from '@/components/SprintSelector';
import EmReportTable, { EmReportResponse } from '@/components/sprint/EmReportTable';
import { SprintVelocityData, SprintVelocityEntry } from '@/types';
import { useFetch } from '@/hooks/useFetch';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, BarChart, ReferenceLine,
} from 'recharts';

const TeamScorecard = lazy(() => import('@/components/metrics/TeamScorecard'));
const SquadGrid = lazy(() => import('@/components/metrics/SquadGrid'));
const VelocityOverview = lazy(() => import('@/components/metrics/VelocityOverview'));

// ─── History Types ─────────────────────────────────────────────────────────────

interface HistoryRow {
    sprintId: number;
    name: string;
    state: string;
    startDate: string;
    endDate: string;
    workingDays: number;
    committedPoints: number;
    actualPoints: number;
    addedMidSprint: number;
    commitmentAccuracy: number;
    theoreticalMandays: number;
    assignedAtStart: number;
    utilization: number;
    completionRate: number;
    avgCycleTime: number | null;
    totalIssues: number;
    completedIssues: number;
    memberCount: number;
}

// ─── Velocity Helpers ──────────────────────────────────────────────────────────

function shortSprintLabel(name: string): string {
    const m = name.match(/(\d+)$/);
    return m ? `S${m[1]}` : name.slice(-6);
}

function accuracyColor(pct: number): string {
    if (pct >= 80) return 'text-green-400';
    if (pct >= 60) return 'text-yellow-400';
    return 'text-red-400';
}

function deltaColor(v: number | null): string {
    if (v === null) return 'text-muted-foreground';
    if (v > 0) return 'text-red-400';
    if (v < 0) return 'text-green-400';
    return 'text-muted-foreground';
}

function fmtDelta(v: number | null): string {
    if (v === null) return '—';
    return v === 0 ? '0' : v > 0 ? `+${v}` : String(v);
}

function SectionLoader() {
    return (
        <div className="flex items-center justify-center py-8">
            <Spinner size="md" />
        </div>
    );
}

// ─── History Status Badge ──────────────────────────────────────────────────────

function KPIStatusBadge({ value }: { value: number }) {
    let color = 'bg-red-500/20 text-red-400';
    if (value >= 90) color = 'bg-emerald-500/20 text-emerald-400';
    else if (value >= 75) color = 'bg-yellow-500/20 text-yellow-400';
    else if (value >= 50) color = 'bg-orange-500/20 text-orange-400';
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{value.toFixed(1)}%</span>;
}

// ─── Velocity Chart Components ─────────────────────────────────────────────────

function CommitLegend({ payload }: any) {
    if (!payload) return null;
    return (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-2 text-[11px]">
            {payload.map((entry: any) => {
                const isLine = entry.type === 'line';
                return (
                    <div key={entry.value} className="flex items-center gap-1.5">
                        {isLine ? (
                            <>
                                <svg width="20" height="10" className="flex-shrink-0">
                                    <line x1="0" y1="5" x2="20" y2="5" stroke={entry.color} strokeWidth={2} />
                                    <circle cx="10" cy="5" r="3" fill={entry.color} />
                                </svg>
                                <span style={{ color: entry.color }} className="font-medium">{entry.value}</span>
                                <span className="text-muted-foreground">(right axis)</span>
                            </>
                        ) : (
                            <>
                                <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                <span style={{ color: entry.color }} className="font-medium">{entry.value}</span>
                            </>
                        )}
                    </div>
                );
            })}
            <div className="flex items-center gap-1.5">
                <svg width="20" height="10" className="flex-shrink-0">
                    <line x1="0" y1="5" x2="20" y2="5" stroke="#4ade80" strokeWidth={1.5} strokeDasharray="3 3" />
                </svg>
                <span className="text-[#4ade80] font-medium">80% Target</span>
            </div>
        </div>
    );
}

function CommitTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-xl min-w-[180px]">
            <p className="font-bold text-foreground mb-2">{d?.fullName || label}</p>
            <div className="space-y-1">
                {payload.map((p: any) => (
                    <div key={p.dataKey} className="flex justify-between gap-4">
                        <span style={{ color: p.color }}>{p.name}</span>
                        <span className="font-semibold tabular-nums">{p.value ?? '—'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function BreakdownTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    const total = (payload as any[]).reduce((s: number, p: any) => s + (p.value || 0), 0);
    return (
        <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-xl min-w-[200px]">
            <p className="font-bold text-foreground mb-2">{d?.fullName || label}</p>
            <div className="space-y-1">
                {payload.map((p: any) => (
                    <div key={p.dataKey} className="flex justify-between gap-4">
                        <span style={{ color: p.color }}>{p.name}</span>
                        <span className="font-semibold tabular-nums">{p.value ?? 0} pts</span>
                    </div>
                ))}
                <div className="border-t border-border pt-1 mt-1 flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold tabular-nums">{total} pts</span>
                </div>
            </div>
        </div>
    );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${color || 'text-foreground'}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
    const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
    const [sprintCount, setSprintCount] = useState(8);

    // Velocity data
    const velocityUrl = selectedBoardId
        ? `/api/planning/sprint-velocity?boardId=${selectedBoardId}&count=${sprintCount}`
        : null;
    const { data: velocityData, loading: velocityLoading, error: velocityError } = useFetch<SprintVelocityData>(velocityUrl, [sprintCount]);
    const sprints = velocityData?.sprints || [];

    // History data
    const historyUrl = selectedBoardId
        ? `/api/sprint-performance/history?boardId=${selectedBoardId}&maxSprints=15`
        : null;
    const { data: historyResult, loading: historyLoading } = useFetch<{ history: HistoryRow[] }>(historyUrl);
    const historyData = historyResult?.history || [];

    // ── Velocity KPIs
    const summary = useMemo(() => {
        if (!sprints.length) return null;
        const n = sprints.length;
        const avgCommitted = Math.round(sprints.reduce((s, e) => s + e.committedPoints, 0) / n);
        const avgActual = Math.round(sprints.reduce((s, e) => s + e.actualPoints, 0) / n);
        const avgAccuracy = Math.round(sprints.reduce((s, e) => s + e.commitmentAccuracy, 0) / n);
        const avgAdded = Math.round(sprints.reduce((s, e) => s + e.addedMidSprintPoints, 0) / n);
        const totalAdded = sprints.reduce((s, e) => s + e.addedMidSprintCount, 0);
        return { avgCommitted, avgActual, avgAccuracy, avgAdded, totalAdded };
    }, [sprints]);

    // ── Chart data
    const commitChart = useMemo(() => sprints.map(e => ({
        name: shortSprintLabel(e.sprint.name),
        fullName: e.sprint.name,
        committed: e.committedPoints,
        actual: e.actualPoints,
        added: e.addedMidSprintPoints,
        accuracy: e.commitmentAccuracy,
    })), [sprints]);

    const pctDomain = useMemo(() => {
        if (!sprints.length) return [0, 150] as [number, number];
        const maxAcc = Math.max(...sprints.map(e => e.commitmentAccuracy));
        const upper = Math.max(150, Math.ceil(maxAcc / 20) * 20 + 20);
        return [0, upper] as [number, number];
    }, [sprints]);

    const breakdownChart = useMemo(() => sprints.map(e => ({
        name: shortSprintLabel(e.sprint.name),
        fullName: e.sprint.name,
        'Stories (committed)': e.breakdown.stories.committed,
        'Sub-Tasks (committed)': e.breakdown.subTasks.committed,
        'Sub-Chores (committed)': e.breakdown.subChores.committed,
        'Incidents (committed)': e.breakdown.incidents.committed,
        'Added Mid-Sprint': e.addedMidSprintPoints,
    })), [sprints]);

    const deltaChart = useMemo(() => sprints.map(e => ({
        name: shortSprintLabel(e.sprint.name),
        fullName: e.sprint.name,
        'Committed Δ': e.committedDelta,
        'Actual Δ': e.actualDelta,
    })), [sprints]);

    return (
        <div className="min-h-screen bg-background p-6 space-y-8">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
                <p className="text-muted-foreground mt-2">Team performance, velocity trends, and sprint history</p>
            </div>

            {/* === Cross-Board Overview === */}
            <div className="space-y-6">
                <div className="mb-6">
                    <Suspense fallback={<SectionLoader />}>
                        <TeamScorecard />
                    </Suspense>
                </div>
                <div className="mb-6">
                    <Suspense fallback={<SectionLoader />}>
                        <SquadGrid />
                    </Suspense>
                </div>
            </div>

            {/* === Board-Specific Section === */}
            <div className="border-t border-border pt-8">
                <h2 className="text-xl font-bold text-foreground mb-1">Board Analytics</h2>
                <p className="text-sm text-muted-foreground mb-6">Select a board for velocity tracking and sprint history</p>

                {/* Controls */}
                <div className="flex flex-wrap items-end gap-4 mb-8">
                    <div className="min-w-[220px]">
                        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Board</p>
                        <BoardSelector
                            selectedBoardId={selectedBoardId}
                            onBoardChange={setSelectedBoardId}
                        />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Last N Sprints</p>
                        <div className="flex rounded-lg border border-border overflow-hidden">
                            {[4, 6, 8, 10, 12].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setSprintCount(n)}
                                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${sprintCount === n
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted'
                                    }`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Velocity Overview mini chart */}
                {selectedBoardId && (
                    <div className="mb-8">
                        <Suspense fallback={<SectionLoader />}>
                            <VelocityOverview boardId={selectedBoardId} />
                        </Suspense>
                    </div>
                )}

                {/* Empty state */}
                {!selectedBoardId && (
                    <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
                        <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
                        </svg>
                        <p className="text-sm">Select a board to load analytics data</p>
                    </div>
                )}

                {/* Velocity Loading */}
                {velocityLoading && (
                    <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                        <Spinner size="md" />
                        <span className="text-sm">Loading velocity data — fetching {sprintCount} sprints…</span>
                    </div>
                )}

                {/* Velocity Error */}
                {velocityError && <ErrorAlert message={velocityError} variant="card" />}

                {/* Velocity Content */}
                {!velocityLoading && !velocityError && velocityData && sprints.length > 0 && (
                    <div className="space-y-6">
                        {/* KPI Row */}
                        {summary && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <KpiCard label="Avg Committed" value={`${summary.avgCommitted} pts`} sub="per sprint at start" color="text-indigo-400" />
                                <KpiCard label="Avg Delivered" value={`${summary.avgActual} pts`} sub="per sprint at end" color="text-emerald-400" />
                                <KpiCard label="Avg Commitment Accuracy" value={`${summary.avgAccuracy}%`} sub="actual / committed" color={accuracyColor(summary.avgAccuracy)} />
                                <KpiCard label="Avg Mid-Sprint Additions" value={`+${summary.avgAdded} pts`} sub={`${summary.totalAdded} total issues added`} color="text-orange-400" />
                            </div>
                        )}

                        {/* Chart 1: Committed vs Actual */}
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground mb-1">Committed vs Actual</h2>
                            <p className="text-[11px] text-muted-foreground mb-4">Story points committed at sprint start vs actually delivered. Line shows commitment accuracy %.</p>
                            <ResponsiveContainer width="100%" height={300}>
                                <ComposedChart data={commitChart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                    <YAxis yAxisId="pts" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                        label={{ value: 'Story Points', angle: -90, position: 'insideLeft', offset: 10,
                                            style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }} />
                                    <YAxis yAxisId="pct" orientation="right" domain={pctDomain} tickFormatter={(v: number) => `${v}%`}
                                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                        label={{ value: 'Accuracy %', angle: 90, position: 'insideRight', offset: 10,
                                            style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }} />
                                    <Tooltip content={<CommitTooltip />} />
                                    <Legend content={<CommitLegend />} />
                                    <Bar yAxisId="pts" dataKey="committed" name="Committed" fill="#6366f1" radius={[3, 3, 0, 0]} />
                                    <Bar yAxisId="pts" dataKey="actual" name="Delivered" fill="#10b981" radius={[3, 3, 0, 0]} />
                                    <Bar yAxisId="pts" dataKey="added" name="Added Mid-Sprint" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                                    <Line yAxisId="pct" type="monotone" dataKey="accuracy" name="Accuracy %" stroke="#c084fc"
                                        strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    <ReferenceLine yAxisId="pct" y={80} stroke="#4ade80" strokeDasharray="4 4" label={{ value: '80% target', position: 'left', fill: '#4ade80', fontSize: 10 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Chart 2: Type Breakdown (stacked) */}
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground mb-1">Commitment Breakdown by Issue Type</h2>
                            <p className="text-[11px] text-muted-foreground mb-4">What types of work drive committed story points per sprint.</p>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={breakdownChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                    <Tooltip content={<BreakdownTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="Stories (committed)" stackId="a" fill="#818cf8" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="Sub-Tasks (committed)" stackId="a" fill="#34d399" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="Sub-Chores (committed)" stackId="a" fill="#a78bfa" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="Incidents (committed)" stackId="a" fill="#f87171" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="Added Mid-Sprint" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Chart 3: Sprint-to-Sprint Delta */}
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h2 className="text-sm font-semibold text-foreground mb-1">Sprint-to-Sprint Change</h2>
                            <p className="text-[11px] text-muted-foreground mb-4">How committed and actual points changed from the previous sprint.</p>
                            <ResponsiveContainer width="100%" height={220}>
                                <ComposedChart data={deltaChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                    <Tooltip content={<CommitTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                                    <Bar dataKey="Committed Δ" fill="#6366f1" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="Actual Δ" fill="#10b981" radius={[3, 3, 0, 0]} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Legend / explainer */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="bg-card border border-border rounded-lg p-3 text-[10px] text-muted-foreground">
                                <p className="font-semibold text-foreground text-xs mb-1">Committed Points</p>
                                Story points of issues in the sprint at start. Point values are rolled back to sprint-start values if changed mid-sprint.
                            </div>
                            <div className="bg-card border border-border rounded-lg p-3 text-[10px] text-muted-foreground">
                                <p className="font-semibold text-foreground text-xs mb-1">Commitment Accuracy</p>
                                Delivered ÷ Committed × 100. Green ≥ 80%, Yellow ≥ 60%, Red &lt; 60%.
                            </div>
                            <div className="bg-card border border-border rounded-lg p-3 text-[10px] text-muted-foreground">
                                <p className="font-semibold text-foreground text-xs mb-1">Added Mid-Sprint</p>
                                Issues added after sprint start. High additions reduce predictability.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* === EM Sprint Report === */}
            {selectedBoardId && (
                <EmReportSection boardId={selectedBoardId} />
            )}

            {/* === Sprint History === */}
            {selectedBoardId && (
                <div className="border-t border-border pt-8">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Sprint History</h2>
                            <p className="text-sm text-muted-foreground">Click a sprint to view detailed performance metrics</p>
                        </div>
                    </div>
                    <HistoryTable data={historyData} loading={historyLoading} boardId={selectedBoardId} />
                </div>
            )}
        </div>
    );
}

// ─── EM Sprint Report Section ──────────────────────────────────────────────────

function EmReportSection({ boardId }: { boardId: number }) {
    const [sprintId, setSprintId] = useState<number | null>(null);

    const emUrl = sprintId
        ? `/api/sprint-performance/em-report?sprintId=${sprintId}&boardId=${boardId}`
        : null;
    const { data, loading, error } = useFetch<EmReportResponse>(emUrl);

    const exportCSV = () => {
        if (!data?.rows.length) return;
        const headers = ['Area', 'PIC', 'Committed MD (Start)', 'Committed MD (Final)', 'Delivered Sprint MD', 'Delivered Ad-hoc MD', 'Delivered Total MD', 'Carry Over MD', 'Carry Over Issues', 'Productivity Score %', 'Highlights', 'Carry Over Reason', 'YTD Avg Carry Over MD'];
        const rows = data.rows.map(r => [
            r.role === 'qa' ? 'QA/QE' : 'Eng', r.note?.pic ?? '', r.committedStart, r.committedFinal,
            r.deliveredSprint, r.deliveredAdhoc, r.deliveredTotal, r.carryOverPoints,
            r.carryOverIssues.map(ci => `${ci.key} (${ci.points} MD)`).join('; '),
            r.productivityScore.toFixed(2),
            [r.autoHighlights.map(h => `${h.key} +${h.points} MD`).join('; '), r.note?.highlights ?? ''].filter(Boolean).join(' | '),
            r.note?.carryOverReason ?? '', r.ytdAvgCarryOver,
        ]);
        const escape = (v: string | number | null | undefined) => {
            const s = String(v ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `em-report-${data.sprint.name.replace(/\s+/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="border-t border-border pt-8">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-foreground">Completed Sprint Performance (EM Report)</h2>
                    <p className="text-sm text-muted-foreground">Committed vs delivered mandays, carry-over, and productivity per area — slide-ready</p>
                </div>
                <div className="flex items-end gap-3">
                    <div className="min-w-[220px]">
                        <SprintSelector onSprintChange={setSprintId} selectedSprintId={sprintId} boardId={boardId} />
                    </div>
                    <button
                        onClick={exportCSV}
                        disabled={!data?.rows.length}
                        className="px-4 py-2 bg-muted border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Export CSV
                    </button>
                </div>
            </div>

            {!sprintId && (
                <div className="text-center py-10 text-muted-foreground text-sm">Select a sprint to build the EM report</div>
            )}
            {loading && (
                <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
                    <Spinner size="md" />
                    <span className="text-sm">Building EM report — analysing sprint scope, worklogs and YTD carry-over…</span>
                </div>
            )}
            {error && <ErrorAlert message={error} variant="card" />}
            {!loading && !error && data && sprintId && (
                <div className="space-y-3">
                    {data.sprint.state !== 'closed' && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-xs">
                            Sprint is {data.sprint.state} — numbers are not final until the sprint closes.
                        </div>
                    )}
                    <EmReportTable data={data} boardId={boardId} sprintId={sprintId} />
                </div>
            )}
        </div>
    );
}

// ─── History Table ─────────────────────────────────────────────────────────────

function HistoryTable({ data, loading, boardId }: { data: HistoryRow[]; loading: boolean; boardId: number }) {
    const [sortField, setSortField] = useState<keyof HistoryRow>('startDate');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="animate-pulse bg-muted/50 rounded-lg h-12" />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="text-center py-16 text-muted-foreground">
                <p>No sprint history found</p>
            </div>
        );
    }

    const toggleSort = (field: keyof HistoryRow) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
    };

    const sorted = [...data].sort((a, b) => {
        const av = a[sortField], bv = b[sortField];
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const SortHeader = ({ field, label }: { field: keyof HistoryRow; label: string }) => (
        <th
            onClick={() => toggleSort(field)}
            className="pb-2 pr-3 text-right cursor-pointer hover:text-foreground transition-colors select-none"
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {sortField === field && <span className="text-purple-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </span>
        </th>
    );

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-muted-foreground border-b border-border text-xs uppercase tracking-wider">
                            <th className="pb-2 pr-3 pl-4 cursor-pointer" onClick={() => toggleSort('name')}>
                                Sprint {sortField === 'name' && <span className="text-purple-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </th>
                            <SortHeader field="startDate" label="Period" />
                            <SortHeader field="workingDays" label="Days" />
                            <SortHeader field="committedPoints" label="Commit" />
                            <SortHeader field="actualPoints" label="Actual" />
                            <SortHeader field="commitmentAccuracy" label="Accuracy" />
                            <SortHeader field="theoreticalMandays" label="Theo. MD" />
                            <SortHeader field="assignedAtStart" label="Assigned MD" />
                            <SortHeader field="utilization" label="Util" />
                            <SortHeader field="completionRate" label="Compl" />
                            <SortHeader field="avgCycleTime" label="Cycle" />
                            <SortHeader field="memberCount" label="Team" />
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(row => (
                            <Link
                                key={row.sprintId}
                                href={`/analytics/sprint/${row.sprintId}?boardId=${boardId}`}
                                className="contents"
                            >
                                <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer group">
                                    <td className="py-2.5 pr-3 pl-4 font-medium text-foreground max-w-[200px] truncate group-hover:text-purple-400 transition-colors">
                                        {row.name}
                                        <svg className="w-3 h-3 inline-block ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                        </svg>
                                    </td>
                                    <td className="py-2.5 pr-3 text-right text-muted-foreground whitespace-nowrap">
                                        {new Date(row.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(row.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </td>
                                    <td className="py-2.5 pr-3 text-right">{row.workingDays}</td>
                                    <td className="py-2.5 pr-3 text-right">{row.committedPoints}</td>
                                    <td className="py-2.5 pr-3 text-right font-medium">{row.actualPoints}</td>
                                    <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={row.commitmentAccuracy} /></td>
                                    <td className="py-2.5 pr-3 text-right">{row.theoreticalMandays.toFixed(1)}</td>
                                    <td className="py-2.5 pr-3 text-right">{row.assignedAtStart.toFixed(1)}</td>
                                    <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={row.utilization} /></td>
                                    <td className="py-2.5 pr-3 text-right"><KPIStatusBadge value={row.completionRate} /></td>
                                    <td className="py-2.5 pr-3 text-right text-muted-foreground">{row.avgCycleTime?.toFixed(1) ?? '—'}</td>
                                    <td className="py-2.5 text-right">{row.memberCount}</td>
                                </tr>
                            </Link>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
