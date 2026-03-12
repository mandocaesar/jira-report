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
    icon: string;
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
            icon: '🟢',
            color: 'text-green-400',
            bgColor: 'bg-green-500/10',
            borderColor: 'border-green-500/30',
            sprints: activeSprints,
        });
    }
    if (futureSprints.length > 0) {
        groups.push({
            label: 'Future Sprints',
            icon: '📅',
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/30',
            sprints: futureSprints,
        });
    }
    if (pastSprints.length > 0) {
        groups.push({
            label: 'Past Sprints',
            icon: '📁',
            color: 'text-gray-400',
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
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-5 py-3 bg-gradient-to-br from-gray-800/50 to-gray-900/50 
                   border border-blue-500/30 rounded-xl text-white text-left
                   hover:border-blue-500/50 transition-all duration-300
                   focus:outline-none focus:ring-2 focus:ring-blue-500/50
                   backdrop-blur-sm cursor-pointer font-medium
                   flex items-center justify-between"
            >
                <span className={selectedSprintId === null && allowAllSprints ? 'text-white font-bold' : selectedSprint ? 'text-white' : 'text-gray-400'}>
                    {selectedSprintId === null
                        ? (allowAllSprints ? '🌍 All Sprints (YTD)' : 'Select a sprint...')
                        : selectedSprint
                            ? `${selectedSprint.name} — ${formatDateRange(selectedSprint)}`
                            : 'Select a sprint...'}
                </span>
                <svg
                    className={`w-5 h-5 text-blue-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-gray-900/95 border border-blue-500/30 
                    rounded-xl backdrop-blur-xl shadow-2xl shadow-blue-500/10 
                    max-h-80 overflow-y-auto
                    animate-in fade-in slide-in-from-top-2 duration-200">
                    {groups.length === 0 ? (
                        <div className="px-5 py-4 text-gray-500 text-sm text-center">
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
                                                ? 'bg-blue-500/15 border-l-2 border-blue-500'
                                                : 'border-l-2 border-transparent hover:bg-gray-800/60'
                                            }`}
                                    >
                                        <span className={`text-sm font-medium ${selectedSprintId === null ? 'text-blue-300' : 'text-white'}`}>
                                            🌍 All Sprints (YTD)
                                        </span>
                                    </button>
                                </div>
                            )}

                            {groups.map((group, groupIndex) => (
                                <div key={group.label}>
                                    {/* Group separator */}
                                    {groupIndex > 0 && (
                                        <div className="mx-3 border-t border-gray-700/50"></div>
                                    )}

                                    {/* Group Header */}
                                    <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 sticky top-0 bg-gray-900/95 backdrop-blur-xl">
                                        <span className="text-sm">{group.icon}</span>
                                        <span className={`text-[11px] font-bold uppercase tracking-wider ${group.color}`}>
                                            {group.label}
                                        </span>
                                        <span className="text-[10px] text-gray-600 ml-auto">
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
                                                        ? 'bg-blue-500/15 border-l-2 border-blue-500'
                                                        : 'border-l-2 border-transparent hover:bg-gray-800/60'
                                                    }`}
                                            >
                                                <span className={`text-sm font-medium ${isSelected ? 'text-blue-300' : 'text-white'}`}>
                                                    {sprint.name}
                                                </span>
                                                <span className="text-xs text-gray-500 ml-4 whitespace-nowrap">
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
