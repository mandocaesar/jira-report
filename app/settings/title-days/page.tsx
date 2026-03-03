'use client';

import { useState, useEffect, useCallback } from 'react';

interface TitleDayEntry {
    id?: string;
    title: string;
    availableDays: number;
}

export default function TitleDaysPage() {
    const [entries, setEntries] = useState<TitleDayEntry[]>([]);
    const [originalEntries, setOriginalEntries] = useState<TitleDayEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // New title form
    const [newTitle, setNewTitle] = useState('');
    const [newDays, setNewDays] = useState(10);

    const fetchEntries = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/settings/title-days');
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setEntries(result.data || []);
            setOriginalEntries(result.data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load title days');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);

    const updateDays = (title: string, days: number) => {
        setEntries(prev => prev.map(e => e.title === title ? { ...e, availableDays: Math.max(0, days) } : e));
        setSuccess(false);
    };

    const addEntry = () => {
        if (!newTitle || entries.some(e => e.title === newTitle)) return;
        setEntries(prev => [...prev, { title: newTitle, availableDays: newDays }]);
        setNewTitle('');
        setNewDays(10);
        setSuccess(false);
    };

    const removeEntry = (title: string) => {
        setEntries(prev => prev.filter(e => e.title !== title));
        setSuccess(false);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            const res = await fetch('/api/settings/title-days', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries: entries.map(e => ({ title: e.title, availableDays: e.availableDays })) }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setOriginalEntries([...entries]);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const hasChanges = JSON.stringify(entries.map(e => ({ t: e.title, d: e.availableDays })))
        !== JSON.stringify(originalEntries.map(e => ({ t: e.title, d: e.availableDays })));

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900">
            <header className="border-b border-purple-500/20 bg-gray-900/50 backdrop-blur-xl">
                <div className="container mx-auto px-6 py-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                            <span className="text-2xl">⏱️</span>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                                Title Available Days
                            </h1>
                            <p className="text-gray-400 text-sm">Configure available sprint days per title level</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 max-w-2xl space-y-6">
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">
                        ✓ Title days saved successfully!
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {/* Info */}
                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 text-sm">
                            💡 Available days defines the maximum number of days each title level can contribute to a sprint. Leave days are subtracted from this value.
                        </div>

                        {/* Entries */}
                        <div className="bg-gray-800/30 border border-gray-700 rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-700/50 bg-gray-800/20">
                                <h2 className="text-lg font-semibold text-white">Title Configuration</h2>
                            </div>

                            <div className="divide-y divide-gray-700/30">
                                {entries.map((entry) => (
                                    <div key={entry.title} className="flex items-center justify-between px-6 py-4 hover:bg-gray-700/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg">
                                                {entry.title === 'Tech Lead' ? '🎯' :
                                                    entry.title === 'EM' ? '📋' :
                                                        entry.title === 'QA' ? '🧪' :
                                                            entry.title === 'Sec Head' ? '🔑' : '💻'}
                                            </span>
                                            <span className="font-medium text-white">{entry.title}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => updateDays(entry.title, entry.availableDays - 1)}
                                                className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                                            >−</button>
                                            <input
                                                type="number"
                                                min="0"
                                                value={entry.availableDays}
                                                onChange={(e) => updateDays(entry.title, parseInt(e.target.value) || 0)}
                                                className="w-16 px-2 py-1 text-center bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                            />
                                            <span className="text-sm text-gray-400 w-12">days</span>
                                            <button
                                                onClick={() => updateDays(entry.title, entry.availableDays + 1)}
                                                className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                                            >+</button>
                                            <button
                                                onClick={() => removeEntry(entry.title)}
                                                className="ml-2 text-red-400 hover:text-red-300 text-sm"
                                                title="Remove"
                                            >🗑️</button>
                                        </div>
                                    </div>
                                ))}
                                {entries.length === 0 && (
                                    <div className="px-6 py-12 text-center text-gray-500">
                                        No title configurations. Click &quot;Seed from Config&quot; on the Team page first, or add titles below.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Add New Title */}
                        <div className="bg-gray-800/30 border border-gray-700 rounded-2xl p-6 space-y-4">
                            <h3 className="text-sm font-semibold text-gray-300">Add New Title</h3>
                            <div className="flex items-center gap-3">
                                <input
                                    type="text"
                                    placeholder="Title name (e.g., Senior Engineer)"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="flex-1 px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                                />
                                <input
                                    type="number"
                                    min="0"
                                    value={newDays}
                                    onChange={(e) => setNewDays(parseInt(e.target.value) || 0)}
                                    className="w-20 px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm text-center focus:outline-none focus:border-purple-500/50"
                                />
                                <button
                                    onClick={addEntry}
                                    disabled={!newTitle || entries.some(e => e.title === newTitle)}
                                    className="px-4 py-2 text-sm bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 transition-all"
                                >+ Add</button>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-center">
                            <button
                                onClick={handleSave}
                                disabled={saving || !hasChanges}
                                className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                            >
                                {saving ? (
                                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Saving...</>
                                ) : (
                                    <>{hasChanges ? '💾 Save Changes' : '✓ No Changes'}</>
                                )}
                            </button>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
