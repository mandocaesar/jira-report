'use client';

import { useState } from 'react';

interface CollapsibleSectionProps {
    title: string | React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

export default function CollapsibleSection({ title, defaultOpen = true, children }: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl overflow-hidden backdrop-blur-sm transition-all duration-300">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 sm:p-4 md:p-6 text-left hover:bg-white/5 transition-colors focus:outline-none"
            >
                <div className="flex-1">
                    {typeof title === 'string' ? (
                        <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                            {title}
                        </h2>
                    ) : (
                        title
                    )}
                </div>
                <div className={`p-2 rounded-full bg-white/5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>
            <div
                className={`transition-all duration-500 ease-in-out ${isOpen ? 'opacity-100 max-h-[5000px]' : 'opacity-0 max-h-0'}`}
            >
                <div className="p-3 sm:p-4 md:p-6 pt-0 border-t border-white/5">
                    {children}
                </div>
            </div>
        </div>
    );
}
