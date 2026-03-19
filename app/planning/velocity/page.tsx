'use client';

import { useState, useEffect, useMemo } from 'react';
import BoardSelector from '@/components/BoardSelector';
import { SprintVelocityData, SprintVelocityEntry } from '@/types';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, BarChart, ReferenceLine,
} from 'recharts';

// ─── Utils ────────────────────────────────────────────────────────────────────

function shortSprintLabel(name: string): string {
    // "SINARMAS Sprint 42" → "S42", "Sprint 12" → "S12", etc.
    const m = name.match(/(\d+)$/);
    return m ? `S${m[1]}` : name.slice(-6);
}

function fmtDelta(v: number | null): string {
    if (v === null) return '—';
    return v === 0 ? '0' : v > 0 ? `+${v}` : String(v);
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

// ─── Custom Legend ────────────────────────────────────────────────────────────

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

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${color || 'text-foreground'}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
    );
}

// ─── Expandable Category Row ──────────────────────────────────────────────────

function CategoryBadge({ label, pts, count, color }: { label: string; pts: number; count: number; color: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px]" style={{ borderColor: `${color}40`, backgroundColor: `${color}10`, color }}>
            <span className="font-semibold">{label}</span>
            <span className="opacity-70">{pts} pts · {count} issues</span>
        </span>
    );
}

// ─── Sprint Row ───────────────────────────────────────────────────────────────

function SprintRow({ entry, expanded, onToggle }: {
    entry: SprintVelocityEntry;
    expanded: boolean;
    onToggle: () => void;
}) {
    const { sprint, committedPoints, actualPoints, addedMidSprintPoints, addedMidSprintCount,
        commitmentAccuracy, committedDelta, actualDelta, breakdown } = entry;

    return (
        <>
            <tr
                className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer select-none"
                onClick={onToggle}
            >
                {/* Expand toggle */}
                <td className="px-3 py-3 text-center">
                    <svg className={`w-3.5 h-3.5 text-muted-foreground transition-transform mx-auto ${expanded ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </td>
                {/* Sprint name */}
                <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-foreground">{sprint.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(sprint.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        {' – '}
                        {sprint.endDate ? new Date(sprint.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '?'}
                    </div>
                </td>
                {/* Committed */}
                <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold tabular-nums text-foreground">{committedPoints}</span>
                    <div className="text-[10px] text-muted-foreground">pts committed</div>
                </td>
                {/* Actual */}
                <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold tabular-nums text-emerald-400">{actualPoints}</span>
                    <div className="text-[10px] text-muted-foreground">pts delivered</div>
                </td>
                {/* Accuracy */}
                <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold tabular-nums ${accuracyColor(commitmentAccuracy)}`}>
                        {commitmentAccuracy}%
                    </span>
                </td>
                {/* Added mid-sprint */}
                <td className="px-4 py-3 text-right">
                    {addedMidSprintCount > 0 ? (
                        <>
                            <span className="text-sm font-bold tabular-nums text-orange-400">+{addedMidSprintPoints}</span>
                            <div className="text-[10px] text-muted-foreground">{addedMidSprintCount} issues</div>
                        </>
                    ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                </td>
                {/* Committed delta */}
                <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-bold tabular-nums ${deltaColor(committedDelta)}`}>
                        {fmtDelta(committedDelta)}
                    </span>
                </td>
                {/* Actual delta */}
                <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-bold tabular-nums ${deltaColor(actualDelta)}`}>
                        {fmtDelta(actualDelta)}
                    </span>
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-border bg-muted/10">
                    <td colSpan={8} className="px-6 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Committed breakdown */}
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Committed at Start</p>
                                <div className="flex flex-wrap gap-2">
                                    {breakdown.stories.committed > 0 && (
                                        <CategoryBadge label="Stories/Tasks" pts={breakdown.stories.committed} count={breakdown.stories.count - breakdown.stories.addedMidSprintCount} color="#818cf8" />
                                    )}
                                    {breakdown.subTasks.committed > 0 && (
                                        <CategoryBadge label="Sub-Tasks" pts={breakdown.subTasks.committed} count={breakdown.subTasks.count - breakdown.subTasks.addedMidSprintCount} color="#34d399" />
                                    )}
                                    {breakdown.subChores.committed > 0 && (
                                        <CategoryBadge label="Sub-Chores" pts={breakdown.subChores.committed} count={breakdown.subChores.count - breakdown.subChores.addedMidSprintCount} color="#a78bfa" />
                                    )}
                                    {breakdown.incidents.committed > 0 && (
                                        <CategoryBadge label="Incidents/Bugs" pts={breakdown.incidents.committed} count={breakdown.incidents.count - breakdown.incidents.addedMidSprintCount} color="#f87171" />
                                    )}
                                    {committedPoints === 0 && <span className="text-[10px] text-muted-foreground">No committed points at start</span>}
                                </div>
                            </div>
                            {/* Mid-sprint additions */}
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Added Mid-Sprint</p>
                                {addedMidSprintCount > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {breakdown.stories.addedMidSprintCount > 0 && (
                                            <CategoryBadge label="Stories/Tasks" pts={breakdown.stories.addedMidSprint} count={breakdown.stories.addedMidSprintCount} color="#f59e0b" />
                                        )}
                                        {breakdown.subTasks.addedMidSprintCount > 0 && (
                                            <CategoryBadge label="Sub-Tasks" pts={breakdown.subTasks.addedMidSprint} count={breakdown.subTasks.addedMidSprintCount} color="#f59e0b" />
                                        )}
                                        {breakdown.subChores.addedMidSprintCount > 0 && (
                                            <CategoryBadge label="Sub-Chores" pts={breakdown.subChores.addedMidSprint} count={breakdown.subChores.addedMidSprintCount} color="#f59e0b" />
                                        )}
                                        {breakdown.incidents.addedMidSprintCount > 0 && (
                                            <CategoryBadge label="Incidents/Bugs" pts={breakdown.incidents.addedMidSprint} count={breakdown.incidents.addedMidSprintCount} color="#fb923c" />
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground/50">None</span>
                                )}
                            </div>
                            {/* Delivery breakdown */}
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Delivered</p>
                                <div className="flex flex-wrap gap-2">
                                    {breakdown.stories.actual > 0 && (
                                        <CategoryBadge label="Stories/Tasks" pts={breakdown.stories.actual} count={0} color="#34d399" />
                                    )}
                                    {breakdown.subTasks.actual > 0 && (
                                        <CategoryBadge label="Sub-Tasks" pts={breakdown.subTasks.actual} count={0} color="#34d399" />
                                    )}
                                    {breakdown.subChores.actual > 0 && (
                                        <CategoryBadge label="Sub-Chores" pts={breakdown.subChores.actual} count={0} color="#34d399" />
                                    )}
                                    {breakdown.incidents.actual > 0 && (
                                        <CategoryBadge label="Incidents/Bugs" pts={breakdown.incidents.actual} count={0} color="#34d399" />
                                    )}
                                    {actualPoints === 0 && <span className="text-[10px] text-muted-foreground">Nothing completed</span>}
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VelocityPage() {
    const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
    const [sprintCount, setSprintCount] = useState(8);
    const [velocityData, setVelocityData] = useState<SprintVelocityData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedSprints, setExpandedSprints] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (!selectedBoardId) return;
        setLoading(true);
        setError(null);
        setVelocityData(null);
        fetch(`/api/planning/sprint-velocity?boardId=${selectedBoardId}&count=${sprintCount}`)
            .then(r => r.json())
            .then(json => {
                if (json.success) {
                    setVelocityData(json.data);
                } else {
                    setError(json.error || 'Unknown error');
                }
            })
            .catch(() => setError('Failed to fetch velocity data'))
            .finally(() => setLoading(false));
    }, [selectedBoardId, sprintCount]);

    const sprints = velocityData?.sprints || [];

    // ── Summary KPIs
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

    // ── Chart data: committed vs actual + accuracy line
    const commitChart = useMemo(() => sprints.map(e => ({
        name: shortSprintLabel(e.sprint.name),
        fullName: e.sprint.name,
        committed: e.committedPoints,
        actual: e.actualPoints,
        added: e.addedMidSprintPoints,
        accuracy: e.commitmentAccuracy,
    })), [sprints]);

    // Dynamic right-axis domain so the accuracy line is never clipped
    const pctDomain = useMemo(() => {
        if (!sprints.length) return [0, 150] as [number, number];
        const maxAcc = Math.max(...sprints.map(e => e.commitmentAccuracy));
        // Round up to nearest 20 and add headroom
        const upper = Math.max(150, Math.ceil(maxAcc / 20) * 20 + 20);
        return [0, upper] as [number, number];
    }, [sprints]);

    // ── Chart data: committed breakdown by issue type (stacked) + mid-sprint additions
    const breakdownChart = useMemo(() => sprints.map(e => ({
        name: shortSprintLabel(e.sprint.name),
        fullName: e.sprint.name,
        'Stories (committed)': e.breakdown.stories.committed,
        'Sub-Tasks (committed)': e.breakdown.subTasks.committed,
        'Sub-Chores (committed)': e.breakdown.subChores.committed,
        'Incidents (committed)': e.breakdown.incidents.committed,
        'Added Mid-Sprint': e.addedMidSprintPoints,
    })), [sprints]);

    // ── Chart data: sprint-to-sprint delta in committed
    const deltaChart = useMemo(() => sprints.map(e => ({
        name: shortSprintLabel(e.sprint.name),
        fullName: e.sprint.name,
        'Committed Δ': e.committedDelta,
        'Actual Δ': e.actualDelta,
    })), [sprints]);

    const toggleSprint = (id: number) => {
        setExpandedSprints(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    return (
        <div className="min-h-screen bg-background p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h1 className="text-xl font-bold text-foreground">Sprint Velocity Tracker</h1>
                <p className="text-sm text-muted-foreground">
                    Compare committed vs actual story points sprint-to-sprint. Identify what drives commitment changes: sub-tasks, sub-chores, or mid-sprint additions.
                </p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-end gap-4">
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

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm">Loading sprint data — fetching {sprintCount} sprints…</span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                    {error}
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && !selectedBoardId && (
                <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
                    <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
                    </svg>
                    <p className="text-sm">Select a board to load velocity data</p>
                </div>
            )}

            {!loading && !error && velocityData && sprints.length > 0 && (
                <>
                    {/* KPI Row */}
                    {summary && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <KpiCard
                                label="Avg Committed"
                                value={`${summary.avgCommitted} pts`}
                                sub="per sprint at start"
                                color="text-indigo-400"
                            />
                            <KpiCard
                                label="Avg Delivered"
                                value={`${summary.avgActual} pts`}
                                sub="per sprint at end"
                                color="text-emerald-400"
                            />
                            <KpiCard
                                label="Avg Commitment Accuracy"
                                value={`${summary.avgAccuracy}%`}
                                sub="actual / committed"
                                color={accuracyColor(summary.avgAccuracy)}
                            />
                            <KpiCard
                                label="Avg Mid-Sprint Additions"
                                value={`+${summary.avgAdded} pts`}
                                sub={`${summary.totalAdded} total issues added`}
                                color="text-orange-400"
                            />
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
                        <p className="text-[11px] text-muted-foreground mb-4">
                            What types of work drive committed story points per sprint. Shows the composition of committed scope and mid-sprint additions.
                        </p>
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

                    {/* Chart 3: Sprint-to-sprint committed delta */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <h2 className="text-sm font-semibold text-foreground mb-1">Sprint-to-Sprint Change</h2>
                        <p className="text-[11px] text-muted-foreground mb-4">
                            How much committed and actual points changed from the previous sprint. Positive = more scope, Negative = less scope.
                        </p>
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

                    {/* Detail Table */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">Sprint Detail</h2>
                                <p className="text-[11px] text-muted-foreground mt-0.5">Click a row to expand the issue-type breakdown</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (expandedSprints.size === sprints.length) {
                                        setExpandedSprints(new Set());
                                    } else {
                                        setExpandedSprints(new Set(sprints.map(s => s.sprint.id)));
                                    }
                                }}
                                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
                            >
                                {expandedSprints.size === sprints.length ? 'Collapse all' : 'Expand all'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/20">
                                        <th className="px-3 py-2 w-8"></th>
                                        <th className="px-4 py-2">Sprint</th>
                                        <th className="px-4 py-2 text-right">Committed</th>
                                        <th className="px-4 py-2 text-right">Delivered</th>
                                        <th className="px-4 py-2 text-center">Accuracy</th>
                                        <th className="px-4 py-2 text-right">+Mid-Sprint</th>
                                        <th className="px-4 py-2 text-center">Committed Δ</th>
                                        <th className="px-4 py-2 text-center">Actual Δ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sprints.map(entry => (
                                        <SprintRow
                                            key={entry.sprint.id}
                                            entry={entry}
                                            expanded={expandedSprints.has(entry.sprint.id)}
                                            onToggle={() => toggleSprint(entry.sprint.id)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Legend / explainer */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-card border border-border rounded-lg p-3 text-[10px] text-muted-foreground">
                            <p className="font-semibold text-foreground text-xs mb-1">Committed Points</p>
                            Story points of issues that were in the sprint at start (day 1). Point values are rolled back to what they were at sprint start if they changed mid-sprint.
                        </div>
                        <div className="bg-card border border-border rounded-lg p-3 text-[10px] text-muted-foreground">
                            <p className="font-semibold text-foreground text-xs mb-1">Commitment Accuracy</p>
                            Delivered ÷ Committed × 100. Green ≥ 80%, Yellow ≥ 60%, Red &lt; 60%. A consistently low accuracy suggests sprint planning needs recalibration.
                        </div>
                        <div className="bg-card border border-border rounded-lg p-3 text-[10px] text-muted-foreground">
                            <p className="font-semibold text-foreground text-xs mb-1">Added Mid-Sprint</p>
                            Issues added to the sprint after it started (adhoc work). High mid-sprint additions reduce predictability and can indicate poor backlog grooming.
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
