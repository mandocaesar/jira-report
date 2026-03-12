'use client';

import { useState, useEffect } from 'react';

interface Engineer {
    accountId: string;
    name: string;
}

interface CapacityAdjustment {
    id?: number;
    engineerId: string;
    engineerName: string;
    capacityPercentage: number;
    startDate: string;
    endDate: string;
    reason: string;
    notes?: string;
}

interface CapacityAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (adjustment: Omit<CapacityAdjustment, 'id' | 'engineerName'>) => Promise<void>;
    engineers: Engineer[];
    adjustment?: CapacityAdjustment | null;
}

const REASONS = [
    { value: 'annual-leave', label: '🏖️ Annual Leave', capacityDefault: 0 },
    { value: 'sick-leave', label: '🏥 Sick Leave', capacityDefault: 0 },
    { value: 'training', label: '📚 Training', capacityDefault: 50 },
    { value: 'onboarding', label: '🚀 Onboarding (New Hire)', capacityDefault: 25 },
    { value: 'part-time', label: '⏰ Part-Time', capacityDefault: 50 },
    { value: 'support-rotation', label: '🔧 Support Rotation', capacityDefault: 50 },
    { value: 'meetings', label: '📅 Heavy Meeting Load', capacityDefault: 75 },
    { value: 'other', label: '📝 Other', capacityDefault: 100 },
];

export default function CapacityAdjustmentModal({
    isOpen,
    onClose,
    onSave,
    engineers,
    adjustment,
}: CapacityAdjustmentModalProps) {
    const [engineerId, setEngineerId] = useState('');
    const [capacityPercentage, setCapacityPercentage] = useState(100);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('annual-leave');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Populate form when editing
    useEffect(() => {
        if (adjustment) {
            setEngineerId(adjustment.engineerId);
            setCapacityPercentage(adjustment.capacityPercentage);
            setStartDate(adjustment.startDate.split('T')[0]);
            setEndDate(adjustment.endDate.split('T')[0]);
            setReason(adjustment.reason);
            setNotes(adjustment.notes || '');
        } else {
            resetForm();
        }
    }, [adjustment, isOpen]);

    const resetForm = () => {
        setEngineerId('');
        setCapacityPercentage(100);
        setStartDate('');
        setEndDate('');
        setReason('annual-leave');
        setNotes('');
        setError(null);
    };

    const handleReasonChange = (newReason: string) => {
        setReason(newReason);
        const reasonConfig = REASONS.find(r => r.value === newReason);
        if (reasonConfig && !adjustment) {
            setCapacityPercentage(reasonConfig.capacityDefault);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!engineerId) {
            setError('Please select an engineer');
            return;
        }

        if (!startDate || !endDate) {
            setError('Please select start and end dates');
            return;
        }

        if (new Date(startDate) > new Date(endDate)) {
            setError('End date must be after start date');
            return;
        }

        try {
            setSaving(true);
            await onSave({
                engineerId,
                capacityPercentage,
                startDate,
                endDate,
                reason,
                notes: notes || undefined,
            });
            resetForm();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save adjustment');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-700">
                        <h2 className="text-xl font-bold text-white">
                            {adjustment ? '✏️ Edit Capacity Adjustment' : '➕ Add Capacity Adjustment'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {/* Error Message */}
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Engineer Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Engineer
                            </label>
                            <select
                                value={engineerId}
                                onChange={(e) => setEngineerId(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                disabled={!!adjustment}
                            >
                                <option value="">Select an engineer...</option>
                                {engineers.map((engineer) => (
                                    <option key={engineer.accountId} value={engineer.accountId}>
                                        {engineer.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Reason Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Reason
                            </label>
                            <select
                                value={reason}
                                onChange={(e) => handleReasonChange(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            >
                                {REASONS.map((r) => (
                                    <option key={r.value} value={r.value}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date Range */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>

                        {/* Capacity Slider */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-300">
                                    Capacity
                                </label>
                                <span className={`text-lg font-bold ${capacityPercentage === 0 ? 'text-red-400' :
                                        capacityPercentage < 50 ? 'text-orange-400' :
                                            capacityPercentage < 100 ? 'text-yellow-400' :
                                                'text-green-400'
                                    }`}>
                                    {capacityPercentage}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={capacityPercentage}
                                onChange={(e) => setCapacityPercentage(parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>0% (Off)</span>
                                <span>50%</span>
                                <span>100% (Full)</span>
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Notes (optional)
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Add any additional notes..."
                                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Saving...
                                    </span>
                                ) : adjustment ? 'Update Adjustment' : 'Add Adjustment'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
