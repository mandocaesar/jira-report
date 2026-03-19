'use client';

import { useState, useEffect, useCallback } from 'react';

interface WorkTypeLabelData {
    id: string;
    labelName: string;
    description: string | null;
    isActive: boolean;
}

export default function WorkTypeLabelsPage() {
    const [labels, setLabels] = useState<WorkTypeLabelData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // New label form
    const [showNew, setShowNew] = useState(false);
    const [newLabelName, setNewLabelName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [saving, setSaving] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabelName, setEditLabelName] = useState('');
    const [editDescription, setEditDescription] = useState('');

    const fetchLabels = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/settings/work-type-labels');
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setLabels(result.data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load labels');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLabels(); }, [fetchLabels]);

    const handleCreate = async () => {
        try {
            setSaving(true);
            setError(null);
            const res = await fetch('/api/settings/work-type-labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labelName: newLabelName, description: newDescription || null }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setLabels(prev => [...prev, result.data].sort((a, b) => a.labelName.localeCompare(b.labelName)));
            setShowNew(false);
            setNewLabelName('');
            setNewDescription('');
            setSuccess('Label created');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (id: string) => {
        try {
            setError(null);
            const res = await fetch('/api/settings/work-type-labels', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, labelName: editLabelName, description: editDescription || null }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setLabels(prev => prev.map(l => l.id === id ? result.data : l));
            setEditingId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update');
        }
    };

    const handleToggle = async (label: WorkTypeLabelData) => {
        try {
            const res = await fetch('/api/settings/work-type-labels', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: label.id, isActive: !label.isActive }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setLabels(prev => prev.map(l => l.id === label.id ? { ...l, isActive: !l.isActive } : l));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this label?')) return;
        try {
            const res = await fetch(`/api/settings/work-type-labels?id=${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setLabels(prev => prev.filter(l => l.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    const startEdit = (l: WorkTypeLabelData) => {
        setEditingId(l.id);
        setEditLabelName(l.labelName);
        setEditDescription(l.description || '');
    };

    const activeCount = labels.filter(l => l.isActive).length;

    return (
        <div className="min-h-screen overflow-x-hidden">
            <header className="border-b border-border bg-background/50 backdrop-blur-xl">
                <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-foreground rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-background" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                <path d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M6 6h.008v.008H6V6z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">Work Type Labels</h1>
                            <p className="text-muted-foreground text-sm">Map Jira labels to work type categories for reporting</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-3xl mx-auto space-y-6">
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                        {error}
                        <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200">×</button>
                    </div>
                )}
                {success && (
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">
                        ✓ {success}
                    </div>
                )}

                {/* Info */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 text-sm">
                    Define Jira labels that map to work type categories. Issues with matching labels will be categorized accordingly in reports. Issues without matching labels are grouped as &quot;Other&quot;.
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        {labels.length} labels • <span className="text-green-400">{activeCount} active</span>
                    </div>
                    <button
                        onClick={() => setShowNew(true)}
                        className="px-3 py-1.5 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
                    >
                        + Add Label
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="bg-muted/30 border border-border rounded-2xl overflow-hidden">
                        {/* New label form */}
                        {showNew && (
                            <div className="p-6 border-b border-border bg-muted/10 space-y-3">
                                <input
                                    type="text"
                                    placeholder="Jira label name (exact match)"
                                    value={newLabelName}
                                    onChange={(e) => setNewLabelName(e.target.value)}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                />
                                <input
                                    type="text"
                                    placeholder="Description (optional)"
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                />
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={!newLabelName || saving}
                                        className="px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                                    >
                                        {saving ? 'Creating…' : 'Create'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Labels list */}
                        <div className="divide-y divide-border">
                            {labels.map((l) => (
                                <div key={l.id} className={`px-6 py-4 hover:bg-muted/20 transition-colors ${!l.isActive ? 'opacity-50' : ''}`}>
                                    {editingId === l.id ? (
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                value={editLabelName}
                                                onChange={(e) => setEditLabelName(e.target.value)}
                                                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                            />
                                            <input
                                                type="text"
                                                value={editDescription}
                                                onChange={(e) => setEditDescription(e.target.value)}
                                                placeholder="Description (optional)"
                                                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                            />
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                                <button onClick={() => handleUpdate(l.id)} className="px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90">Save</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2 py-0.5 text-xs font-mono bg-muted border border-border rounded text-foreground">{l.labelName}</span>
                                                </div>
                                                {l.description && (
                                                    <p className="text-xs text-muted-foreground mt-1">{l.description}</p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 ml-4">
                                                <button
                                                    onClick={() => handleToggle(l)}
                                                    className={`relative w-9 h-5 rounded-full transition-colors ${l.isActive ? 'bg-green-500' : 'bg-muted'}`}
                                                    title={l.isActive ? 'Active' : 'Inactive'}
                                                >
                                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${l.isActive ? 'translate-x-4' : ''}`} />
                                                </button>
                                                <button
                                                    onClick={() => startEdit(l)}
                                                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                                                    title="Edit"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                                        <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(l.id)}
                                                    className="p-1.5 text-red-400 hover:text-red-300 transition-colors"
                                                    title="Delete"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                                        <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {labels.length === 0 && !showNew && (
                                <div className="px-6 py-12 text-center text-muted-foreground">
                                    No work type labels configured. Click &quot;+ Add Label&quot; to create one.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
