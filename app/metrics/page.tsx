'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import BoardSelector from '@/components/BoardSelector';
import SprintSelector from '@/components/SprintSelector';
import { MetricsData } from '@/types';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    LineChart, Line, ResponsiveContainer
} from 'recharts';

const TeamScorecard = lazy(() => import('@/components/metrics/TeamScorecard'));
const SquadGrid = lazy(() => import('@/components/metrics/SquadGrid'));
const VelocityOverview = lazy(() => import('@/components/metrics/VelocityOverview'));

function SectionLoader() {
    return (
        <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
}

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
    const [selectedSprintId, setSelectedSprintId] = useState<number | null>(-1 as any);
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

        // New aggregate accumulators
        let cycleTimeSum = 0, cycleTimeCount = 0;
        let leadTimeSum = 0, leadTimeCount = 0;
        let aggThroughput = 0;
        const aggBreakdown = {
            subTasks: { delivered: 0, total: 0 },
            subChores: { delivered: 0, total: 0 },
            other: { delivered: 0, total: 0 },
        };

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

            // Accumulate cycle time / lead time / throughput / breakdown
            if (sm.cycleTimeMetrics) {
                if (sm.cycleTimeMetrics.avgCycleTimeDays != null && sm.cycleTimeMetrics.sampleSize > 0) {
                    cycleTimeSum += sm.cycleTimeMetrics.avgCycleTimeDays * sm.cycleTimeMetrics.sampleSize;
                    cycleTimeCount += sm.cycleTimeMetrics.sampleSize;
                }
                if (sm.cycleTimeMetrics.avgLeadTimeDays != null && sm.cycleTimeMetrics.sampleSize > 0) {
                    leadTimeSum += sm.cycleTimeMetrics.avgLeadTimeDays * sm.cycleTimeMetrics.sampleSize;
                    leadTimeCount += sm.cycleTimeMetrics.sampleSize;
                }
                aggThroughput += sm.cycleTimeMetrics.throughput || 0;
            }
            if (sm.issueBreakdown) {
                aggBreakdown.subTasks.delivered += sm.issueBreakdown.subTasks?.delivered || 0;
                aggBreakdown.subTasks.total += sm.issueBreakdown.subTasks?.total || 0;
                aggBreakdown.subChores.delivered += sm.issueBreakdown.subChores?.delivered || 0;
                aggBreakdown.subChores.total += sm.issueBreakdown.subChores?.total || 0;
                aggBreakdown.other.delivered += sm.issueBreakdown.other?.delivered || 0;
                aggBreakdown.other.total += sm.issueBreakdown.other?.total || 0;
            }

            if (sm.memberTimeMetrics) {
                sm.memberTimeMetrics.forEach((m: any) => {
                    if (!memberAggMap.has(m.accountId)) {
                        memberAggMap.set(m.accountId, {
                            ...m,
                            deliverSum: 0,
                            deliverCount: 0,
                            doneSum: 0,
                            doneCount: 0,
                            cycleTimeSum: 0,
                            cycleTimeCount: 0,
                            leadTimeSum: 0,
                            leadTimeCount: 0,
                            aggThroughput: 0,
                            aggSubTasks: { delivered: 0, total: 0 },
                            aggSubChores: { delivered: 0, total: 0 },
                            aggOther: { delivered: 0, total: 0 },
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
                    if (m.cycleTimeAvg != null) {
                        agg.cycleTimeSum += m.cycleTimeAvg * m.throughput;
                        agg.cycleTimeCount += m.throughput;
                    }
                    if (m.leadTimeAvg != null) {
                        agg.leadTimeSum += m.leadTimeAvg * m.throughput;
                        agg.leadTimeCount += m.throughput;
                    }
                    agg.aggThroughput += m.throughput || 0;
                    if (m.subTasks) {
                        agg.aggSubTasks.delivered += m.subTasks.delivered || 0;
                        agg.aggSubTasks.total += m.subTasks.total || 0;
                    }
                    if (m.subChores) {
                        agg.aggSubChores.delivered += m.subChores.delivered || 0;
                        agg.aggSubChores.total += m.subChores.total || 0;
                    }
                    if (m.other) {
                        agg.aggOther.delivered += m.other.delivered || 0;
                        agg.aggOther.total += m.other.total || 0;
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
                },
                cycleTimeAvg: m.cycleTimeCount > 0 ? Math.round((m.cycleTimeSum / m.cycleTimeCount) * 10) / 10 : null,
                leadTimeAvg: m.leadTimeCount > 0 ? Math.round((m.leadTimeSum / m.leadTimeCount) * 10) / 10 : null,
                throughput: m.aggThroughput,
                subTasks: m.aggSubTasks,
                subChores: m.aggSubChores,
                other: m.aggOther,
            }))
            .filter(m => m.sampleSize.deliver > 0 || m.sampleSize.done > 0 || m.throughput > 0)
            .sort((a, b) => b.throughput - a.throughput);

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
            },
            cycleTimeMetrics: {
                avgCycleTimeDays: cycleTimeCount > 0 ? Math.round((cycleTimeSum / cycleTimeCount) * 10) / 10 : null,
                avgLeadTimeDays: leadTimeCount > 0 ? Math.round((leadTimeSum / leadTimeCount) * 10) / 10 : null,
                throughput: aggThroughput,
                sampleSize: cycleTimeCount,
            },
            issueBreakdown: aggBreakdown,
        };
    }, [boardMetricsData]);

    const handleBoardChange = async (boardId: number | null) => {
        setSelectedBoardId(boardId);
        setSelectedSprintId(-1 as any);
        setMetricsData(null);
        setBoardMetricsData(null);
        setAiSummary(null);
        setAiError(null);
    };

    const loadBoardMetrics = async (boardId: number) => {
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
            // Load board metrics when "All Sprints (YTD)" is selected
            if (selectedBoardId && !boardMetricsData) {
                await loadBoardMetrics(selectedBoardId);
            } else if (boardMetricsData) {
                generateAiSummary(null, boardMetricsData);
            }
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
        const useSprintId = selectedSprintId && selectedSprintId > 0 ? selectedSprintId : null;
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

        } else if (boardMetricsData && selectedSprintId === null) {
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
                    <p className="text-muted-foreground mt-2">Team performance, velocity, and delivery metrics at a glance</p>
                </div>
            </div>

            {/* === Team Scorecard (Top/Bottom 3) === */}
            <div className="mb-8">
                <Suspense fallback={<SectionLoader />}>
                    <TeamScorecard />
                </Suspense>
            </div>

            {/* === Squad Overview Grid === */}
            <div className="mb-8">
                <Suspense fallback={<SectionLoader />}>
                    <SquadGrid />
                </Suspense>
            </div>

            {/* === Velocity Overview (board-scoped) === */}
            <div className="mb-8">
                <Suspense fallback={<SectionLoader />}>
                    <VelocityOverview boardId={selectedBoardId} />
                </Suspense>
            </div>

            {/* Divider between overview and detailed metrics */}
            <div className="border-t border-border mb-8 pt-8">
                <h2 className="text-xl font-bold text-foreground mb-1">Detailed Sprint Metrics</h2>
                <p className="text-sm text-muted-foreground">Select a board and sprint to view in-depth delivery metrics</p>
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

                    {/* Cycle Time / Lead Time / Throughput Cards */}
                    <CycleTimeCards data={metricsData} />

                    {/* Issue Breakdown (Sub-Tasks / Sub-Chores / Other) */}
                    <IssueBreakdownCards data={metricsData} />

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
            {boardMetricsData && selectedSprintId === null && !loading && (
                <div className="space-y-8 animate-fadeIn">
                    {aggregateMetrics && (
                        <>
                            {/* Year-to-Date Time Metrics Summary Cards */}
                            <TimeMetricsCards data={aggregateMetrics as MetricsData} />

                            {/* Year-to-Date Cycle Time / Lead Time / Throughput */}
                            <CycleTimeCards data={aggregateMetrics as MetricsData} />

                            {/* Year-to-Date Issue Breakdown */}
                            <IssueBreakdownCards data={aggregateMetrics as MetricsData} />

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
            {!metricsData && !boardMetricsData && !loading && !error && (
                <div className="text-center py-20">
                    <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
                    </div>
                    <p className="text-muted-foreground">
                        {!selectedBoardId ? 'Select a board to view 2026 metrics' : 'Select a sprint or All Sprints (YTD) to view metrics'}
                    </p>
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
        cycleTime: sm.cycleTimeMetrics?.avgCycleTimeDays ?? null,
        leadTime: sm.cycleTimeMetrics?.avgLeadTimeDays ?? null,
    }));

    return (
        <div className="p-6 bg-muted/30 border border-border rounded-xl">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-foreground">2026 Delivery Timeline</h3>
                <p className="text-sm text-muted-foreground">Mean Time to Deliver & Done (hours) · Cycle & Lead Time (days) across all sprints</p>
            </div>

            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 40, left: 0, bottom: 20 }}>
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
                            yAxisId="hours"
                            stroke="#9CA3AF"
                            fontSize={12}
                            tickFormatter={(value) => `${value}h`}
                        />
                        <YAxis
                            yAxisId="days"
                            orientation="right"
                            stroke="#9CA3AF"
                            fontSize={12}
                            tickFormatter={(value) => `${value}d`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1F2937',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                color: '#F3F4F6',
                            }}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any, name: any) => {
                                const labels: Record<string, string> = {
                                    mttd: 'Mean Time to Deliver',
                                    mttc: 'Mean Time to Done',
                                    cycleTime: 'Avg Cycle Time',
                                    leadTime: 'Avg Lead Time',
                                };
                                const unit = name === 'cycleTime' || name === 'leadTime' ? 'd' : 'h';
                                return [`${value}${unit}`, labels[name] || name];
                            }}
                        />
                        <Line
                            yAxisId="hours"
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
                            yAxisId="hours"
                            type="monotone"
                            dataKey="mttc"
                            name="mttc"
                            stroke="#10B981"
                            strokeWidth={3}
                            dot={{ fill: '#10B981', r: 4 }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                            connectNulls
                        />
                        <Line
                            yAxisId="days"
                            type="monotone"
                            dataKey="cycleTime"
                            name="cycleTime"
                            stroke="#06B6D4"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={{ fill: '#06B6D4', r: 3 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            connectNulls
                        />
                        <Line
                            yAxisId="days"
                            type="monotone"
                            dataKey="leadTime"
                            name="leadTime"
                            stroke="#F59E0B"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={{ fill: '#F59E0B', r: 3 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
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

    const getCycleColor = (days: number | null) => {
        if (days === null) return 'text-muted-foreground/50';
        if (days <= 2) return 'text-green-400';
        if (days <= 5) return 'text-blue-400';
        if (days <= 10) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="bg-muted/30 rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20">
                <h3 className="text-base font-semibold text-muted-foreground flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                    Team Delivery Performance
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Delivery speed, cycle time, and issue breakdown per team member</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
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
                                        <span className={`font-mono font-bold ${getTimeColor(member.meanTimeToDeliver, [24, 72])}`}>
                                            {formatDuration(member.meanTimeToDeliver)}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground/50">—</span>
                                    )}
                                </td>
                                <td className="p-3 text-center border-l border-border">
                                    {member.meanTimeToDone !== null ? (
                                        <span className={`font-mono font-bold ${getTimeColor(member.meanTimeToDone, [120, 240])}`}>
                                            {formatDuration(member.meanTimeToDone)}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground/50">—</span>
                                    )}
                                </td>
                                <td className="p-3 text-center border-l border-border">
                                    <span className={`font-mono font-bold ${getCycleColor(member.cycleTimeAvg)}`}>
                                        {member.cycleTimeAvg !== null ? `${member.cycleTimeAvg}d` : '—'}
                                    </span>
                                </td>
                                <td className="p-3 text-center border-l border-border">
                                    <span className={`font-mono font-bold ${getCycleColor(member.leadTimeAvg)}`}>
                                        {member.leadTimeAvg !== null ? `${member.leadTimeAvg}d` : '—'}
                                    </span>
                                </td>
                                <td className="p-3 text-center border-l border-border font-bold text-foreground">
                                    {member.throughput}
                                </td>
                                <td className="p-3 text-center border-l border-border tabular-nums">
                                    <span className="font-semibold text-foreground">{member.subTasks.delivered}</span>
                                    <span className="text-muted-foreground">/{member.subTasks.total}</span>
                                </td>
                                <td className="p-3 text-center border-l border-border tabular-nums">
                                    <span className="font-semibold text-foreground">{member.subChores.delivered}</span>
                                    <span className="text-muted-foreground">/{member.subChores.total}</span>
                                </td>
                                <td className="p-3 text-center border-l border-border tabular-nums">
                                    <span className="font-semibold text-foreground">{member.other.delivered}</span>
                                    <span className="text-muted-foreground">/{member.other.total}</span>
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
 * Cycle Time / Lead Time / Throughput Cards
 */
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
        {
            label: 'Avg Cycle Time',
            sublabel: 'In Progress → Done',
            value: ct.avgCycleTimeDays,
            display: ct.avgCycleTimeDays !== null ? `${ct.avgCycleTimeDays}d` : '—',
            color: getCycleColor(ct.avgCycleTimeDays, [5, 10]),
            icon: <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
        },
        {
            label: 'Avg Lead Time',
            sublabel: 'Created → Done',
            value: ct.avgLeadTimeDays,
            display: ct.avgLeadTimeDays !== null ? `${ct.avgLeadTimeDays}d` : '—',
            color: getCycleColor(ct.avgLeadTimeDays, [7, 14]),
            icon: <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
        },
        {
            label: 'Throughput',
            sublabel: 'Issues completed',
            value: ct.throughput,
            display: `${ct.throughput}`,
            color: 'text-foreground',
            icon: <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
        },
    ];

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-foreground">Cycle & Lead Time</h2>
                    <p className="text-sm text-muted-foreground">Average business days for issue lifecycle · {ct.sampleSize} issues measured</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map((card) => (
                    <div key={card.label} className="p-6 bg-muted/50 rounded-xl border border-border">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xl">{card.icon}</span>
                            <div>
                                <div className="text-sm font-semibold text-foreground">{card.label}</div>
                                <div className="text-[10px] text-muted-foreground">{card.sublabel}</div>
                            </div>
                        </div>
                        <div className={`text-4xl font-bold mb-1 ${card.color}`}>
                            {card.display}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Issue Breakdown Cards (Sub-Tasks / Sub-Chores / Other)
 */
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
        { label: 'Sub-Tasks', delivered: bd.subTasks.delivered, total: bd.subTasks.total, color: 'text-blue-400', bg: 'bg-blue-500/20' },
        { label: 'Sub-Chores', delivered: bd.subChores.delivered, total: bd.subChores.total, color: 'text-purple-400', bg: 'bg-purple-500/20' },
        { label: 'Other', delivered: bd.other.delivered, total: bd.other.total, color: 'text-pink-400', bg: 'bg-pink-500/20' },
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
                    <h2 className="text-xl font-bold text-foreground">Issue Breakdown</h2>
                    <p className="text-sm text-muted-foreground">Delivered vs total by issue type · {totalDelivered}/{totalAll} completed</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map((card) => {
                    const pct = card.total > 0 ? Math.round((card.delivered / card.total) * 100) : 0;
                    return (
                        <div key={card.label} className="p-6 bg-muted/50 rounded-xl border border-border">
                            <div className="flex items-center gap-2 mb-3">
                                <div className={`w-8 h-8 ${card.bg} rounded-lg flex items-center justify-center`}>
                                    <span className={`text-sm font-bold ${card.color}`}>{card.label.charAt(0)}</span>
                                </div>
                                <div className="text-sm font-semibold text-foreground">{card.label}</div>
                            </div>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className={`text-3xl font-bold ${getCompletionColor(card.delivered, card.total)}`}>{card.delivered}</span>
                                <span className="text-lg text-muted-foreground">/ {card.total}</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${card.bg.replace('/20', '')}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1">{pct}% completion</div>
                        </div>
                    );
                })}
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
