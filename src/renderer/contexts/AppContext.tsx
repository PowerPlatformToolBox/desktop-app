import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type ThemeType = "light" | "dark" | "system";

interface AppContextType {
    theme: ThemeType;
    setTheme: (theme: ThemeType) => void;
    activeView: string;
    setActiveView: (view: string) => void;
    activeSidebar: string;
    setActiveSidebar: (sidebar: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useAppContext must be used within AppProvider");
    }
    return context;
};

interface AppProviderProps {
    children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const [theme, setTheme] = useState<ThemeType>("system");
    const [activeView, setActiveView] = useState<string>("home");
    const [activeSidebar, setActiveSidebar] = useState<string>("tools");

    // Load theme from settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const currentTheme = await window.toolboxAPI.utils.getCurrentTheme();
                if (currentTheme) {
                    setTheme(currentTheme as ThemeType);
                }
            } catch (error) {
                console.error("Failed to load theme setting:", error);
            }
        };
        loadSettings();
    }, []);

    // Apply theme to document body
    useEffect(() => {
        const applyTheme = () => {
            const root = document.documentElement;

            if (theme === "system") {
                const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                root.classList.toggle("dark-theme", prefersDark);
                root.classList.toggle("light-theme", !prefersDark);
            } else {
                root.classList.toggle("dark-theme", theme === "dark");
                root.classList.toggle("light-theme", theme === "light");
            }
        };

        applyTheme();

        // Listen for system theme changes
        if (theme === "system") {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
            const listener = () => applyTheme();
            mediaQuery.addEventListener("change", listener);
            return () => mediaQuery.removeEventListener("change", listener);
        }
    }, [theme]);

    const value: AppContextType = {
        theme,
        setTheme,
        activeView,
        setActiveView,
        activeSidebar,
        setActiveSidebar,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
