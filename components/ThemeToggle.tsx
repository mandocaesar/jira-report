"use client";

import * as React from "react";
import { useTheme } from "next-themes";

interface ThemeToggleProps {
    collapsed?: boolean;
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <button className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-lg text-muted-foreground opacity-50 cursor-not-allowed">
                <div className="w-5 h-5" />
                {!collapsed && <span className="text-sm font-medium">Theme</span>}
            </button>
        );
    }

    const toggleTheme = () => {
        document.documentElement.classList.add('disable-transitions');
        setTheme(theme === "dark" ? "light" : "dark");
        // Re-enable transitions after the paint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.documentElement.classList.remove('disable-transitions');
            });
        });
    };

    return (
        <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-start gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={collapsed ? (theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode") : ""}
        >
            <div className="w-5 h-5 flex items-center justify-center relative">
                <svg
                    className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${theme === "dark" ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
                        }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                </svg>
                <svg
                    className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${theme === "light" ? "opacity-0 -rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
                        }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                </svg>
            </div>
            {!collapsed && (
                <span className="text-sm font-medium whitespace-nowrap truncate">
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </span>
            )}
        </button>
    );
}
