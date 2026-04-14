'use client';

import React from 'react';
import Image from 'next/image';
import { UserUtilization, UserIssue } from '@/types';

interface EngineerDetailModalProps {
    utilization: UserUtilization;
    jiraDomain: string;
    onClose: () => void;
}

const categoryConfig: Record<string, { dot: string; bg: string; text: string }> = {
    'Product': { dot: 'bg-green-400', bg: 'bg-green-500/10', text: 'text-green-400' },
    'Technical Initiatives': { dot: 'bg-blue-400', bg: 'bg-blue-500/10', text: 'text-blue-400' },
    'Incident': { dot: 'bg-red-400', bg: 'bg-red-500/10', text: 'text-red-400' },
};

const statusCategoryColors: Record<string, string> = {
    'Done': 'text-green-400 bg-green-500/10 ring-green-500/20',
    'In Progress': 'text-blue-400 bg-blue-500/10 ring-blue-500/20',
    'To Do': 'text-muted-foreground bg-muted/50 ring-border',
};

export default function EngineerDetailModal({ utilization, jiraDomain, onClose }: EngineerDetailModalProps) {
    const { user, storyPoints, availableDays, utilizationPercent, role, title, issues = [] } = utilization;
    const effectiveMandays = utilization.effectiveMandays;

    const initials = user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    // Group issues by parent
    const groupedByParent = new Map<string, { parentKey: string; parentSummary: string; issues: UserIssue[] }>();
    const standalone: UserIssue[] = [];

    for (const issue of issues) {
        if (issue.parentKey) {
            const key = issue.parentKey;
            if (!groupedByParent.has(key)) {
                groupedByParent.set(key, {
                    parentKey: key,
                    parentSummary: issue.parentSummary || key,
                    issues: [],
                });
            }
            groupedByParent.get(key)!.issues.push(issue);
        } else {
            standalone.push(issue);
        }
    }

    const jiraUrl = (key: string) => `https://${jiraDomain}/browse/${key}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-2xl max-h-[85vh] bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted ring-1 ring-border shrink-0">
                        {user.avatarUrl ? (
                            <Image src={user.avatarUrl} alt={user.displayName} width={40} height={40} className="object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-semibold text-sm">
                                {initials}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-semibold text-foreground text-base truncate">{user.displayName}</h2>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="uppercase font-semibold text-blue-400">{role}</span>
                            {title && <span>{title}</span>}
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-foreground tabular-nums">{storyPoints} pts</div>
                        <div className="text-xs text-muted-foreground">
                            {effectiveMandays != null ? effectiveMandays.toFixed(1) : availableDays} avail · {utilizationPercent.toFixed(1)}%
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-2 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Issue List */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
                    {issues.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">No issues assigned in this sprint</div>
                    ) : (
                        <>
                            {/* Summary bar */}
                            <div className="flex items-center gap-3 text-xs flex-wrap">
                                <span className="text-muted-foreground">{issues.length} issues</span>
                                {issues.filter(i => i.addedDuringSprint).length > 0 && (
                                    <span className="inline-flex items-center gap-1 text-amber-400">
                                        <span className="font-bold">{issues.filter(i => i.addedDuringSprint).length}</span> added mid-sprint
                                    </span>
                                )}
                                {Object.entries(
                                    issues.reduce((acc, i) => {
                                        acc[i.category] = (acc[i.category] || 0) + i.points;
                                        return acc;
                                    }, {} as Record<string, number>)
                                ).map(([cat, pts]) => {
                                    const cfg = categoryConfig[cat] || categoryConfig['Product'];
                                    return (
                                        <span key={cat} className={`inline-flex items-center gap-1 ${cfg.text}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                            {cat} <span className="font-bold">{pts}</span>
                                        </span>
                                    );
                                })}
                            </div>

                            {/* Grouped by parent */}
                            {Array.from(groupedByParent.values()).map(group => (
                                <div key={group.parentKey} className="space-y-1">
                                    <a
                                        href={jiraUrl(group.parentKey)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                    >
                                        <span className="font-mono text-[10px] text-purple-400">{group.parentKey}</span>
                                        <span className="truncate">{group.parentSummary}</span>
                                    </a>
                                    <div className="space-y-0.5 pl-3 border-l-2 border-border">
                                        {group.issues.map(issue => (
                                            <IssueRow key={issue.key} issue={issue} jiraUrl={jiraUrl} />
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {/* Standalone issues */}
                            {standalone.length > 0 && (
                                <div className="space-y-0.5">
                                    {groupedByParent.size > 0 && (
                                        <div className="text-xs font-medium text-muted-foreground py-1">Standalone</div>
                                    )}
                                    {standalone.map(issue => (
                                        <IssueRow key={issue.key} issue={issue} jiraUrl={jiraUrl} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function IssueRow({ issue, jiraUrl }: { issue: UserIssue; jiraUrl: (key: string) => string }) {
    const catCfg = categoryConfig[issue.category] || categoryConfig['Product'];
    const statusCfg = statusCategoryColors[issue.statusCategory] || statusCategoryColors['To Do'];

    return (
        <a
            href={jiraUrl(issue.key)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
        >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${catCfg.dot}`} />
            <span className="font-mono text-[10px] text-purple-400 shrink-0 group-hover:underline">{issue.key}</span>
            {issue.addedDuringSprint && (
                <span className="text-[8px] font-bold uppercase px-1 py-px rounded bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20 shrink-0" title="Added after sprint started">
                    +{issue.addedDaysAfterStart || '?'}d
                </span>
            )}
            <span className="text-xs text-foreground truncate flex-1">{issue.summary}</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ring-1 shrink-0 ${statusCfg}`}>
                {issue.status}
            </span>
            <span className="text-xs font-bold text-foreground tabular-nums shrink-0 w-8 text-right">{issue.points}</span>
        </a>
    );
}
