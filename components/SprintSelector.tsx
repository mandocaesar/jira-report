'use client';

import { Sprint } from '@/types';
import { useState, useEffect, useRef } from 'react';

interface SprintSelectorProps {
    onSprintChange: (sprintId: number | null) => void;
    selectedSprintId: number | null;
    boardId: number | null;
    allowAllSprints?: boolean;
}

interface SprintGroup {
    label: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    borderColor: string;
    sprints: Sprint[];
}

export default function SprintSelector({ onSprintChange, selectedSprintId, boardId, allowAllSprints = false }: SprintSelectorProps) {
    const [sprints, setSprints] = useState<Sprint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (boardId) {
            fetchSprints();
        } else {
            setSprints([]);
            setLoading(false);
        }
    }, [boardId]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchSprints = async () => {
        if (!boardId) return;

        try {
            setLoading(true);
            const url = `/api/sprints?boardId=${boardId}`;
            const response = await fetch(url);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            setSprints(data.data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load sprints');
        } finally {
            setLoading(false);
        }
    };

    const formatDateRange = (sprint: Sprint) => {
        const start = new Date(sprint.startDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
        const end = new Date(sprint.endDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
        return `${start} – ${end}`;
    };

    const selectedSprint = sprints.find(s => s.id === selectedSprintId);

    // Group sprints by state
    const groups: SprintGroup[] = [];

    const activeSprints = sprints.filter(s => s.state === 'active');
    const futureSprints = sprints
        .filter(s => s.state === 'future')
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const pastSprints = sprints
        .filter(s => s.state === 'closed')
        .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());

    if (activeSprints.length > 0) {
        groups.push({
            label: 'Active Sprint',
            icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6" /></svg>,
            color: 'text-green-400',
            bgColor: 'bg-green-500/10',
            borderColor: 'border-green-500/30',
            sprints: activeSprints,
        });
    }
    if (futureSprints.length > 0) {
        groups.push({
            label: 'Future Sprints',
            icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 5l7 7-7 7" /></svg>,
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/30',
            sprints: futureSprints,
        });
    }
    if (pastSprints.length > 0) {
        groups.push({
            label: 'Past Sprints',
            icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" /></svg>,
            color: 'text-muted-foreground',
            bgColor: 'bg-gray-500/10',
            borderColor: 'border-gray-500/30',
            sprints: pastSprints,
        });
    }

    const handleSelect = (sprintId: number | null) => {
        onSprintChange(sprintId);
        setIsOpen(false);
    };

    if (loading) {
        return (
            <div className="animate-pulse">
                <div className="h-12 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 rounded-xl"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-sm">⚠️ {error}</p>
            </div>
        );
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => !boardId ? undefined : setIsOpen(!isOpen)}
                disabled={!boardId}
                className={`w-full px-5 py-3 bg-muted
                   border border-border rounded-xl text-foreground text-left
                   transition-all duration-300
                   focus:outline-none focus:ring-2 focus:ring-blue-500/40
                   font-medium
                   flex items-center justify-between
                   ${boardId ? 'hover:border-blue-500/60 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            >
                <span className={selectedSprintId === null && allowAllSprints ? 'text-foreground font-bold' : selectedSprint ? 'text-foreground' : 'text-muted-foreground'}>
                    {!boardId
                        ? '— Select a board first —'
                        : selectedSprintId === null
                            ? (allowAllSprints ? '🌍 All Sprints (YTD)' : '— Select a sprint —')
                            : selectedSprint
                                ? `${selectedSprint.name} — ${formatDateRange(selectedSprint)}`
                                : '— Select a sprint —'}
                </span>
                <svg
                    className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-background border border-border
                    rounded-xl backdrop-blur-xl shadow-xl
                    max-h-80 overflow-y-auto
                    animate-in fade-in slide-in-from-top-2 duration-200">
                    {groups.length === 0 ? (
                        <div className="px-5 py-4 text-muted-foreground text-sm text-center">
                            No sprints available
                        </div>
                    ) : (
                        <>
                            {/* All Sprints Option */}
                            {allowAllSprints && (
                                <div className="pt-2 pb-1">
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(null)}
                                        className={`w-full px-4 py-2.5 flex items-center justify-between text-left
                                            transition-all duration-150 cursor-pointer
                                            ${selectedSprintId === null
                                                ? 'bg-blue-500/10 border-l-2 border-blue-500'
                                                : 'border-l-2 border-transparent hover:bg-muted'
                                            }`}
                                    >
                                        <span className={`text-sm font-medium ${selectedSprintId === null ? 'text-blue-400' : 'text-foreground'}`}>
                                            🌍 All Sprints (YTD)
                                        </span>
                                    </button>
                                </div>
                            )}

                            {groups.map((group, groupIndex) => (
                                <div key={group.label}>
                                    {/* Group separator */}
                                    {groupIndex > 0 && (
                                        <div className="mx-3 border-t border-border"></div>
                                    )}

                                    {/* Group Header */}
                                    <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 sticky top-0 bg-background backdrop-blur-xl">
                                        <span className={`flex-shrink-0 ${group.color}`}>{group.icon}</span>
                                        <span className={`text-[11px] font-bold uppercase tracking-wider ${group.color}`}>
                                            {group.label}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground ml-auto">
                                            {group.sprints.length}
                                        </span>
                                    </div>

                                    {/* Sprint Items */}
                                    {group.sprints.map((sprint) => {
                                        const isSelected = sprint.id === selectedSprintId;
                                        return (
                                            <button
                                                key={sprint.id}
                                                type="button"
                                                onClick={() => handleSelect(sprint.id)}
                                                className={`w-full px-4 py-2.5 flex items-center justify-between text-left
                                                transition-all duration-150 cursor-pointer
                                                ${isSelected
                                                        ? 'bg-blue-500/10 border-l-2 border-blue-500'
                                                        : 'border-l-2 border-transparent hover:bg-muted'
                                                    }`}
                                            >
                                                <span className={`text-sm font-medium ${isSelected ? 'text-blue-400' : 'text-foreground'}`}>
                                                    {sprint.name}
                                                </span>
                                                <span className="text-xs text-muted-foreground ml-4 whitespace-nowrap">
                                                    {formatDateRange(sprint)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
