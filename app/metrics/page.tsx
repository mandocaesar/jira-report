'use client';

import { useState } from 'react';
import BoardSelector from '@/components/BoardSelector';
import SprintSelector from '@/components/SprintSelector';
import { MetricsData } from '@/types';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    LineChart, Line, ResponsiveContainer
} from 'recharts';

/**
 * Format hours into a human-readable string
 */
function formatDuration(hours: number | null): string {
    if (hours === null) return '—';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    if (days < 1.5) return `${hours.toFixed(0)}h`;
    return `${days.toFixed(1)}d`;
}

/**
 * Get color for MTD/MTT/MTTD metric card
 */
function getTimeColor(hours: number | null, thresholds: [number, number]): string {
    if (hours === null) return 'text-gray-500';
    if (hours <= thresholds[0]) return 'text-green-400';
    if (hours <= thresholds[1]) return 'text-yellow-400';
    return 'text-red-400';
}

export default function MetricsPage() {
    const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
    const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
    const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
    const [boardMetricsData, setBoardMetricsData] = useState<any>(null); // Quick any for now
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleBoardChange = async (boardId: number | null) => {
        setSelectedBoardId(boardId);
        setSelectedSprintId(null);
        setMetricsData(null);
        setBoardMetricsData(null);

        if (!boardId) return;

        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/metrics/board?boardId=${boardId}&year=2026`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to load board metrics');
            setBoardMetricsData(data.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load board metrics');
        } finally {
            setLoading(false);
        }
    };

    const handleSprintChange = async (sprintId: number | null) => {
        setSelectedSprintId(sprintId);

        if (!sprintId) {
            setMetricsData(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ sprintId: sprintId.toString() });
            if (selectedBoardId) params.set('boardId', selectedBoardId.toString());

            const res = await fetch(`/api/metrics?${params}`);
            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load sprint metrics');
            }

            setMetricsData(data.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load metrics');
            setMetricsData(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full">
            {/* Page Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                    Metrics Dashboard
                </h1>
                <p className="text-gray-400 mt-2">Track issue flow, completion rates, and delivery speed</p>
            </div>

            {/* Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <BoardSelector
                    selectedBoardId={selectedBoardId}
                    onBoardChange={handleBoardChange}
                />
                {selectedBoardId && (
                    <SprintSelector
                        boardId={selectedBoardId}
                        selectedSprintId={selectedSprintId}
                        onSprintChange={handleSprintChange}
                    />
                )}
            </div>

            {/* Loading */}
            {loading && (
                <div className="text-center py-20">
                    <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Loading metrics data...</p>
                    <p className="text-xs text-gray-500 mt-1">Fetching issue changelogs for time analysis</p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                    <p className="text-red-400">{error}</p>
                </div>
            )}

            {/* Single Sprint Metrics Content */}
            {metricsData && !loading && (
                <div className="space-y-8 animate-fadeIn">
                    {/* Time Metrics Summary Cards */}
                    <TimeMetricsCards data={metricsData} />

                    {/* Issue Totals Cards */}
                    <IssueTotalsCards data={metricsData} />

                    {/* Weekly Issue Count Chart */}
                    <WeeklyIssueChart data={metricsData} />

                    {/* Weekly Completion Rate Chart */}
                    <CompletionRateChart data={metricsData} />
                </div>
            )}

            {/* Board YoY Metrics Content */}
            {boardMetricsData && !selectedSprintId && !loading && (
                <div className="space-y-8 animate-fadeIn">
                    <BoardYearlyTrendChart data={boardMetricsData} />
                </div>
            )}

            {/* Empty State */}
            {!metricsData && !boardMetricsData && !loading && !error && !selectedBoardId && (
                <div className="text-center py-20">
                    <div className="w-16 h-16 bg-gray-700/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">📈</span>
                    </div>
                    <p className="text-gray-400">Select a board to view 2026 metrics</p>
                </div>
            )}
        </main>
    );
}

/**
 * Board YoY Trend Chart
 */
function BoardYearlyTrendChart({ data }: { data: any }) {
    // Format data for Recharts
    const chartData = data.sprintMetrics.map((sm: any) => ({
        name: sm.sprint.name,
        mttd: sm.meanTimeToDeliver ? Number(sm.meanTimeToDeliver.toFixed(1)) : null,
        mttc: sm.meanTimeToDone ? Number(sm.meanTimeToDone.toFixed(1)) : null,
    }));

    return (
        <div className="p-6 bg-gray-800/30 border border-gray-700/50 rounded-xl">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-white">2026 Delivery Timeline</h3>
                <p className="text-sm text-gray-400">Mean Time to Deliver & Done across all sprints</p>
            </div>

            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                        <XAxis
                            dataKey="name"
                            stroke="#9CA3AF"
                            fontSize={12}
                            tickMargin={10}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                        />
                        <YAxis
                            stroke="#9CA3AF"
                            fontSize={12}
                            tickFormatter={(value) => `${value}h`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1F2937',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                color: '#F3F4F6',
                            }}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any, name: any) => [
                                `${value}h`,
                                name === 'mttd' ? 'Mean Time to Deliver' : 'Mean Time to Done'
                            ]}
                        />
                        <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12, marginTop: '20px' }} />
                        <Line
                            type="monotone"
                            dataKey="mttd"
                            name="mttd"
                            stroke="#3B82F6"
                            strokeWidth={3}
                            dot={{ fill: '#3B82F6', r: 4 }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                            connectNulls
                        />
                        <Line
                            type="monotone"
                            dataKey="mttc"
                            name="mttc"
                            stroke="#10B981"
                            strokeWidth={3}
                            dot={{ fill: '#10B981', r: 4 }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                            connectNulls
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/**
 * Time Metrics Cards (MTD, MTT, MTTD)
 */
function TimeMetricsCards({ data }: { data: MetricsData }) {
    const { timeMetrics } = data;

    const cards = [
        {
            label: 'Mean Time to Deliver',
            sublabel: 'Sprint Start → In Progress',
            value: timeMetrics.meanTimeToDeliver,
            sample: timeMetrics.sampleSize.deliver,
            thresholds: [24, 72] as [number, number],
            icon: '🚀',
            gradient: 'from-blue-500/10 to-cyan-500/10',
            border: 'border-blue-500/20',
        },
        {
            label: 'Mean Time to Test',
            sublabel: 'In Progress → QA/Review',
            value: timeMetrics.meanTimeToTest,
            sample: timeMetrics.sampleSize.test,
            thresholds: [48, 120] as [number, number],
            icon: '🧪',
            gradient: 'from-pink-500/10 to-purple-500/10',
            border: 'border-pink-500/20',
        },
        {
            label: 'Mean Time to Done',
            sublabel: 'Sprint Start → Done',
            value: timeMetrics.meanTimeToDone,
            sample: timeMetrics.sampleSize.done,
            thresholds: [120, 240] as [number, number],
            icon: '✅',
            gradient: 'from-green-500/10 to-emerald-500/10',
            border: 'border-green-500/20',
        },
    ];

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Delivery Speed</h2>
                    <p className="text-sm text-gray-400">Average time for issue lifecycle stages</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map((card) => (
                    <div key={card.label} className={`p-6 bg-gradient-to-br ${card.gradient} rounded-xl border ${card.border}`}>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xl">{card.icon}</span>
                            <div>
                                <div className="text-sm font-semibold text-white">{card.label}</div>
                                <div className="text-[10px] text-gray-500">{card.sublabel}</div>
                            </div>
                        </div>
                        <div className={`text-4xl font-bold mb-1 ${getTimeColor(card.value, card.thresholds)}`}>
                            {formatDuration(card.value)}
                        </div>
                        <div className="text-[10px] text-gray-500">
                            Based on {card.sample} issue{card.sample !== 1 ? 's' : ''}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Issue Totals Cards
 */
function IssueTotalsCards({ data }: { data: MetricsData }) {
    const { totals } = data;

    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-5 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 rounded-xl border border-indigo-500/20">
                <div className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent mb-1">
                    {totals.totalCount}
                </div>
                <div className="text-xs text-gray-400">Total Issues</div>
            </div>
            <div className="text-center p-5 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-xl border border-blue-500/20">
                <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-1">
                    {totals.storyCount}
                </div>
                <div className="text-xs text-gray-400">Stories</div>
            </div>
            <div className="text-center p-5 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-1">
                    {totals.taskCount}
                </div>
                <div className="text-xs text-gray-400">Tasks</div>
            </div>
            <div className="text-center p-5 bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-xl border border-pink-500/20">
                <div className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent mb-1">
                    {totals.testCount}
                </div>
                <div className="text-xs text-gray-400">Tests</div>
            </div>
            <div className="text-center p-5 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
                <div className={`text-3xl font-bold mb-1 ${totals.completionRate >= 80 ? 'text-green-400' : totals.completionRate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {totals.completionRate.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-400">Completion Rate</div>
            </div>
        </div>
    );
}

/**
 * Weekly Issue Count Bar Chart
 */
function WeeklyIssueChart({ data }: { data: MetricsData }) {
    const chartData = data.weeklyMetrics.map(w => ({
        name: w.weekLabel,
        Story: w.storyCount,
        Task: w.taskCount,
        Test: w.testCount,
    }));

    return (
        <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/30">
            <h3 className="text-sm font-semibold text-gray-400 mb-1">Issue Count by Type</h3>
            <p className="text-xs text-gray-500 mb-4">Story, Task, and Test issues per week</p>
            <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis
                        dataKey="name"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        axisLine={{ stroke: '#4B5563' }}
                    />
                    <YAxis
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        axisLine={{ stroke: '#4B5563' }}
                        allowDecimals={false}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1F2937',
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            color: '#F3F4F6',
                        }}
                    />
                    <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
                    <Bar dataKey="Story" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Task" fill="#A78BFA" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Test" fill="#F472B6" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

/**
 * Weekly Completion Rate Line Chart
 */
function CompletionRateChart({ data }: { data: MetricsData }) {
    const chartData = data.weeklyMetrics.map(w => ({
        name: w.weekLabel,
        'Completion %': parseFloat(w.completionRate.toFixed(1)),
        'Total Issues': w.totalCount,
        'Done Issues': w.doneCount,
    }));

    return (
        <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/30">
            <h3 className="text-sm font-semibold text-gray-400 mb-1">Completion Rate</h3>
            <p className="text-xs text-gray-500 mb-4">Percentage of issues completed per week</p>
            <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis
                        dataKey="name"
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        axisLine={{ stroke: '#4B5563' }}
                    />
                    <YAxis
                        domain={[0, 100]}
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        axisLine={{ stroke: '#4B5563' }}
                        tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1F2937',
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            color: '#F3F4F6',
                        }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any, name: any) =>
                            name === 'Completion %' ? [`${value}%`, name] : [value, name]
                        }
                    />
                    <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
                    <Line
                        type="monotone"
                        dataKey="Completion %"
                        stroke="#34D399"
                        strokeWidth={3}
                        dot={{ fill: '#34D399', r: 5, strokeWidth: 2 }}
                        activeDot={{ r: 7 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
