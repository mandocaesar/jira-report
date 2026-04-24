'use client';

import { SprintSummary, SprintReportData } from '@/types';
import { useAiSummary } from '@/hooks/useAiSummary';
import { downloadSprintCSV } from '@/lib/csv-export';
import { computeRoleStats } from '@/lib/utilization-calculator';
import RoleBreakdownCard from '@/components/sprint/RoleBreakdownCard';
import SprintTimeline from '@/components/sprint/SprintTimeline';
import WorkTypeBreakdown from '@/components/sprint/WorkTypeBreakdown';
import ScopeChangesSummary from '@/components/sprint/ScopeChangesSummary';

interface SprintSummaryProps {
    summary: SprintSummary;
    reportData?: SprintReportData | null;
    onAiSummaryGenerate?: (summary: string) => void;
}

export default function SprintSummaryComponent({ summary, reportData, onAiSummaryGenerate }: SprintSummaryProps) {
    const { sprint, totalStoryPoints, totalWorkingDays, averageUtilization, userUtilizations, workTypeStats } = summary;

    const { epicBreakdowns, aiSummary, isGeneratingAI, aiError } = useAiSummary({
        summary,
        reportData: reportData ?? undefined,
        onGenerate: onAiSummaryGenerate,
    });

    const handleDownloadCSV = () => downloadSprintCSV(userUtilizations, epicBreakdowns, sprint.name);

    const engineerStats = summary.engineerStats ?? computeRoleStats(userUtilizations, 'engineer');
    const qaStats = summary.qaStats ?? computeRoleStats(userUtilizations, 'qa');
    const totalMandays = engineerStats.mandays + qaStats.mandays;
    const totalLeaveDays = engineerStats.leaveDays + qaStats.leaveDays;
    const totalEffectiveMandays = summary.totalEffectiveMandays ?? totalMandays;
    const hasHoursVariation = totalEffectiveMandays !== totalMandays;

    const getAverageStatusColor = (percent: number) => {
        if (percent < 70) return 'text-blue-400';
        if (percent > 110) return 'text-red-400';
        return 'text-green-400';
    };

    return (
        <div className="bg-muted/50">
            {/* Row 1: Key Metrics + Sprint Timeline */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-2">
                {/* Total Story Points */}
                <div className="text-center py-2 px-2 bg-muted/50 rounded-lg border border-border cursor-help" title="Sum of all sub-task and sub-chore story points assigned in this sprint. Only sub-tasks/sub-chores are counted, not parent stories.">
                    <div className="text-4xl font-bold text-foreground leading-tight pb-1">
                        {totalStoryPoints}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Story Points</div>
                </div>

                {/* Sprint Timeline */}
                <SprintTimeline sprint={sprint} totalWorkingDays={totalWorkingDays} holidays={summary.holidays} />

                {/* Total Mandays */}
                <div className="text-center py-2 px-2 bg-muted/50 rounded-lg border border-border cursor-help flex flex-col justify-center" title={hasHoursVariation ? `Effective Mandays = Σ (available days × member hours / team standard hours). Raw available days: ${totalMandays}. Team standard: ${summary.teamStandardHours ?? 8}h/day.` : 'Sum of available days for all roster members, based on their title\'s configured days minus any manual leave.'}>
                    <div className="text-3xl font-bold text-foreground leading-tight pb-1">
                        {hasHoursVariation ? totalEffectiveMandays.toFixed(1) : totalMandays}
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <div className="text-xs text-muted-foreground mt-0.5">{hasHoursVariation ? 'Eff. Mandays' : 'Mandays'}</div>
                        <div className="text-[10px] text-muted-foreground">
                            ({userUtilizations.length} members)
                        </div>
                        {hasHoursVariation && (
                            <div className="text-[10px] text-amber-400">
                                {totalMandays} raw days
                            </div>
                        )}
                        {totalLeaveDays > 0 && (
                            <div className="text-[10px] text-red-400">
                                -{totalLeaveDays} leave
                            </div>
                        )}
                    </div>
                </div>

                {/* Avg Utilization */}
                <div className="text-center py-2 px-2 bg-muted/50 rounded-lg border border-border cursor-help flex flex-col justify-center" title="Average utilization = (Total Story Points ÷ Total Mandays) × 100%. Shows how much of the team's available capacity was used. Under 70% = under-utilized, over 110% = over-utilized.">
                    <div className={`text-3xl font-bold leading-tight pb-1 ${getAverageStatusColor(averageUtilization)}`}>
                        {averageUtilization.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Avg Util</div>
                </div>
            </div>

            {/* Row 2: Work Type Distribution */}
            <WorkTypeBreakdown workTypeStats={workTypeStats} totalStoryPoints={totalStoryPoints} />

            {/* Scope Changes Summary */}
            <ScopeChangesSummary scopeChanges={reportData?.scopeChanges || []} />

            {/* Row 3: QA vs Engineer Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 px-2 pb-2">
                <RoleBreakdownCard roleName="Engineers" stats={engineerStats} accentColor="blue" />
                <RoleBreakdownCard roleName="QA" stats={qaStats} accentColor="indigo" />
            </div>

            {/* Row 5: Epic Progress Trackers */}
            {epicBreakdowns.length > 0 && (
                <div className="px-2 pb-2">
                    <div className="bg-muted/30 rounded-lg border border-border p-3">
                        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3 cursor-help" title="Top epics heavily worked on during this sprint based on story points completed vs total currently in the epic.">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            Active Epic Progress
                        </h3>
                        <div className="flex flex-col gap-2.5">
                            {epicBreakdowns.slice(0, 5).map((epic, i) => (
                                <div key={i} className="bg-muted/20 p-2.5 rounded border border-border flex flex-col md:flex-row md:items-center gap-2">
                                    <div className="flex-1 min-w-[200px]">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1 rounded whitespace-nowrap">{epic.epicKey}</span>
                                            <span className="text-xs font-semibold text-foreground line-clamp-1">{epic.epicName}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[11px] font-medium text-muted-foreground shrink-0 w-[55px] text-right">
                                            <span className="text-foreground font-bold">{epic.completedPoints}</span> / {epic.totalPoints}
                                        </span>
                                        <div className="w-24 md:w-32 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-foreground rounded-full transition-all duration-700"
                                                style={{ width: `${epic.completionPercent}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-blue-400 w-8 text-right font-medium">
                                            {epic.completionPercent.toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Row 6: AI Summary */}
            <div className="px-2 pb-2">
                {isGeneratingAI && (
                    <div className="w-full py-3 bg-muted/30 border border-border rounded-lg flex items-center justify-center gap-2 text-muted-foreground text-xs animate-pulse">
                        <svg className="animate-spin h-3.5 w-3.5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Analyzing sprint data with Gemini...
                    </div>
                )}

                {aiError && (
                    <div className="w-full p-2 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        {aiError}
                    </div>
                )}

                {aiSummary && (() => {
                    // Parse into sections
                    const sectionConfig: Record<string, { icon: React.ReactNode; color: string; borderColor: string; bgColor: string }> = {
                        'Sprint Delivery': { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, color: 'text-blue-400', borderColor: 'border-border', bgColor: '' },
                        'Top Contributors & Quick Wins': { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>, color: 'text-amber-400', borderColor: 'border-border', bgColor: '' },
                        'Completion Efficiency': { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, color: 'text-cyan-400', borderColor: 'border-border', bgColor: '' },
                        'Epic Summary': { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>, color: 'text-emerald-400', borderColor: 'border-border', bgColor: '' },
                        'Key Areas of Concern': { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>, color: 'text-red-400', borderColor: 'border-border', bgColor: '' },
                    };

                    const sections: { title: string; lines: string[] }[] = [];
                    let currentSection: { title: string; lines: string[] } | null = null;

                    aiSummary.split('\n').filter((line: string) => line.trim()).forEach((line: string) => {
                        const headerMatch = line.match(/^\*\*(.+?)\*\*$/);
                        if (headerMatch && sectionConfig[headerMatch[1]]) {
                            currentSection = { title: headerMatch[1], lines: [] };
                            sections.push(currentSection);
                        } else if (currentSection) {
                            currentSection.lines.push(line);
                        }
                    });

                    return (
                        <div className="bg-muted/20 rounded-lg p-3 border border-border relative shadow-sm">
                            <h3 className="text-base font-bold text-foreground flex items-center gap-2 mb-4">
                                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                AI Executive Summary
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {sections.map((section, si) => {
                                    const config = sectionConfig[section.title] || { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>, color: 'text-muted-foreground', borderColor: 'border-border', bgColor: '' };
                                    return (
                                        <div key={si} className={`bg-muted/50 rounded-lg p-3 border ${config.borderColor}`}>
                                            <h4 className={`text-xs font-bold ${config.color} uppercase tracking-wider flex items-center gap-1.5 mb-2.5 pb-1.5 border-b ${config.borderColor}`}>
                                                <span className="flex-shrink-0">{config.icon}</span>
                                                {section.title}
                                            </h4>
                                            <div className="space-y-1.5">
                                                {section.lines.map((line, li) => {
                                                    const isListItem = line.startsWith('-') || line.startsWith('*');
                                                    const cleanLine = line
                                                        .replace(/^\*?\*?[\-\*]\s+/, '')
                                                        .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-bold">$1</strong>');
                                                    return (
                                                        <div key={li} className={`flex gap-2 items-start ${!isListItem ? 'ml-3' : ''}`}>
                                                            {isListItem && <span className={`${config.color} mt-[5px] flex-shrink-0 text-[8px]`}>●</span>}
                                                            <span dangerouslySetInnerHTML={{ __html: cleanLine }} className="text-[12px] text-foreground/70 leading-relaxed" />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-4 pt-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
                                <span className="flex items-center gap-1">Powered by <strong>Gemini 2.5 Flash</strong></span>
                                <span>AI can make mistakes. Verify important data.</span>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div >
    );
}

