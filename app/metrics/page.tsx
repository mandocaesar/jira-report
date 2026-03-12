'use client';

import { useState, useMemo } from 'react';
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
    if (hours === null) return 'text-muted-foreground';
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

    // AI Summary State
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const aggregateMetrics = useMemo(() => {
        if (!boardMetricsData || !boardMetricsData.sprintMetrics) return null;

        const allSprints = boardMetricsData.sprintMetrics;
        if (allSprints.length === 0) return null;

        let totalStory = 0, totalTask = 0, totalTest = 0, totalDone = 0;
        let deliverSum = 0, testSum = 0, doneSum = 0;
        let deliverCount = 0, testCount = 0, doneCount = 0;

        const memberAggMap = new Map<string, any>();

        allSprints.forEach((sm: any) => {
            totalStory += sm.totals?.storyCount || 0;
            totalTask += sm.totals?.taskCount || 0;
            totalTest += sm.totals?.testCount || 0;
            totalDone += sm.totals?.doneCount || 0;

            if (sm.timeMetrics?.meanTimeToDeliver != null) {
                deliverSum += sm.timeMetrics.meanTimeToDeliver * (sm.timeMetrics.sampleSize?.deliver || 1);
                deliverCount += (sm.timeMetrics.sampleSize?.deliver || 1);
            }
            if (sm.timeMetrics?.meanTimeToTest != null) {
                testSum += sm.timeMetrics.meanTimeToTest * (sm.timeMetrics.sampleSize?.test || 1);
                testCount += (sm.timeMetrics.sampleSize?.test || 1);
            }
            if (sm.timeMetrics?.meanTimeToDone != null) {
                doneSum += sm.timeMetrics.meanTimeToDone * (sm.timeMetrics.sampleSize?.done || 1);
                doneCount += (sm.timeMetrics.sampleSize?.done || 1);
            }

            if (sm.memberTimeMetrics) {
                sm.memberTimeMetrics.forEach((m: any) => {
                    if (!memberAggMap.has(m.accountId)) {
                        memberAggMap.set(m.accountId, {
                            ...m,
                            deliverSum: 0,
                            deliverCount: 0,
                            doneSum: 0,
                            doneCount: 0
                        });
                    }
                    const agg = memberAggMap.get(m.accountId);
                    if (m.meanTimeToDeliver != null) {
                        agg.deliverSum += m.meanTimeToDeliver * (m.sampleSize?.deliver || 1);
                        agg.deliverCount += (m.sampleSize?.deliver || 1);
                    }
                    if (m.meanTimeToDone != null) {
                        agg.doneSum += m.meanTimeToDone * (m.sampleSize?.done || 1);
                        agg.doneCount += (m.sampleSize?.done || 1);
                    }
                });
            }
        });

        const totalCount = totalStory + totalTask + totalTest;

        const memberTimeMetrics = Array.from(memberAggMap.values())
            .map(m => ({
                accountId: m.accountId,
                displayName: m.displayName,
                avatarUrl: m.avatarUrl,
                meanTimeToDeliver: m.deliverCount > 0 ? m.deliverSum / m.deliverCount : null,
                meanTimeToDone: m.doneCount > 0 ? m.doneSum / m.doneCount : null,
                sampleSize: {
                    deliver: m.deliverCount,
                    done: m.doneCount
                }
            }))
            .filter(m => m.sampleSize.deliver > 0 || m.sampleSize.done > 0)
            .sort((a, b) => b.sampleSize.done - a.sampleSize.done);

        return {
            sprint: allSprints[0].sprint, // Dummy
            weeklyMetrics: [], // Not applicable for YTD cards directly easily
            timeMetrics: {
                meanTimeToDeliver: deliverCount > 0 ? deliverSum / deliverCount : null,
                meanTimeToTest: testCount > 0 ? testSum / testCount : null,
                meanTimeToDone: doneCount > 0 ? doneSum / doneCount : null,
                sampleSize: {
                    deliver: deliverCount,
                    test: testCount,
                    done: doneCount
                }
            },
            memberTimeMetrics,
            totals: {
                storyCount: totalStory,
                taskCount: totalTask,
                testCount: totalTest,
                totalCount,
                doneCount: totalDone,
                completionRate: totalCount > 0 ? (totalDone / totalCount) * 100 : 0
            }
        };
    }, [boardMetricsData]);

    const handleBoardChange = async (boardId: number | null) => {
        setSelectedBoardId(boardId);
        setSelectedSprintId(null);
        setMetricsData(null);
        setBoardMetricsData(null);
        setAiSummary(null);
        setAiError(null);

        if (!boardId) return;

        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/metrics/board?boardId=${boardId}&year=2026`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to load board metrics');
            setBoardMetricsData(data.data);
            generateAiSummary(null, data.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load board metrics');
        } finally {
            setLoading(false);
        }
    };

    const handleSprintChange = async (sprintId: number | null) => {
        setSelectedSprintId(sprintId);
        setAiSummary(null);
        setAiError(null);

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
            generateAiSummary(data.data, boardMetricsData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load metrics');
            setMetricsData(null);
        } finally {
            setLoading(false);
        }
    };

    const generateAiSummary = async (sprintData: any = null, boardData: any = null) => {
        const useSprintId = selectedSprintId;
        const currentSprintMetrics = sprintData || metricsData;
        const currentBoardMetrics = boardData || boardMetricsData;

        if (!currentSprintMetrics && !currentBoardMetrics) return;
        setIsGeneratingAI(true);
        setAiError(null);

        try {
            const body = useSprintId
                ? { type: 'sprint', sprintMetrics: currentSprintMetrics, sprintId: useSprintId, boardId: selectedBoardId }
                : { type: 'board', boardMetrics: currentBoardMetrics, boardId: selectedBoardId };

            const response = await fetch('/api/ai-metrics-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate summary');
            }

            setAiSummary(data.summary);
        } catch (err) {
            setAiError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsGeneratingAI(false);
        }
    };

    const handleDownloadMetrics = () => {
        let csvContent = '';
        let filename = 'Metrics_Report.csv';

        if (metricsData && selectedSprintId) {
            // Sprint Level Export
            filename = `Sprint_${selectedSprintId}_Metrics.csv`;
            const lines: string[] = [];

            // Totals
            lines.push('Sprint Data,Value');
            lines.push(`Total Issues,${metricsData.totals.totalCount}`);
            lines.push(`Completion Rate,${metricsData.totals.completionRate.toFixed(1)}%`);
            lines.push(`Done Count,${metricsData.totals.doneCount}`);
            lines.push('');

            // Speed Metrics
            lines.push('Delivery Speed (Hours),Value,Sample Size');
            lines.push(`Mean Time to Deliver,${metricsData.timeMetrics.meanTimeToDeliver?.toFixed(1) || 'N/A'},${metricsData.timeMetrics.sampleSize.deliver}`);
            lines.push(`Mean Time to Test,${metricsData.timeMetrics.meanTimeToTest?.toFixed(1) || 'N/A'},${metricsData.timeMetrics.sampleSize.test}`);
            lines.push(`Mean Time to Done,${metricsData.timeMetrics.meanTimeToDone?.toFixed(1) || 'N/A'},${metricsData.timeMetrics.sampleSize.done}`);
            lines.push('');

            // Member Delivery Speed
            if (metricsData.memberTimeMetrics && metricsData.memberTimeMetrics.length > 0) {
                lines.push('Per-Member Delivery Speed,MTD (Hours),Done (Hours),Sample Size (Done)');
                metricsData.memberTimeMetrics.forEach(m => {
                    lines.push(`"${m.displayName}",${m.meanTimeToDeliver?.toFixed(1) || 'N/A'},${m.meanTimeToDone?.toFixed(1) || 'N/A'},${m.sampleSize.done}`);
                });
                lines.push('');
            }

            // Weekly Breakdown
            lines.push('Week,Story,Task,Test,Done,Total,Completion %');
            metricsData.weeklyMetrics.forEach(w => {
                lines.push(`"${w.weekLabel}",${w.storyCount},${w.taskCount},${w.testCount},${w.doneCount},${w.totalCount},${w.completionRate.toFixed(1)}%`);
            });

            csvContent = lines.join('\n');

        } else if (boardMetricsData && !selectedSprintId) {
            // Board Level Export
            filename = `Board_${selectedBoardId}_YoY_Metrics.csv`;
            const lines: string[] = [];

            lines.push('Sprint Name,Mean Time to Deliver (h),Mean Time to Done (h)');
            boardMetricsData.sprintMetrics.forEach((sm: any) => {
                const mttd = sm.meanTimeToDeliver ? sm.meanTimeToDeliver.toFixed(1) : 'N/A';
                const mttc = sm.meanTimeToDone ? sm.meanTimeToDone.toFixed(1) : 'N/A';
                lines.push(`"${sm.sprint.name}",${mttd},${mttc}`);
            });

            csvContent = lines.join('\n');
        } else {
            return; // Nothing to export
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">
                        Metrics Dashboard
                    </h1>
                    <p className="text-muted-foreground mt-2">Track issue flow, completion rates, and delivery speed</p>
                </div>
            </div>

            {/* Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 hide-on-print">
                <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-3">
                        Select Board
                    </label>
                    <BoardSelector
                        selectedBoardId={selectedBoardId}
                        onBoardChange={handleBoardChange}
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-muted-foreground mb-3">
                        Select Sprint
                    </label>
                    <SprintSelector
                        boardId={selectedBoardId}
                        selectedSprintId={selectedSprintId}
                        onSprintChange={handleSprintChange}
                        allowAllSprints={true}
                    />
                </div>
            </div>

            {/* AI Summary Section */}
            {(aiSummary || aiError) && (
                <div className="mb-8 p-6 bg-muted/50 border border-border rounded-xl shadow-sm relative animate-fadeIn">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> Executive Analytics Report
                    </h3>

                    {aiError ? (
                        <div className="text-red-400 text-sm flex gap-2 items-center">
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            {aiError}
                        </div>
                    ) : (
                        <div className="text-sm text-foreground/80 space-y-4 leading-relaxed">
                            {aiSummary?.split('\n').filter(line => line.trim()).map((line, i) => {
                                if (line.startsWith('**Trend Highlights**') || line.startsWith('**Speed Highlights**') || line.startsWith('**Flow & Completion**')) {
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

            {/* Loading */}
            {loading && (
                <div className="text-center py-20">
                    <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading metrics data...</p>
                    <p className="text-xs text-muted-foreground mt-1">Fetching issue changelogs for time analysis</p>
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

                    {/* Per-Member Delivery Speed */}
                    {metricsData.memberTimeMetrics && metricsData.memberTimeMetrics.length > 0 && (
                        <MemberTimeMetricsTable data={metricsData} />
                    )}

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
                    {aggregateMetrics && (
                        <>
                            {/* Year-to-Date Time Metrics Summary Cards */}
                            <TimeMetricsCards data={aggregateMetrics as MetricsData} />

                            {/* Year-to-Date Per-Member Delivery Speed */}
                            {aggregateMetrics.memberTimeMetrics && aggregateMetrics.memberTimeMetrics.length > 0 && (
                                <MemberTimeMetricsTable data={aggregateMetrics as MetricsData} />
                            )}

                            {/* Year-to-Date Issue Totals Cards */}
                            <IssueTotalsCards data={aggregateMetrics as MetricsData} />
                        </>
                    )}

                    {/* Timeline Trend Line */}
                    <BoardYearlyTrendChart data={boardMetricsData} />
                </div>
            )}

            {/* Empty State */}
            {!metricsData && !boardMetricsData && !loading && !error && !selectedBoardId && (
                <div className="text-center py-20">
                    <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
                    </div>
                    <p className="text-muted-foreground">Select a board to view 2026 metrics</p>
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
        <div className="p-6 bg-muted/30 border border-border rounded-xl">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-foreground">2026 Delivery Timeline</h3>
                <p className="text-sm text-muted-foreground">Mean Time to Deliver & Done across all sprints</p>
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
            icon: <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
            gradient: '',
            border: 'border-border',
        },
        {
            label: 'Mean Time to Test',
            sublabel: 'In Progress → QA/Review',
            value: timeMetrics.meanTimeToTest,
            sample: timeMetrics.sampleSize.test,
            thresholds: [48, 120] as [number, number],
            icon: <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>,
            gradient: '',
            border: 'border-border',
        },
        {
            label: 'Mean Time to Done',
            sublabel: 'Sprint Start → Done',
            value: timeMetrics.meanTimeToDone,
            sample: timeMetrics.sampleSize.done,
            thresholds: [120, 240] as [number, number],
            icon: <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
            gradient: '',
            border: 'border-border',
        },
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
                    <h2 className="text-xl font-bold text-foreground">Delivery Speed</h2>
                    <p className="text-sm text-muted-foreground">Average time for issue lifecycle stages</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map((card) => (
                    <div key={card.label} className={`p-6 bg-muted/50 rounded-xl border ${card.border}`}>
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
                        <div className="text-[10px] text-muted-foreground">
                            Based on {card.sample} issue{card.sample !== 1 ? 's' : ''}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Per-Member Time Metrics Table
 */
function MemberTimeMetricsTable({ data }: { data: MetricsData }) {
    const { memberTimeMetrics } = data;

    return (
        <div className="bg-muted/30 rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20">
                <h3 className="text-base font-semibold text-muted-foreground flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                    Team Delivery Performance
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Mean Time to Deliver and Done per team member based on story/subtask completions.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-muted/30 text-xs uppercase text-muted-foreground tracking-wider">
                            <th className="p-3 pl-4 font-medium">Team Member</th>
                            <th className="p-3 font-medium text-center">Mean Time to Deliver (MTD)</th>
                            <th className="p-3 font-medium text-center border-l border-border">Mean Time to Done (MTTC)</th>
                            <th className="p-3 font-medium text-center border-l border-border">Sample Size</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm text-foreground/70 bg-background/30">
                        {memberTimeMetrics.map((member) => (
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
                                        <span className={`font-mono font-bold text-base ${getTimeColor(member.meanTimeToDeliver, [24, 72])}`}>
                                            {formatDuration(member.meanTimeToDeliver)}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground/50">—</span>
                                    )}
                                </td>
                                <td className="p-3 text-center border-l border-border">
                                    {member.meanTimeToDone !== null ? (
                                        <span className={`font-mono font-bold text-base ${getTimeColor(member.meanTimeToDone, [120, 240])}`}>
                                            {formatDuration(member.meanTimeToDone)}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground/50">—</span>
                                    )}
                                </td>
                                <td className="p-3 text-center border-l border-border text-muted-foreground">
                                    {member.sampleSize.done} done / {member.sampleSize.deliver} delivered
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className="text-3xl font-bold text-foreground mb-1">
                    {totals.totalCount}
                </div>
                <div className="text-xs text-muted-foreground">Total Issues</div>
            </div>
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className="text-3xl font-bold text-blue-400 mb-1">
                    {totals.storyCount}
                </div>
                <div className="text-xs text-muted-foreground">Stories</div>
            </div>
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className="text-3xl font-bold text-blue-400 mb-1">
                    {totals.taskCount}
                </div>
                <div className="text-xs text-muted-foreground">Tasks</div>
            </div>
            <div className="text-center p-5 bg-muted/50 rounded-xl border border-border">
                <div className="text-3xl font-bold text-indigo-400 mb-1">
                    {totals.testCount}
                </div>
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
        <div className="bg-muted/30 rounded-xl p-6 border border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-1">Issue Count by Type</h3>
            <p className="text-xs text-muted-foreground mb-4">Story, Task, and Test issues per week</p>
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
        <div className="bg-muted/30 rounded-xl p-6 border border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-1">Completion Rate</h3>
            <p className="text-xs text-muted-foreground mb-4">Percentage of issues completed per week</p>
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
