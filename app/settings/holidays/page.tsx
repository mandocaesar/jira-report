'use client';

import { useState, useEffect, useCallback } from 'react';

interface HolidayData {
    id: string;
    date: string;
    name: string;
    year: number;
    isActive: boolean;
}

export default function HolidaysPage() {
    const [holidays, setHolidays] = useState<HolidayData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Year filter
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    // Import state
    const [importing, setImporting] = useState(false);

    // New holiday form
    const [showNew, setShowNew] = useState(false);
    const [newDate, setNewDate] = useState('');
    const [newName, setNewName] = useState('');
    const [saving, setSaving] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDate, setEditDate] = useState('');

    const fetchHolidays = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/settings/holidays?year=${selectedYear}`);
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setHolidays(result.data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load holidays');
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

    const handleImport = async () => {
        try {
            setImporting(true);
            setError(null);
            const res = await fetch('/api/settings/holidays/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year: selectedYear }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setSuccess(`Imported ${result.data.imported} holidays (${result.data.skipped} skipped)`);
            setTimeout(() => setSuccess(null), 4000);
            fetchHolidays();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to import');
        } finally {
            setImporting(false);
        }
    };

    const handleCreate = async () => {
        try {
            setSaving(true);
            setError(null);
            const res = await fetch('/api/settings/holidays', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: newDate, name: newName }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setShowNew(false);
            setNewDate('');
            setNewName('');
            fetchHolidays();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create holiday');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (holiday: HolidayData) => {
        try {
            const res = await fetch('/api/settings/holidays', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: holiday.id, isActive: !holiday.isActive }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setHolidays(prev => prev.map(h => h.id === holiday.id ? { ...h, isActive: !h.isActive } : h));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle');
        }
    };

    const handleUpdate = async (id: string) => {
        try {
            setError(null);
            const res = await fetch('/api/settings/holidays', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: editName, date: editDate }),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setEditingId(null);
            fetchHolidays();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this holiday?')) return;
        try {
            const res = await fetch(`/api/settings/holidays?id=${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            setHolidays(prev => prev.filter(h => h.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    const startEdit = (h: HolidayData) => {
        setEditingId(h.id);
        setEditName(h.name);
        setEditDate(h.date.split('T')[0]);
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    };

    const activeCount = holidays.filter(h => h.isActive).length;

    return (
        <div className="min-h-screen overflow-x-hidden">
            <header className="border-b border-border bg-background/50 backdrop-blur-xl">
                <div className="px-3 sm:px-4 md:px-6 py-4 md:py-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-foreground rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-background" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">National Holidays</h1>
                            <p className="text-muted-foreground text-sm">Manage Indonesian national holidays — excluded from working day calculations</p>
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

                {/* Year filter + actions bar */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        {years.map(y => (
                            <button
                                key={y}
                                onClick={() => setSelectedYear(y)}
                                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${selectedYear === y
                                    ? 'bg-foreground text-background font-medium'
                                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowNew(true)}
                            className="px-3 py-1.5 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all"
                        >
                            + Add Holiday
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={importing}
                            className="px-3 py-1.5 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30 disabled:opacity-50 transition-all"
                        >
                            {importing ? 'Importing…' : `Fetch ${selectedYear} from API`}
                        </button>
                    </div>
                </div>

                {/* Summary */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{holidays.length} holidays</span>
                    <span>•</span>
                    <span className="text-green-400">{activeCount} active</span>
                    <span>•</span>
                    <span className="text-gray-400">{holidays.length - activeCount} inactive</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="bg-muted/30 border border-border rounded-2xl overflow-hidden">
                        {/* New holiday form */}
                        {showNew && (
                            <div className="p-6 border-b border-border bg-muted/10 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="date"
                                        value={newDate}
                                        onChange={(e) => setNewDate(e.target.value)}
                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Holiday name"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={!newDate || !newName || saving}
                                        className="px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                                    >
                                        {saving ? 'Creating…' : 'Create'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Holiday list */}
                        <div className="divide-y divide-border">
                            {holidays.map((h) => (
                                <div key={h.id} className={`px-6 py-3 hover:bg-muted/20 transition-colors ${!h.isActive ? 'opacity-50' : ''}`}>
                                    {editingId === h.id ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <input
                                                    type="date"
                                                    value={editDate}
                                                    onChange={(e) => setEditDate(e.target.value)}
                                                    className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                                />
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-blue-500/50"
                                                />
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                                <button onClick={() => handleUpdate(h.id)} className="px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90">Save</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm font-mono text-muted-foreground w-32">{formatDate(h.date)}</span>
                                                <span className="font-medium text-foreground">{h.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleToggle(h)}
                                                    className={`relative w-9 h-5 rounded-full transition-colors ${h.isActive ? 'bg-green-500' : 'bg-muted'}`}
                                                    title={h.isActive ? 'Active' : 'Inactive'}
                                                >
                                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${h.isActive ? 'translate-x-4' : ''}`} />
                                                </button>
                                                <button
                                                    onClick={() => startEdit(h)}
                                                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                                                    title="Edit"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                                                        <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(h.id)}
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
                            {holidays.length === 0 && !showNew && (
                                <div className="px-6 py-12 text-center text-muted-foreground">
                                    No holidays for {selectedYear}. Click &quot;Fetch from API&quot; to import Indonesian holidays.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
