'use client';

import { useState } from 'react';
import { SprintSummary } from '@/types';

interface SprintSummaryProps {
    summary: SprintSummary;
}

export default function SprintSummaryComponent({ summary }: SprintSummaryProps) {
    const { sprint, totalStoryPoints, totalWorkingDays, averageUtilization, userUtilizations, workTypeStats } = summary;

    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const generateAiSummary = async () => {
        setIsGeneratingAI(true);
        setAiError(null);
        try {
            const response = await fetch('/api/ai-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(summary)
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

    const totalMandays = (summary.engineerStats?.mandays || 0) + (summary.qaStats?.mandays || 0);
    const totalLeaveDays = (summary.engineerStats?.leaveDays || 0) + (summary.qaStats?.leaveDays || 0);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    const getAverageStatusColor = (percent: number) => {
        if (percent < 70) return 'text-blue-400';
        if (percent > 110) return 'text-red-400';
        return 'text-green-400';
    };

    // Sprint timeline calculations
    const now = new Date();
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    const progressPercent = totalDuration > 0 ? Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100) : 0;

    // Calculate working days elapsed and remaining
    const getWorkingDaysBetween = (from: Date, to: Date) => {
        let count = 0;
        const current = new Date(from);
        while (current <= to) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) count++;
            current.setDate(current.getDate() + 1);
        }
        return count;
    };

    const isSprintActive = now >= startDate && now <= endDate;
    const isSprintFinished = now > endDate;
    const daysElapsed = isSprintFinished
        ? totalWorkingDays
        : isSprintActive
            ? getWorkingDaysBetween(startDate, now)
            : 0;
    const daysRemaining = Math.max(totalWorkingDays - daysElapsed, 0);

    // Work type colors
    const workTypeColors: Record<string, { bg: string; border: string; text: string; bar: string }> = {
        'Product': { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', bar: 'bg-emerald-500' },
        'Technical Initiatives': { bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-400', bar: 'bg-blue-500' },
        'Incident': { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', bar: 'bg-red-500' },
    };
    const defaultColor = { bg: 'bg-gray-500/15', border: 'border-gray-500/30', text: 'text-gray-400', bar: 'bg-gray-500' };

    return (
        <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30">
            {/* Row 1: Key Metrics + Sprint Timeline */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-2">
                {/* Total Story Points */}
                <div className="text-center py-2 px-2 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-lg border border-blue-500/20 cursor-help" title="Sum of all sub-task and sub-chore story points assigned in this sprint. Only sub-tasks/sub-chores are counted, not parent stories.">
                    <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent leading-tight">
                        {totalStoryPoints}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Story Points</div>
                </div>

                {/* Sprint Timeline (merged with Working Days) */}
                <div className="col-span-2 md:col-span-3 py-2 px-3 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20" title="Working days = weekdays in the sprint period, excluding national holidays. Progress bar shows calendar position through the sprint.">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight">
                                {totalWorkingDays}
                            </span>
                            <span className="text-[10px] text-gray-400">working days</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {isSprintActive && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                                    ⏳ {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
                                </span>
                            )}
                            {isSprintFinished && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30 font-medium">
                                    ✅ Completed
                                </span>
                            )}
                            {!isSprintActive && !isSprintFinished && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30 font-medium">
                                    Not started
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="relative h-2 bg-gray-700/50 rounded-full overflow-hidden mb-1.5">
                        <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                        {/* Today marker */}
                        {isSprintActive && (
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                                style={{ left: `${progressPercent}%` }}
                            />
                        )}
                    </div>

                    {/* Date labels */}
                    <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-[9px] text-gray-500">{formatDate(sprint.startDate)}</span>
                        <div className="flex items-center gap-3 text-[9px]">
                            <span className="text-purple-400">{daysElapsed} elapsed</span>
                            <span className="text-gray-600">•</span>
                            <span className="text-pink-400">{daysRemaining} remaining</span>
                        </div>
                        <span className="text-[9px] text-gray-500">{formatDate(sprint.endDate)}</span>
                    </div>

                    {/* Holidays tooltip */}
                    {summary.holidays && summary.holidays.length > 0 && (
                        <div className="mt-1.5 bg-black/20 rounded p-1 border border-purple-500/20">
                            <div className="text-[8px] text-purple-300 font-medium mb-0.5">
                                🏖️ {summary.holidays.length} holiday{summary.holidays.length > 1 ? 's' : ''} excluded
                            </div>
                            <div className="flex flex-wrap gap-x-2 gap-y-0">
                                {summary.holidays.map((h, i) => (
                                    <span key={i} className="text-[8px] text-gray-500">
                                        {h.holiday_name} ({formatDate(h.holiday_date)})
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Total Mandays */}
                <div className="text-center py-2 px-2 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20 cursor-help" title="Sum of available days for all roster members, based on their title's configured days minus any manual leave. Mandays = Σ (title available days − leave days) per member.">
                    <div className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent leading-tight">
                        {totalMandays}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Mandays</div>
                    <div className="text-[9px] text-gray-500">
                        ({userUtilizations.length} members)
                    </div>
                    {totalLeaveDays > 0 && (
                        <div className="text-[9px] text-red-400">
                            -{totalLeaveDays} leave
                        </div>
                    )}
                </div>

                {/* Avg Utilization */}
                <div className="text-center py-2 px-2 bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-lg border border-orange-500/20 cursor-help" title="Average utilization = (Total Story Points ÷ Total Mandays) × 100%. Shows how much of the team's available capacity was used. Under 70% = under-utilized, over 110% = over-utilized.">
                    <div className={`text-2xl font-bold leading-tight ${getAverageStatusColor(averageUtilization)}`}>
                        {averageUtilization.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Avg Util</div>
                </div>
            </div>

            {/* Row 2: Work Type Distribution — compact bar */}
            {
                workTypeStats && Object.keys(workTypeStats).length > 0 && (
                    <div className="px-2 pb-1">
                        <div className="bg-gray-800/30 rounded-lg px-2.5 py-1.5 border border-gray-700/30">
                            <div className="flex items-center gap-3">
                                <h3 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider shrink-0 cursor-help" title="Classification based on the parent epic's work type label (Product, Technical Initiatives, or Incident). Points are from sub-tasks/sub-chores.">Work Type</h3>

                                {/* Stacked horizontal bar */}
                                <div className="flex h-2 rounded-full overflow-hidden bg-gray-700/50 flex-1">
                                    {Object.entries(workTypeStats).map(([type, points]) => {
                                        const percentage = totalStoryPoints > 0 ? (points / totalStoryPoints) * 100 : 0;
                                        if (percentage === 0) return null;
                                        const colors = workTypeColors[type] || defaultColor;
                                        return (
                                            <div
                                                key={type}
                                                className={`${colors.bar} transition-all duration-700 first:rounded-l-full last:rounded-r-full`}
                                                style={{ width: `${percentage}%` }}
                                                title={`${type}: ${points} pts (${percentage.toFixed(0)}%)`}
                                            />
                                        );
                                    })}
                                </div>

                                <span className="text-[9px] text-gray-500 shrink-0">{totalStoryPoints} pts</span>
                            </div>

                            {/* Legend pills */}
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {Object.entries(workTypeStats).map(([type, points]) => {
                                    const percentage = totalStoryPoints > 0 ? (points / totalStoryPoints) * 100 : 0;
                                    const colors = workTypeColors[type] || defaultColor;
                                    const emoji = type === 'Product' ? '📦' : type === 'Technical Initiatives' ? '⚙️' : type === 'Incident' ? '🐛' : '📋';
                                    return (
                                        <div
                                            key={type}
                                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${colors.bg} border ${colors.border}`}
                                        >
                                            <span className="text-[9px]">{emoji}</span>
                                            <span className={`text-[9px] font-medium ${colors.text}`}>{type}</span>
                                            <span className="text-[9px] font-bold text-white">{points} pts</span>
                                            <span className="text-[8px] text-gray-500">({percentage.toFixed(0)}%)</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Row 3: QA vs Engineer Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 px-2 pb-2">
                {/* Engineers Stats */}
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-lg px-3 py-2 border border-blue-500/20" title="Engineers breakdown">
                    <div className="flex items-center gap-4">
                        <h3 className="text-xs font-bold text-blue-400 flex items-center gap-1 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                            Engineers ({summary.engineerStats?.count || 0})
                        </h3>
                        <div className="flex items-center gap-4">
                            <div>
                                <span className="text-[10px] text-gray-400">Mandays </span>
                                <span className="text-sm font-bold text-white">{summary.engineerStats?.mandays || 0}</span>
                                {summary.engineerStats?.leaveDays > 0 && (
                                    <span className="text-[9px] text-red-400 ml-0.5">-{summary.engineerStats.leaveDays}</span>
                                )}
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400">Points </span>
                                <span className="text-sm font-bold text-white">{summary.engineerStats?.storyPoints || 0}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400">Util </span>
                                <span className="text-sm font-bold text-blue-300">
                                    {(summary.engineerStats?.mandays > 0 ? (summary.engineerStats.storyPoints / summary.engineerStats.mandays * 100) : 0).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                        {/* Work type badges inline */}
                        {summary.engineerStats?.workTypeStats && (
                            <div className="flex gap-1 ml-auto">
                                {summary.engineerStats.workTypeStats['Product'] > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30">📦 {summary.engineerStats.workTypeStats['Product']}</span>
                                )}
                                {summary.engineerStats.workTypeStats['Technical Initiatives'] > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">⚙️ {summary.engineerStats.workTypeStats['Technical Initiatives']}</span>
                                )}
                                {summary.engineerStats.workTypeStats['Incident'] > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">🐛 {summary.engineerStats.workTypeStats['Incident']}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* QA Stats */}
                <div className="bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-lg px-3 py-2 border border-pink-500/20" title="QA breakdown">
                    <div className="flex items-center gap-4">
                        <h3 className="text-xs font-bold text-pink-400 flex items-center gap-1 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-400"></span>
                            QA ({summary.qaStats?.count || 0})
                        </h3>
                        <div className="flex items-center gap-4">
                            <div>
                                <span className="text-[10px] text-gray-400">Mandays </span>
                                <span className="text-sm font-bold text-white">{summary.qaStats?.mandays || 0}</span>
                                {summary.qaStats?.leaveDays > 0 && (
                                    <span className="text-[9px] text-red-400 ml-0.5">-{summary.qaStats.leaveDays}</span>
                                )}
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400">Points </span>
                                <span className="text-sm font-bold text-white">{summary.qaStats?.storyPoints || 0}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-gray-400">Util </span>
                                <span className="text-sm font-bold text-pink-300">
                                    {(summary.qaStats?.mandays > 0 ? (summary.qaStats.storyPoints / summary.qaStats.mandays * 100) : 0).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                        {/* Work type badges inline */}
                        {summary.qaStats?.workTypeStats && (
                            <div className="flex gap-1 ml-auto">
                                {summary.qaStats.workTypeStats['Product'] > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30">📦 {summary.qaStats.workTypeStats['Product']}</span>
                                )}
                                {summary.qaStats.workTypeStats['Technical Initiatives'] > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">⚙️ {summary.qaStats.workTypeStats['Technical Initiatives']}</span>
                                )}
                                {summary.qaStats.workTypeStats['Incident'] > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">🐛 {summary.qaStats.workTypeStats['Incident']}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Row 4: AI Summary */}
            <div className="px-2 pb-2">
                {!aiSummary && !isGeneratingAI && (
                    <button
                        onClick={generateAiSummary}
                        className="w-full py-1.5 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 hover:from-purple-500/20 hover:to-indigo-500/20 border border-purple-500/20 rounded-lg flex items-center justify-center gap-2 text-purple-300 text-xs font-semibold transition-all shadow-sm"
                    >
                        ✨ Generate AI Summary
                    </button>
                )}

                {isGeneratingAI && (
                    <div className="w-full py-3 bg-gray-800/30 border border-gray-700/30 rounded-lg flex items-center justify-center gap-2 text-gray-400 text-xs animate-pulse">
                        <svg className="animate-spin h-3.5 w-3.5 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Analyzing sprint data with Gemini...
                    </div>
                )}

                {aiError && (
                    <div className="w-full p-2 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-xs flex justify-between items-center">
                        <span>⚠️ {aiError}</span>
                        <button onClick={generateAiSummary} className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 rounded transition-colors">Retry</button>
                    </div>
                )}

                {aiSummary && (
                    <div className="bg-gradient-to-br from-purple-900/20 to-indigo-900/10 rounded-lg p-3 border border-purple-500/30 relative shadow-sm">
                        <div className="absolute top-3 right-3 flex gap-2">
                            <button
                                onClick={generateAiSummary}
                                className="text-[9px] px-2 py-1 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/20 text-purple-300 rounded transition-colors"
                            >
                                🔄 Regenerate
                            </button>
                        </div>
                        <h3 className="text-xs font-bold text-purple-400 flex items-center gap-1.5 mb-2.5">
                            <span>✨</span> AI Executive Summary
                        </h3>
                        <div className="text-xs text-gray-300 space-y-2 leading-relaxed">
                            {aiSummary.split('\n').filter(line => line.trim()).map((line, i) => {
                                // Bold parsing for markdown
                                const cleanLine = line.replace(/^\*?\*?[\-\*]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
                                return (
                                    <div key={i} className="flex gap-2.5 items-start">
                                        <span className="text-purple-400 mt-[3px] flex-shrink-0 text-[10px]">•</span>
                                        <span dangerouslySetInnerHTML={{ __html: cleanLine }} />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 pt-2 border-t border-purple-500/10 text-[9px] text-gray-500 flex items-center justify-between">
                            <span className="flex items-center gap-1">Powered by <strong>Gemini 2.5 Flash-Lite</strong></span>
                            <span>AI can make mistakes. Verify important data.</span>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
