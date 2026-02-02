'use client';

import { useState, useEffect } from 'react';

interface EpicIssue {
    key: string;
    summary: string;
    issueType: string;
    storyPoints: number;
    assignee: string | null;
}

interface EpicBreakdown {
    epicKey: string;
    epicName: string;
    issues: {
        Product: EpicIssue[];
        'Technical Initiatives': EpicIssue[];
        Incident: EpicIssue[];
    };
    totalPoints: {
        Product: number;
        'Technical Initiatives': number;
        Incident: number;
    };
}

interface EpicBreakdownProps {
    boardId: number;
    sprintId: number;
}

export function EpicBreakdownComponent({ boardId, sprintId }: EpicBreakdownProps) {
    const [epicBreakdowns, setEpicBreakdowns] = useState<EpicBreakdown[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());

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

    if (loading) {
        return (
            <div className="epic-breakdown loading">
                <div className="loading-spinner"></div>
                <p>Loading epic breakdown...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="epic-breakdown error">
                <p>Error: {error}</p>
            </div>
        );
    }

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'Product': return 'var(--color-story)';
            case 'Technical Initiatives': return 'var(--color-tech)';
            case 'Incident': return 'var(--color-incident)';
            default: return 'var(--color-other)';
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'Product': return '📦';
            case 'Technical Initiatives': return '⚙️';
            case 'Incident': return '🐛';
            default: return '📋';
        }
    };

    return (
        <div className="epic-breakdown">
            <h2 className="section-title">📦 Epic Breakdown by Product</h2>

            <div className="epic-list">
                {epicBreakdowns.map((epic) => {
                    const isExpanded = expandedEpics.has(epic.epicKey);
                    const totalPoints = Object.values(epic.totalPoints).reduce((a, b) => a + b, 0);
                    const categories: Array<'Product' | 'Technical Initiatives' | 'Incident'> =
                        ['Product', 'Technical Initiatives', 'Incident'];

                    return (
                        <div key={epic.epicKey} className="epic-card">
                            <div
                                className="epic-header"
                                onClick={() => toggleEpic(epic.epicKey)}
                            >
                                <div className="epic-info">
                                    <span className="epic-key">{epic.epicKey}</span>
                                    <span className="epic-name">{epic.epicName}</span>
                                </div>
                                <div className="epic-stats">
                                    {categories.map(cat => (
                                        epic.totalPoints[cat] > 0 && (
                                            <span
                                                key={cat}
                                                className="category-badge"
                                                style={{ backgroundColor: getCategoryColor(cat) }}
                                            >
                                                {getCategoryIcon(cat)} {epic.totalPoints[cat]} pts
                                            </span>
                                        )
                                    ))}
                                    <span className="total-points">
                                        Total: {totalPoints} pts
                                    </span>
                                    <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                                        ▼
                                    </span>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="epic-details">
                                    {categories.map(category => {
                                        const issues = epic.issues[category];
                                        if (issues.length === 0) return null;

                                        return (
                                            <div key={category} className="category-section">
                                                <h4
                                                    className="category-title"
                                                    style={{ borderLeftColor: getCategoryColor(category) }}
                                                >
                                                    {getCategoryIcon(category)} {category} ({epic.totalPoints[category]} pts)
                                                </h4>
                                                <div className="issue-list">
                                                    {issues.map(issue => (
                                                        <div key={issue.key} className="issue-row">
                                                            <a
                                                                href={`https://bank-sinarmas.atlassian.net/browse/${issue.key}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="issue-key"
                                                            >
                                                                {issue.key}
                                                            </a>
                                                            <span className="issue-summary">{issue.summary}</span>
                                                            <span className="issue-type-badge">{issue.issueType}</span>
                                                            <span className="issue-points">{issue.storyPoints || '-'}</span>
                                                            <span className="issue-assignee">
                                                                {issue.assignee || 'Unassigned'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <style jsx>{`
                .epic-breakdown {
                    margin-top: 2rem;
                }
                
                .section-title {
                    font-size: 1.5rem;
                    margin-bottom: 1rem;
                    color: var(--text-primary);
                }
                
                .epic-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                
                .epic-card {
                    background: var(--card-bg);
                    border-radius: 12px;
                    overflow: hidden;
                    border: 1px solid var(--border-color);
                }
                
                .epic-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.25rem;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                
                .epic-header:hover {
                    background: var(--hover-bg);
                }
                
                .epic-info {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    flex: 1;
                    min-width: 0;
                }
                
                .epic-key {
                    font-family: monospace;
                    font-size: 0.85rem;
                    color: var(--accent-color);
                    background: rgba(99, 102, 241, 0.1);
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    flex-shrink: 0;
                }
                
                .epic-name {
                    font-weight: 500;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .epic-stats {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-shrink: 0;
                }
                
                .category-badge {
                    font-size: 0.75rem;
                    padding: 0.25rem 0.5rem;
                    border-radius: 12px;
                    color: white;
                    font-weight: 500;
                }
                
                .total-points {
                    font-weight: 600;
                    color: var(--text-secondary);
                    margin-left: 0.5rem;
                }
                
                .expand-icon {
                    transition: transform 0.2s;
                    color: var(--text-secondary);
                }
                
                .expand-icon.expanded {
                    transform: rotate(180deg);
                }
                
                .epic-details {
                    padding: 0 1.25rem 1rem;
                    border-top: 1px solid var(--border-color);
                }
                
                .category-section {
                    margin-top: 1rem;
                }
                
                .category-title {
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                    border-left: 3px solid;
                    padding-left: 0.5rem;
                    margin-bottom: 0.5rem;
                }
                
                .issue-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.35rem;
                }
                
                .issue-row {
                    display: grid;
                    grid-template-columns: 100px 1fr auto 50px 120px;
                    gap: 0.75rem;
                    align-items: center;
                    padding: 0.5rem;
                    background: var(--row-bg);
                    border-radius: 6px;
                    font-size: 0.85rem;
                }
                
                .issue-key {
                    font-family: monospace;
                    color: var(--link-color);
                    text-decoration: none;
                }
                
                .issue-key:hover {
                    text-decoration: underline;
                }
                
                .issue-summary {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    color: var(--text-primary);
                }
                
                .issue-type-badge {
                    font-size: 0.7rem;
                    padding: 0.15rem 0.4rem;
                    background: var(--badge-bg);
                    border-radius: 4px;
                    color: var(--text-secondary);
                }
                
                .issue-points {
                    text-align: right;
                    font-weight: 500;
                    color: var(--accent-color);
                }
                
                .issue-assignee {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .loading, .error {
                    text-align: center;
                    padding: 2rem;
                    color: var(--text-secondary);
                }
                
                .loading-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid var(--border-color);
                    border-top-color: var(--accent-color);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 1rem;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
