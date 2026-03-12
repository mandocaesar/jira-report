'use client';

import { useState, useEffect } from 'react';

interface EpicIssue {
    key: string;
    summary: string;
    issueType: string;
    storyPoints: number;
    assignee: string | null;
    status: string;
    statusCategory: string;
}

interface StoryGroup {
    key: string;
    summary: string;
    issues: EpicIssue[];
    totalPoints: number;
    completedPoints: number;
}

interface EpicBreakdown {
    epicKey: string;
    epicName: string;
    stories: StoryGroup[];
    totalPoints: number;
    completedPoints: number;
    completionPercent: number;
}

interface EpicBreakdownProps {
    boardId: number;
    sprintId: number;
    jiraDomain?: string;
}

const statusColors: Record<string, { bg: string; border: string; text: string; bar: string }> = {
    'Done': {
        bg: 'from-green-500/10 to-emerald-500/10',
        border: 'border-green-500/20',
        text: 'text-green-400',
        bar: 'from-green-500 to-emerald-500',
    },
    'In Progress': {
        bg: 'from-blue-500/10 to-cyan-500/10',
        border: 'border-blue-500/20',
        text: 'text-blue-400',
        bar: 'from-blue-500 to-cyan-500',
    },
    'To Do': {
        bg: 'from-gray-500/10 to-slate-500/10',
        border: 'border-gray-500/20',
        text: 'text-gray-400',
        bar: 'from-gray-500 to-slate-500',
    },
};

const defaultColors = {
    bg: 'from-blue-500/10 to-indigo-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    bar: 'from-blue-500 to-indigo-500',
};

function getStatusColors(category: string) {
    return statusColors[category] || defaultColors;
}

function getCompletionBarColor(percent: number): string {
    if (percent >= 90) return 'from-green-500 to-emerald-500';
    if (percent >= 70) return 'from-blue-500 to-cyan-500';
    if (percent >= 50) return 'from-yellow-500 to-amber-500';
    return 'from-red-500 to-orange-500';
}

function getCompletionTextColor(percent: number): string {
    if (percent >= 90) return 'text-green-400';
    if (percent >= 70) return 'text-blue-400';
    if (percent >= 50) return 'text-yellow-400';
    return 'text-red-400';
}

export function EpicBreakdownComponent({ boardId, sprintId, jiraDomain = 'bank-sinarmas.atlassian.net' }: EpicBreakdownProps) {
    const [epicBreakdowns, setEpicBreakdowns] = useState<EpicBreakdown[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
    const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/epic-breakdown?boardId=${boardId}&sprintId=${sprintId}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch epic breakdown');
                }
                const data = await response.json();
                setEpicBreakdowns(data.epicBreakdowns || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        }

        if (boardId && sprintId) {
            fetchData();
        }
    }, [boardId, sprintId]);

    const toggleEpic = (epicKey: string) => {
        setExpandedEpics(prev => {
            const newSet = new Set(prev);
            if (newSet.has(epicKey)) {
                newSet.delete(epicKey);
            } else {
                newSet.add(epicKey);
            }
            return newSet;
        });
    };

    const toggleStory = (storyKey: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedStories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(storyKey)) {
                newSet.delete(storyKey);
            } else {
                newSet.add(storyKey);
            }
            return newSet;
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 mt-8 space-y-4 text-gray-400 bg-gray-800/20 rounded-xl border border-gray-700/20 animate-pulse">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                <p>Analyzing epics and calculating metrics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 mt-8 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 font-medium">⚠️ Error: {error}</p>
            </div>
        );
    }

    if (epicBreakdowns.length === 0) {
        return null;
    }

    return (
        <div className="mt-8 space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-foreground rounded-xl flex items-center justify-center">
                    <span className="text-xl">📦</span>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-foreground tracking-tight">Epic Breakdown</h2>
                    <p className="text-sm text-muted-foreground font-medium">Grouped by Epic and Parent Story</p>
                </div>
            </div>

            <div className="space-y-4">
                {epicBreakdowns.map((epic) => {
                    const isExpanded = expandedEpics.has(epic.epicKey);
                    // Filter out epics with zero points to minimize noise
                    if (epic.totalPoints === 0) return null;

                    return (
                        <div key={epic.epicKey} className="bg-gray-800/30 border border-gray-700/50 rounded-xl overflow-hidden shadow-sm hover:border-gray-600/50 transition-all duration-200">
                            {/* Epic Header */}
                            <div
                                className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-gray-700/20 transition-colors"
                                onClick={() => toggleEpic(epic.epicKey)}
                            >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded text-xs font-mono font-medium shrink-0">
                                        {epic.epicKey}
                                    </div>
                                    <span className="font-semibold text-gray-200 truncate" title={epic.epicName}>
                                        {epic.epicName}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                                    {/* Completion Meta */}
                                    <div className="flex flex-col items-end gap-0.5">
                                        <div className="flex items-center gap-2 text-xs font-medium">
                                            <span className="text-gray-400">{epic.completedPoints} / {epic.totalPoints} pts</span>
                                            <span className={getCompletionTextColor(epic.completionPercent)}>
                                                {epic.completionPercent.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="w-24 h-1 bg-gray-700/50 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full bg-gradient-to-r ${getCompletionBarColor(epic.completionPercent)} transition-all duration-1000`}
                                                style={{ width: `${Math.min(epic.completionPercent, 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className={`text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                        ▼
                                    </div>
                                </div>
                            </div>

                            {/* Epic Details (Stories) */}
                            {isExpanded && (
                                <div className="bg-gray-900/50 border-t border-gray-700/50">
                                    {epic.stories.map((story, storyIndex) => {
                                        const isStoryExpanded = expandedStories.has(story.key);
                                        const storyPercent = story.totalPoints > 0 ? (story.completedPoints / story.totalPoints) * 100 : 0;
                                        const isStandalone = story.key === 'Standalone';

                                        return (
                                            <div key={story.key} className={`${storyIndex > 0 ? 'border-t border-gray-800' : ''}`}>
                                                {/* Story Header */}
                                                <div
                                                    className="px-4 py-2 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-800/40 transition-colors group"
                                                    onClick={(e) => toggleStory(story.key, e)}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0 flex-1 pl-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${isStandalone ? 'bg-gray-500' : 'bg-blue-500'}`}></div>
                                                        {!isStandalone && (
                                                            <a
                                                                href={`https://${jiraDomain}/browse/${story.key}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-xs font-mono text-blue-400 hover:underline shrink-0"
                                                            >
                                                                {story.key}
                                                            </a>
                                                        )}
                                                        <span className="text-xs font-medium text-gray-300 truncate" title={story.summary}>
                                                            {story.summary}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                                                            {story.issues.length} {story.issues.length === 1 ? 'task' : 'tasks'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span className="text-xs font-medium text-gray-400">
                                                            <span className={story.completedPoints === story.totalPoints ? 'text-green-400' : ''}>{story.completedPoints}</span>
                                                            {' '}/ {story.totalPoints} pts
                                                        </span>
                                                        <svg
                                                            className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${isStoryExpanded ? 'rotate-180' : ''} group-hover:text-gray-400`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>
                                                </div>

                                                {/* Sub-tasks */}
                                                {isStoryExpanded && (
                                                    <div className="px-6 py-1 bg-gray-900/80 border-t border-gray-800/50 shadow-inner">
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-xs">
                                                                <tbody>
                                                                    {story.issues.map(issue => {
                                                                        const colors = getStatusColors(issue.statusCategory);
                                                                        return (
                                                                            <tr key={issue.key} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30">
                                                                                <td className="py-1.5 pr-3 pl-4 w-20">
                                                                                    <a
                                                                                        href={`https://${jiraDomain}/browse/${issue.key}`}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="text-xs font-mono text-gray-400 hover:text-blue-400 hover:underline transition-colors"
                                                                                    >
                                                                                        {issue.key}
                                                                                    </a>
                                                                                </td>
                                                                                <td className="py-1.5 pr-3 pl-4 flex-1">
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 rounded px-1 whitespace-nowrap">
                                                                                            {issue.issueType}
                                                                                        </span>
                                                                                        <span className="text-xs text-gray-300 truncate max-w-sm">
                                                                                            {issue.summary}
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="py-1.5 pr-3 w-24 text-center">
                                                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border bg-gradient-to-r ${colors.bg} ${colors.text} ${colors.border} whitespace-nowrap`}>
                                                                                        {issue.status}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="py-1.5 pr-3 w-16 text-right font-medium text-gray-300">
                                                                                    {issue.storyPoints || '-'}
                                                                                </td>
                                                                                <td className="py-1.5 px-2 w-28 text-right">
                                                                                    <span className="text-[10px] text-gray-500 truncate inline-block max-w-[100px]">
                                                                                        {issue.assignee || 'Unassigned'}
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
