'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
    name: string;
    href: string;
    icon: string;
    description?: string;
}

interface NavSection {
    title: string;
    items: NavItem[];
}

const navigation: NavSection[] = [
    {
        title: 'Dashboard',
        items: [
            {
                name: 'Sprint Overview',
                href: '/',
                icon: '📊',
                description: 'View sprint progress and metrics',
            },
        ],
    },
    {
        title: 'Planning',
        items: [
            {
                name: 'Capacity Planning',
                href: '/planning/capacity',
                icon: '📊',
                description: 'Forecast sprint capacity',
            },
        ],
    },
    {
        title: 'Settings',
        items: [
            {
                name: 'Team Members',
                href: '/settings/team',
                icon: '👥',
                description: 'Manage team roster',
            },
            {
                name: 'Sprint Leave',
                href: '/settings/leave',
                icon: '📅',
                description: 'Plan leave per sprint',
            },
            {
                name: 'Title Days',
                href: '/settings/title-days',
                icon: '⏱️',
                description: 'Available days per title',
            },
        ],
    },
    {
        title: 'Analytics',
        items: [
            {
                name: 'Metrics Dashboard',
                href: '/metrics',
                icon: '📈',
                description: 'Historical performance',
            },
        ],
    },
];

interface SidebarProps {
    children?: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Prevent hydration mismatch by only rendering after mount
    useEffect(() => {
        setMounted(true);
    }, []);

    // Don't render anything until mounted to prevent hydration mismatch
    if (!mounted) {
        return <>{children}</>;
    }

    if (pathname === '/login') {
        return <>{children}</>;
    }

    return (
        <div className="flex min-h-screen">
            {/* Sidebar */}
            <aside
                className={`fixed left-0 top-0 h-screen bg-background border-r border-border transition-all duration-300 z-50 flex flex-col ${collapsed ? 'w-20' : 'w-64'
                    }`}
            >
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-border">
                    {!collapsed && (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center text-white font-bold">
                                J
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-foreground">Jira Sprint</h1>
                                <p className="text-xs text-muted-foreground">Report Dashboard</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        <svg
                            className="w-5 h-5 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            {collapsed ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                                />
                            )}
                        </svg>
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-4 px-2">
                    {navigation.map((section) => (
                        <div key={section.title} className="mb-6">
                            {!collapsed && (
                                <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    {section.title}
                                </h3>
                            )}
                            <div className="space-y-1">
                                {section.items.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative ${isActive
                                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                                }`}
                                            title={collapsed ? item.name : ''}
                                        >
                                            <span className="text-xl flex-shrink-0">{item.icon}</span>
                                            {!collapsed && (
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium truncate">{item.name}</div>
                                                    {item.description && !isActive && (
                                                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                                                    )}
                                                </div>
                                            )}
                                            {isActive && (
                                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Footer - Actions */}
                <div className="border-t border-border p-4 space-y-2 overflow-hidden">
                    <button
                        onClick={() => router.refresh()}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title={collapsed ? 'Refresh Data' : ''}
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {!collapsed && <span className="text-sm font-medium whitespace-nowrap truncate">Refresh Data</span>}
                    </button>

                    {/* Theme Toggle Button */}
                    <ThemeToggle collapsed={collapsed} />

                    <Link
                        href="/api/auth/logout"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title={collapsed ? 'Logout' : ''}
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                        </svg>
                        {!collapsed && <span className="text-sm font-medium">Logout</span>}
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 min-w-0 flex flex-col overflow-x-hidden ${collapsed ? 'ml-20' : 'ml-64'} transition-all duration-300`}>
                {children}
            </main>
        </div>
    );
}
