'use client';

import { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { SquadHealthData, SprintVelocityEntry, SquadMemberPerformance } from '@/types';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, BarChart, Cell,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortSprintLabel(name: string): string {
    const m = name.match(/(\d+)$/);
    return m ? `S${m[1]}` : name.slice(-6);
}

function utilColor(pct: number): string {
    if (pct >= 100) return 'text-green-500';
    if (pct >= 80) return 'text-blue-500';
    if (pct >= 60) return 'text-yellow-500';
    return 'text-red-500';
}

function statusBadge(status: 'under' | 'optimal' | 'over') {
    const config = {
        under: { label: 'Under', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
        optimal: { label: 'Optimal', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
        over: { label: 'Over', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
    }[status];
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.bg} ${config.text} ${config.border}`}>
            {config.label}
        </span>
    );
}

function sparkline(data: number[], color: string) {
    if (data.length < 2) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 60;
    const h = 20;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
    return (
        <svg width={w} height={h} className="inline-block">
            <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
        </svg>
    );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function VelocityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; color: string; value: number }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
            <p className="text-gray-300 font-medium mb-2">{label}</p>
            {payload.map((entry) => (
                <div key={entry.name} className="flex justify-between gap-4">
                    <span style={{ color: entry.color }}>{entry.name}</span>
                    <span className="text-white font-medium">{entry.value}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Views ────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'members' | 'workload';

export default function SquadDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [data, setData] = useState<SquadHealthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('overview');

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                const res = await fetch(`/api/squads/${encodeURIComponent(id)}?sprintCount=5`);
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Failed to fetch squad data');
                setData(json.data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load squad');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400 text-sm">Loading squad data...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="bg-gray-900 rounded-2xl p-8 border border-red-500/30 max-w-md text-center">
                    <p className="text-red-400 text-lg font-semibold mb-2">Error</p>
                    <p className="text-gray-400">{error || 'No data available'}</p>
                    <Link href="/squads" className="mt-4 inline-block text-purple-400 hover:text-purple-300 text-sm">
                        ← Back to Squads
                    </Link>
                </div>
            </div>
        );
    }

    const { squad, velocity, memberPerformance, workloadDistribution } = data;

    const tabs: { id: TabId; label: string }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'members', label: 'Members' },
        { id: 'workload', label: 'Workload' },
    ];

    return (
        <div className="min-h-screen bg-gray-950 p-6 md:p-8">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                    <Link href="/squads" className="hover:text-purple-400 transition-colors">Squads</Link>
                    <span>/</span>
                    <span className="text-gray-300">{squad.name}</span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-white">{squad.name}</h1>
                        <p className="text-gray-400 text-sm mt-0.5">
                            {squad.memberCount} members ({squad.engineerCount} eng, {squad.qaCount} qa)
                            {squad.departmentName && <span className="text-gray-600"> · {squad.departmentName}</span>}
                        </p>
                    </div>
                    {squad.currentSprint && (
                        <div className="bg-gray-900 rounded-xl px-4 py-2 border border-gray-800 text-sm">
                            <span className="text-gray-400">Active: </span>
                            <span className="text-white font-medium">{squad.currentSprint.name}</span>
                            <span className="text-gray-500 ml-2">({squad.currentSprint.progress}% through)</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <SummaryCards squad={squad} velocity={velocity} />

            {/* Tabs */}
            <div className="flex gap-1 mt-8 mb-6 bg-gray-900 rounded-xl p-1 w-fit border border-gray-800">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'text-gray-400 hover:text-gray-300 border border-transparent'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && <OverviewTab velocity={velocity} />}
            {activeTab === 'members' && <MembersTab members={memberPerformance} />}
            {activeTab === 'workload' && <WorkloadTab workload={workloadDistribution} />}
        </div>
    );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ squad, velocity }: { squad: SquadHealthData['squad']; velocity: SprintVelocityEntry[] }) {
    const latestVelocity = velocity.length > 0 ? velocity[velocity.length - 1] : null;
    const avgVelocity = velocity.length > 0
        ? Math.round((velocity.reduce((s, v) => s + v.actualPoints, 0) / velocity.length) * 10) / 10
        : 0;
    const avgAccuracy = velocity.length > 0
        ? Math.round(velocity.reduce((s, v) => s + v.commitmentAccuracy, 0) / velocity.length)
        : 0;

    const cards = [
        {
            label: 'Current Sprint',
            value: squad.currentSprint ? `${squad.currentSprint.completionPercent}%` : '—',
            sub: squad.currentSprint ? `${squad.currentSprint.completedPoints}/${squad.currentSprint.committedPoints} pts` : 'No active sprint',
            color: 'text-purple-400',
        },
        {
            label: 'Avg Velocity',
            value: `${avgVelocity}`,
            sub: `${velocity.length} sprint avg`,
            color: 'text-blue-400',
        },
        {
            label: 'Latest Accuracy',
            value: latestVelocity ? `${latestVelocity.commitmentAccuracy}%` : '—',
            sub: `Avg: ${avgAccuracy}%`,
            color: latestVelocity && latestVelocity.commitmentAccuracy >= 80 ? 'text-green-400' : 'text-yellow-400',
        },
        {
            label: 'Team Size',
            value: `${squad.memberCount}`,
            sub: `${squad.engineerCount} eng · ${squad.qaCount} qa`,
            color: 'text-gray-300',
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
                <div key={card.label} className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{card.sub}</p>
                </div>
            ))}
        </div>
    );
}

// ─── Overview Tab: Velocity Chart ─────────────────────────────────────────────

function OverviewTab({ velocity }: { velocity: SprintVelocityEntry[] }) {
    const chartData = useMemo(() =>
        velocity.map((v) => ({
            name: shortSprintLabel(v.sprint.name),
            committed: v.committedPoints,
            actual: v.actualPoints,
            added: v.addedMidSprintPoints,
            accuracy: v.commitmentAccuracy,
        })),
        [velocity]
    );

    if (velocity.length === 0) {
        return (
            <div className="bg-gray-900 rounded-2xl p-12 border border-gray-800 text-center">
                <p className="text-gray-400">No velocity data available</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Velocity Chart */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-4">Sprint Velocity</h3>
                <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                            <Tooltip content={<VelocityTooltip />} />
                            <Legend
                                wrapperStyle={{ fontSize: '11px' }}
                                formatter={(value: string) => <span className="text-gray-400">{value}</span>}
                            />
                            <Bar dataKey="committed" name="Committed" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="actual" name="Actual" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="added" name="Added Mid-Sprint" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                            <Line
                                dataKey="accuracy"
                                name="Accuracy %"
                                stroke="#EC4899"
                                strokeWidth={2}
                                dot={{ fill: '#EC4899', r: 3 }}
                                yAxisId={0}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Sprint Details Table */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 overflow-x-auto">
                <h3 className="text-lg font-semibold text-white mb-4">Sprint Details</h3>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                            <th className="text-left py-3 px-2">Sprint</th>
                            <th className="text-right py-3 px-2">Committed</th>
                            <th className="text-right py-3 px-2">Actual</th>
                            <th className="text-right py-3 px-2">Added</th>
                            <th className="text-right py-3 px-2">Accuracy</th>
                        </tr>
                    </thead>
                    <tbody>
                        {velocity.map((v) => (
                            <tr key={v.sprint.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td className="py-3 px-2 text-gray-300">{shortSprintLabel(v.sprint.name)}</td>
                                <td className="py-3 px-2 text-right text-gray-300">{v.committedPoints}</td>
                                <td className="py-3 px-2 text-right text-cyan-400 font-medium">{v.actualPoints}</td>
                                <td className="py-3 px-2 text-right text-yellow-400">{v.addedMidSprintPoints}</td>
                                <td className={`py-3 px-2 text-right font-medium ${
                                    v.commitmentAccuracy >= 80 ? 'text-green-400' : v.commitmentAccuracy >= 60 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                    {v.commitmentAccuracy}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({ members }: { members: SquadMemberPerformance[] }) {
    const [sortBy, setSortBy] = useState<'name' | 'utilization' | 'storyPoints' | 'cycleTime'>('name');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const sorted = useMemo(() => {
        const arr = [...members];
        switch (sortBy) {
            case 'utilization': return arr.sort((a, b) => b.averages.utilization - a.averages.utilization);
            case 'storyPoints': return arr.sort((a, b) => b.averages.storyPoints - a.averages.storyPoints);
            case 'cycleTime': return arr.sort((a, b) => (a.averages.cycleTime ?? 999) - (b.averages.cycleTime ?? 999));
            default: return arr.sort((a, b) => a.name.localeCompare(b.name));
        }
    }, [members, sortBy]);

    if (members.length === 0) {
        return (
            <div className="bg-gray-900 rounded-2xl p-12 border border-gray-800 text-center">
                <p className="text-gray-400">No member performance data available</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            {/* Sort Controls */}
            <div className="px-6 py-3 border-b border-gray-800 flex items-center gap-2 text-xs">
                <span className="text-gray-500">Sort by:</span>
                {(['name', 'utilization', 'storyPoints', 'cycleTime'] as const).map((key) => (
                    <button
                        key={key}
                        onClick={() => setSortBy(key)}
                        className={`px-2 py-1 rounded-md transition-colors ${
                            sortBy === key ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-gray-300'
                        }`}
                    >
                        {key === 'storyPoints' ? 'Story Points' : key === 'cycleTime' ? 'Cycle Time' : key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                ))}
            </div>

            {/* Members Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                            <th className="text-left py-3 px-4">Member</th>
                            <th className="text-right py-3 px-3">Avg SP/Sprint</th>
                            <th className="text-right py-3 px-3">Avg Utilization</th>
                            <th className="text-right py-3 px-3">Avg Cycle Time</th>
                            <th className="text-right py-3 px-3">Avg Lead Time</th>
                            <th className="text-right py-3 px-3">Avg Throughput</th>
                            <th className="text-center py-3 px-3">Trend</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((m) => {
                            const isExpanded = expandedId === m.accountId;
                            const spTrend = m.sprintMetrics.map(s => s.storyPoints);
                            return (
                                <MemberRow
                                    key={m.accountId}
                                    member={m}
                                    isExpanded={isExpanded}
                                    onToggle={() => setExpandedId(isExpanded ? null : m.accountId)}
                                    spTrend={spTrend}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MemberRow({ member, isExpanded, onToggle, spTrend }: {
    member: SquadMemberPerformance;
    isExpanded: boolean;
    onToggle: () => void;
    spTrend: number[];
}) {
    const m = member;
    return (
        <>
            <tr
                onClick={onToggle}
                className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors"
            >
                <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                        {m.avatarUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                        )}
                        <div>
                            <p className="text-gray-200 font-medium">{m.name}</p>
                            <p className="text-gray-500 text-[10px]">{m.title || m.role}</p>
                        </div>
                    </div>
                </td>
                <td className="py-3 px-3 text-right text-gray-300 font-medium">{m.averages.storyPoints}</td>
                <td className={`py-3 px-3 text-right font-medium ${utilColor(m.averages.utilization)}`}>
                    {m.averages.utilization}%
                </td>
                <td className="py-3 px-3 text-right text-gray-300">
                    {m.averages.cycleTime !== null ? `${m.averages.cycleTime}d` : '—'}
                </td>
                <td className="py-3 px-3 text-right text-gray-300">
                    {m.averages.leadTime !== null ? `${m.averages.leadTime}d` : '—'}
                </td>
                <td className="py-3 px-3 text-right text-gray-300">{m.averages.throughput}</td>
                <td className="py-3 px-3 text-center">
                    {sparkline(spTrend, '#8B5CF6')}
                </td>
            </tr>
            {isExpanded && (
                <tr>
                    <td colSpan={7} className="bg-gray-800/20 px-4 py-3">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-700">
                                        <th className="text-left py-2 px-2">Sprint</th>
                                        <th className="text-right py-2 px-2">SP</th>
                                        <th className="text-right py-2 px-2">Eff. Mandays</th>
                                        <th className="text-right py-2 px-2">Utilization</th>
                                        <th className="text-right py-2 px-2">Issues Done</th>
                                        <th className="text-right py-2 px-2">Cycle Time</th>
                                        <th className="text-right py-2 px-2">Lead Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {m.sprintMetrics.map((s) => (
                                        <tr key={s.sprintId} className="border-b border-gray-700/50">
                                            <td className="py-2 px-2 text-gray-400">{shortSprintLabel(s.sprintName)}</td>
                                            <td className="py-2 px-2 text-right text-gray-300">{s.storyPoints}</td>
                                            <td className="py-2 px-2 text-right text-gray-300">{s.effectiveMandays}</td>
                                            <td className={`py-2 px-2 text-right ${utilColor(s.utilizationPercent)}`}>
                                                {s.utilizationPercent}%
                                            </td>
                                            <td className="py-2 px-2 text-right text-gray-300">{s.completedIssues}</td>
                                            <td className="py-2 px-2 text-right text-gray-300">
                                                {s.cycleTimeAvg !== null ? `${s.cycleTimeAvg}d` : '—'}
                                            </td>
                                            <td className="py-2 px-2 text-right text-gray-300">
                                                {s.leadTimeAvg !== null ? `${s.leadTimeAvg}d` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ─── Workload Tab ─────────────────────────────────────────────────────────────

function WorkloadTab({ workload }: { workload: SquadHealthData['workloadDistribution'] }) {
    if (workload.length === 0) {
        return (
            <div className="bg-gray-900 rounded-2xl p-12 border border-gray-800 text-center">
                <p className="text-gray-400">No workload data available</p>
            </div>
        );
    }

    const barColors = { under: '#EAB308', optimal: '#22C55E', over: '#EF4444' };

    const chartData = workload
        .sort((a, b) => b.currentUtilization - a.currentUtilization)
        .map(w => ({
            name: w.name.split(' ')[0],
            fullName: w.name,
            points: w.currentPoints,
            utilization: Math.round(w.currentUtilization),
            status: w.status,
            role: w.role,
        }));

    return (
        <div className="space-y-6">
            {/* Status Summary */}
            <div className="grid grid-cols-3 gap-4">
                {(['under', 'optimal', 'over'] as const).map((status) => {
                    const count = workload.filter(w => w.status === status).length;
                    const config = {
                        under: { label: 'Under-utilized', desc: '< 60%', bg: 'border-yellow-500/20', icon: '⚡' },
                        optimal: { label: 'Optimal', desc: '60-120%', bg: 'border-green-500/20', icon: '✓' },
                        over: { label: 'Over-utilized', desc: '> 120%', bg: 'border-red-500/20', icon: '⚠' },
                    }[status];
                    return (
                        <div key={status} className={`bg-gray-900 rounded-2xl p-5 border ${config.bg}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{config.icon}</span>
                                <p className="text-xs text-gray-400">{config.label}</p>
                            </div>
                            <p className="text-2xl font-bold text-white">{count}</p>
                            <p className="text-[10px] text-gray-500 mt-1">{config.desc}</p>
                        </div>
                    );
                })}
            </div>

            {/* Workload Bar Chart */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-4">Utilization Distribution</h3>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                            <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                            <YAxis
                                dataKey="name"
                                type="category"
                                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                                width={70}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0].payload;
                                    return (
                                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
                                            <p className="text-white font-medium">{d.fullName}</p>
                                            <p className="text-gray-400 mt-1">{d.role}</p>
                                            <p className="text-cyan-400 mt-1">{d.utilization}% utilization</p>
                                            <p className="text-gray-300">{d.points} story points</p>
                                        </div>
                                    );
                                }}
                            />
                            <Bar dataKey="utilization" radius={[0, 4, 4, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={index} fill={barColors[entry.status as keyof typeof barColors]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Detailed List */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 overflow-x-auto">
                <h3 className="text-lg font-semibold text-white mb-4">Member Workload</h3>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                            <th className="text-left py-3 px-3">Member</th>
                            <th className="text-left py-3 px-3">Role</th>
                            <th className="text-right py-3 px-3">Story Points</th>
                            <th className="text-right py-3 px-3">Utilization</th>
                            <th className="text-center py-3 px-3">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {workload
                            .sort((a, b) => b.currentUtilization - a.currentUtilization)
                            .map((w) => (
                                <tr key={w.accountId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                    <td className="py-3 px-3 text-gray-300">{w.name}</td>
                                    <td className="py-3 px-3 text-gray-500 capitalize">{w.role}</td>
                                    <td className="py-3 px-3 text-right text-gray-300">{w.currentPoints}</td>
                                    <td className={`py-3 px-3 text-right font-medium ${utilColor(w.currentUtilization)}`}>
                                        {Math.round(w.currentUtilization)}%
                                    </td>
                                    <td className="py-3 px-3 text-center">{statusBadge(w.status)}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
