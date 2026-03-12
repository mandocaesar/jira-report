'use client';

import { Board } from '@/types';
import { useState, useEffect, useRef } from 'react';

interface BoardSelectorProps {
    onBoardChange: (boardId: number | null) => void;
    selectedBoardId: number | null;
}

export default function BoardSelector({ onBoardChange, selectedBoardId }: BoardSelectorProps) {
    const [boards, setBoards] = useState<Board[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchBoards();
    }, []);

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

    const fetchBoards = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/boards');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            setBoards(data.data);

            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load boards');
        } finally {
            setLoading(false);
        }
    };

    const selectedBoard = boards.find(b => b.id === selectedBoardId);

    const handleSelect = (boardId: number | null) => {
        onBoardChange(boardId);
        setIsOpen(false);
    };

    if (loading) {
        return (
            <div className="animate-pulse">
                <div className="h-12 bg-muted rounded-xl"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-sm flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    {error}
                </p>
            </div>
        );
    }

    // Don't show selector if only one board
    if (boards.length <= 1) {
        return null;
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-5 py-3 bg-muted
                   border border-border rounded-xl text-foreground text-left
                   hover:border-blue-500/60 transition-all duration-300
                   focus:outline-none focus:ring-2 focus:ring-blue-500/40
                   cursor-pointer font-medium
                   flex items-center justify-between"
            >
                <span className={selectedBoard ? 'text-foreground' : 'text-muted-foreground'}>
                    {selectedBoard
                        ? `${selectedBoard.name}${selectedBoard.location?.projectKey ? ` (${selectedBoard.location.projectKey})` : ''}`
                        : '— Select a board —'}
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

                    {/* Group Header */}
                    <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 sticky top-0 bg-background backdrop-blur-xl">
                        <span className="flex-shrink-0 text-muted-foreground">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                            </svg>
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Boards
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                            {boards.length}
                        </span>
                    </div>

                    {/* Board Items */}
                    {boards.map((board) => {
                        const isSelected = board.id === selectedBoardId;
                        return (
                            <button
                                key={board.id}
                                type="button"
                                onClick={() => handleSelect(board.id)}
                                className={`w-full px-4 py-2.5 flex items-center justify-between text-left
                                    transition-all duration-150 cursor-pointer
                                    ${isSelected
                                        ? 'bg-blue-500/10 border-l-2 border-blue-500'
                                        : 'border-l-2 border-transparent hover:bg-muted'
                                    }`}
                            >
                                <span className={`text-sm font-medium ${isSelected ? 'text-blue-400' : 'text-foreground'}`}>
                                    {board.name}
                                </span>
                                {board.location?.projectKey && (
                                    <span className="text-xs text-muted-foreground">
                                        {board.location.projectKey}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
