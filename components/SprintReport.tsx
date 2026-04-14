'use client';

import React, { useState } from 'react';
import { SprintReportData } from '@/types';
import { getStatusColors, getCompletionColor, getCompletionBarColor } from '@/lib/ui-colors';

function ScopeChangeGroup({ groupKey, group, jiraDomain }: {
    groupKey: string;
    group: { summary: string; changes: any[] };
    jiraDomain?: string;
}) {
    const [collapsed, setCollapsed] = useState(true);

    return (
        <>
            <tr
                className="border-b border-orange-500/20 cursor-pointer hover:bg-orange-500/10 transition-colors select-none"
                onClick={() => setCollapsed(!collapsed)}
            >
                <td colSpan={4} className="px-4 py-2">
                    <div className="flex items-center gap-2">
                        <svg
                            className={`w-3 h-3 text-orange-500 transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <a
                            href={jiraDomain ? `https://${jiraDomain}/browse/${groupKey}` : '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-orange-500 hover:text-orange-400 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {groupKey}
                        </a>
                        <span className="text-[10px] text-muted-foreground line-clamp-1">{group.summary}</span>
                        <span className="text-[10px] px-1.5 py-0.5 ml-auto bg-orange-500/20 rounded-md text-orange-500 font-medium shrink-0">
                            {group.changes.length} change{group.changes.length > 1 ? 's' : ''}
                        </span>
                    </div>
                </td>
            </tr>
            {!collapsed && group.changes.map((change, idx) => (
                <tr key={`${groupKey}-${idx}`} className="border-b border-orange-500/10 hover:bg-orange-500/5 transition-colors align-top">
                    <td className="px-4 py-3 pl-8">
                        <div className="flex flex-col">
                            <a
                                href={jiraDomain ? `https://${jiraDomain}/browse/${change.issueKey}` : '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-orange-500 hover:text-orange-400 transition-colors"
                            >
                                {change.issueKey}
                            </a>
                            <span className="text-[10px] text-orange-400 mt-0.5">{change.issueType}</span>
                            <span className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{change.summary}</span>
                        </div>
                    </td>
                    <td className="px-3 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${change.type === 'added'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                            {change.type === 'added' ? 'Added to Sprint' : 'Points Changed'}
                        </span>
                    </td>
                    <td className="px-3 py-3">
                        <div className="text-[10px] text-muted-foreground">
                            {new Date(change.changeDate).toLocaleString([], {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                        </div>
                    </td>
                    <td className="px-4 py-3">
                        <div className="text-xs text-foreground/70">{change.description}</div>
                        {change.type === 'points_changed' && change.oldValue !== undefined && change.newValue !== undefined && (
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-muted-foreground font-medium tabular-nums">{change.oldValue}</span>
                                <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                <span className="text-[10px] font-bold tabular-nums text-foreground">{change.newValue}</span>
                                {(() => {
                                    const delta = parseFloat(change.newValue!) - parseFloat(change.oldValue!);
                                    return (
                                        <span className={`text-[10px] font-medium tabular-nums ${delta > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                            ({delta > 0 ? '+' : ''}{delta} SP)
                                        </span>
                                    );
                                })()}
                            </div>
                        )}
                        {change.assignee && (
                            <div className="text-[10px] text-muted-foreground mt-1">Assignee: {change.assignee}</div>
                        )}
                    </td>
                </tr>
            ))}
        </>
    );
}

interface SprintReportProps {
    report: SprintReportData;
    jiraDomain?: string;
}

export default function SprintReport({ report, jiraDomain }: SprintReportProps) {
    const { totalPoints, completedPoints, completionPercent, statusGroups, memberBreakdowns, scopeChanges } = report;

    return (
        <div className="space-y-3">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {/* Total Points */}
                <div className="text-center py-2.5 px-3 bg-muted/50 rounded-lg border border-border">
                    <div className="text-2xl font-bold text-foreground leading-tight">
                        {totalPoints}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Total Points</div>
                    <div className="text-[9px] text-muted-foreground/70">(sub-tasks)</div>
                </div>

                {/* Completed */}
                <div className="text-center py-2.5 px-3 bg-muted/50 rounded-lg border border-border">
                    <div className="text-2xl font-bold text-green-400 leading-tight">
                        {completedPoints}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Completed</div>
                    <div className="text-[9px] text-green-400/70">Done</div>
                </div>

                {/* Completion % */}
                <div className="text-center py-2.5 px-3 bg-muted/50 rounded-lg border border-border">
                    <div className={`text-2xl font-bold leading-tight ${getCompletionColor(completionPercent)}`}>
                        {completionPercent.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Completion</div>
                    {/* Mini progress bar */}
                    <div className="mt-1.5 h-1 w-full bg-muted/50 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${getCompletionBarColor(completionPercent)} transition-all duration-500`}
                            style={{ width: `${Math.min(completionPercent, 100)}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Status Breakdown */}
            {statusGroups.length > 0 && (
                <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3">Status Breakdown</h3>
                    <div className="space-y-2">
                        {statusGroups.map((group) => {
                            const colors = getStatusColors(group.statusCategory);
                            const percentage = totalPoints > 0 ? (group.points / totalPoints) * 100 : 0;
                            return (
                                <div key={group.statusCategory} className="flex items-center gap-3">
                                    <div className={`w-24 text-xs font-medium ${colors.text} flex-shrink-0`}>
                                        {group.statusCategory}
                                    </div>
                                    <div className="flex-1">
                                        <div className="h-4 bg-muted/30 rounded-lg overflow-hidden relative">
                                            <div
                                                className={`h-full ${colors.bar} rounded-lg transition-all duration-700`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                            <div className="absolute inset-0 flex items-center px-2">
                                                <span className="text-[10px] font-medium text-foreground/80">
                                                    {group.points} pts ({group.count} tasks)
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-10 text-right text-xs font-bold text-foreground/70">
                                        {percentage.toFixed(0)}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Per-Member Breakdown */}
            {memberBreakdowns.length > 0 && (
                <div className="bg-muted/30 rounded-xl border border-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                        <h3 className="text-xs font-semibold text-muted-foreground">Per Team Member</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                                    <th className="px-4 py-2 text-left">Member</th>
                                    <th className="px-3 py-2 text-center">Total</th>
                                    <th className="px-3 py-2 text-center">Done</th>
                                    <th className="px-3 py-2 text-center">Completion</th>
                                    <th className="px-3 py-2 text-left">Status Breakdown</th>
                                </tr>
                            </thead>
                            <tbody>
                                {memberBreakdowns.map((member) => (
                                    <tr key={member.user.accountId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {member.user.avatarUrl ? (
                                                    <img
                                                        src={member.user.avatarUrl}
                                                        alt={member.user.displayName}
                                                        className="w-6 h-6 rounded-full ring-2 ring-border"
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full ring-2 ring-border bg-foreground flex items-center justify-center text-background font-bold text-[10px]">
                                                        {member.user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="text-xs font-medium text-foreground">{member.user.displayName}</div>
                                                    <div className="flex items-center gap-1">
                                                        <span className={`text-[9px] px-1 py-0.5 rounded ${member.role === 'qa'
                                                            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            }`}>
                                                            {member.role.toUpperCase()}
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground truncate mt-0.5 max-w-[100px]">{member.title}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className="text-xs font-bold text-foreground">{member.totalPoints}</span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <span className="text-xs font-bold text-green-400">{member.completedPoints}</span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={`text-xs font-bold ${getCompletionColor(member.completionPercent)}`}>
                                                    {member.completionPercent.toFixed(0)}%
                                                </span>
                                                <div className="w-12 h-1 bg-muted/50 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${getCompletionBarColor(member.completionPercent)} transition-all duration-500`}
                                                        style={{ width: `${Math.min(member.completionPercent, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {member.statusGroups.map((sg) => {
                                                    const colors = getStatusColors(sg.statusCategory);
                                                    return (
                                                        <span
                                                            key={sg.statusCategory}
                                                            className={`text-[10px] px-2 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}
                                                        >
                                                            {sg.statusCategory}: {sg.points}pts ({sg.count})
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Scope Changes */}
            {scopeChanges && scopeChanges.length > 0 && (
                <div className="bg-orange-500/10 rounded-xl border border-orange-500/20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-orange-500/20 bg-orange-500/5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <h3 className="text-xs font-semibold text-orange-500">Scope Changes During Sprint</h3>
                            <span className="text-[10px] bg-orange-500/20 text-orange-500 font-medium px-2 py-0.5 rounded-full border border-orange-500/30">
                                {scopeChanges.length} events
                            </span>
                            {(() => {
                                const addedCount = scopeChanges.filter(c => c.type === 'added').length;
                                const pointChanges = scopeChanges.filter(c => c.type === 'points_changed');
                                const netPointDelta = pointChanges.reduce((sum, c) => sum + (parseFloat(c.newValue || '0') - parseFloat(c.oldValue || '0')), 0);
                                return (
                                    <>
                                        {addedCount > 0 && (
                                            <span className="text-[10px] bg-red-500/15 text-red-400 font-medium px-2 py-0.5 rounded-full border border-red-500/20">
                                                +{addedCount} issues added
                                            </span>
                                        )}
                                        {pointChanges.length > 0 && (
                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${netPointDelta > 0 ? 'bg-red-500/15 text-red-400 border-red-500/20' : netPointDelta < 0 ? 'bg-green-500/15 text-green-400 border-green-500/20' : 'bg-muted/30 text-muted-foreground border-border'}`}>
                                                {netPointDelta > 0 ? '+' : ''}{netPointDelta} SP net change
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-orange-500/20 text-[10px] text-orange-500/70 uppercase tracking-wider bg-orange-500/5">
                                    <th className="px-4 py-2 font-medium">Issue</th>
                                    <th className="px-3 py-2 font-medium">Type</th>
                                    <th className="px-3 py-2 font-medium">Date</th>
                                    <th className="px-4 py-2 font-medium">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const grouped = scopeChanges.reduce((acc, change) => {
                                        const groupKey = change.parentKey || change.issueKey;
                                        const groupSummary = change.parentKey ? (change.parentSummary || 'Parent Issue') : change.summary;
                                        if (!acc[groupKey]) acc[groupKey] = { summary: groupSummary, changes: [] };
                                        acc[groupKey].changes.push(change);
                                        return acc;
                                    }, {} as Record<string, { summary: string, changes: typeof scopeChanges }>);
                                    return Object.entries(grouped).map(([groupKey, group]) => (
                                        <ScopeChangeGroup
                                            key={groupKey}
                                            groupKey={groupKey}
                                            group={group}
                                            jiraDomain={jiraDomain}
                                        />
                                    ));
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {totalPoints === 0 && (
                <div className="text-center py-8 bg-muted/20 rounded-xl border border-border">
                    <div className="w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">No sub-tasks found in this sprint</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Sprint completion is calculated from sub-tasks only</p>
                </div>
            )}
        </div>
    );
}
