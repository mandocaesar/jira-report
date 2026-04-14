'use client';

import { useState, useEffect, useCallback } from 'react';
import { SprintSummary, SprintReportData } from '@/types';

interface UseAiSummaryOptions {
    summary: SprintSummary;
    reportData?: SprintReportData | null;
    onGenerate?: (summary: string) => void;
}

interface UseAiSummaryResult {
    epicBreakdowns: any[];
    aiSummary: string | null;
    isGeneratingAI: boolean;
    aiError: string | null;
    generateAiSummary: () => void;
}

export function useAiSummary({ summary, reportData, onGenerate }: UseAiSummaryOptions): UseAiSummaryResult {
    const { sprint } = summary;
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [epicBreakdowns, setEpicBreakdowns] = useState<any[]>([]);

    // Fetch epic breakdowns
    useEffect(() => {
        if (sprint.originBoardId) {
            fetch(`/api/epic-breakdown?sprintId=${sprint.id}&boardId=${sprint.originBoardId}`)
                .then(res => res.json())
                .then(data => {
                    setEpicBreakdowns(data.data || []);
                })
                .catch(console.error);
        }
    }, [sprint.id, sprint.originBoardId]);

    const generateAiSummary = useCallback(async () => {
        setIsGeneratingAI(true);
        setAiError(null);
        try {
            const response = await fetch('/api/ai-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    summary,
                    reportData,
                    epicBreakdowns
                })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate summary');
            }

            setAiSummary(data.summary);
            onGenerate?.(data.summary);
        } catch (err) {
            setAiError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsGeneratingAI(false);
        }
    }, [summary, reportData, epicBreakdowns, onGenerate]);

    // Auto-trigger AI summary when epic breakdowns are loaded
    useEffect(() => {
        if (epicBreakdowns.length > 0 && !aiSummary && !isGeneratingAI && !aiError) {
            generateAiSummary();
        }
    }, [epicBreakdowns, aiSummary, isGeneratingAI, aiError, generateAiSummary]);

    return { epicBreakdowns, aiSummary, isGeneratingAI, aiError, generateAiSummary };
}
