'use client';

import { Sprint } from '@/types';
import { useState, useEffect } from 'react';

interface SprintSelectorProps {
    onSprintChange: (sprintId: number | null) => void;
    selectedSprintId: number | null;
    boardId: number | null;
}

export default function SprintSelector({ onSprintChange, selectedSprintId, boardId }: SprintSelectorProps) {
    const [sprints, setSprints] = useState<Sprint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (boardId) {
            fetchSprints();
        } else {
            setSprints([]);
            setLoading(false);
        }
    }, [boardId]);

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
        return `${start} - ${end}`;
    };

    if (loading) {
        return (
            <div className="animate-pulse">
                <div className="h-12 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl"></div>
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
        <div className="relative">
            <select
                value={selectedSprintId || ''}
                onChange={(e) => onSprintChange(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-5 py-3 bg-gradient-to-br from-gray-800/50 to-gray-900/50 
                   border border-purple-500/30 rounded-xl text-white
                   hover:border-purple-500/50 transition-all duration-300
                   focus:outline-none focus:ring-2 focus:ring-purple-500/50
                   backdrop-blur-sm cursor-pointer
                   appearance-none font-medium"
            >
                <option value="" className="bg-gray-900">
                    Select a sprint...
                </option>
                {sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id} className="bg-gray-900">
                        {sprint.name} {sprint.state === 'active' && '🟢'} - {formatDateRange(sprint)}
                    </option>
                ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
}
