'use client';

import { Board } from '@/types';
import { useState, useEffect } from 'react';

interface BoardSelectorProps {
    onBoardChange: (boardId: number | null) => void;
    selectedBoardId: number | null;
}

export default function BoardSelector({ onBoardChange, selectedBoardId }: BoardSelectorProps) {
    const [boards, setBoards] = useState<Board[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchBoards();
    }, []);

    const fetchBoards = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/boards');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            setBoards(data.data);

            // Auto-select first board if none selected
            if (data.data.length > 0 && !selectedBoardId) {
                onBoardChange(data.data[0].id);
            }

            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load boards');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="animate-pulse">
                <div className="h-12 bg-gradient-to-r from-blue-500/20 to-blue-500/20 rounded-xl"></div>
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

    // Don't show selector if only one board
    if (boards.length <= 1) {
        return null;
    }

    return (
        <div className="relative">
            <select
                value={selectedBoardId || ''}
                onChange={(e) => onBoardChange(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-5 py-3 bg-gradient-to-br from-blue-800/50 to-blue-900/50 
                   border border-blue-500/30 rounded-xl text-white
                   hover:border-blue-500/50 transition-all duration-300
                   focus:outline-none focus:ring-2 focus:ring-blue-500/50
                   backdrop-blur-sm cursor-pointer
                   appearance-none font-medium"
            >
                <option value="" className="bg-gray-900">
                    Select a board...
                </option>
                {boards.map((board) => (
                    <option key={board.id} value={board.id} className="bg-gray-900">
                        {board.name}
                        {board.location?.projectKey && ` (${board.location.projectKey})`}
                    </option>
                ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
}
