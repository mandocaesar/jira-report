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
        <div className="bg-muted/20 border border-border rounded-2xl overflow-hidden backdrop-blur-sm transition-all duration-300">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 sm:p-4 md:p-6 text-left hover:bg-muted/50 transition-colors focus:outline-none"
            >
                <div className="flex-1">
                    {typeof title === 'string' ? (
                        <h2 className="text-xl font-bold text-foreground">
                            {title}
                        </h2>
                    ) : (
                        title
                    )}
                </div>
                <div className={`p-2 rounded-lg transition-all duration-300 print:hidden ${isOpen
                    ? 'bg-muted border border-border rotate-180'
                    : 'bg-muted border border-border hover:bg-muted/80'
                    }`}>
                    <svg className="w-4 h-4 text-muted-foreground transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>
            <div
                className={`transition-all duration-500 ease-in-out print:opacity-100 print:max-h-none ${isOpen ? 'opacity-100 max-h-[5000px]' : 'opacity-0 max-h-0'}`}
            >
                <div className="p-3 sm:p-4 md:p-6 pt-0 border-t border-border">
                    {children}
                </div>
            </div>
        </div>
    );
}
