import { FluentProvider } from "@fluentui/react-components";
import React from "react";
import { ActivityBar } from "./components/layout/ActivityBar";
import { AppFooter } from "./components/layout/AppFooter";
import { MainContent } from "./components/layout/MainContent";
import { Sidebar } from "./components/layout/Sidebar";
import { AppProvider, useAppContext } from "./contexts/AppContext";
import { ConnectionsProvider } from "./contexts/ConnectionsContext";
import { TerminalProvider } from "./contexts/TerminalContext";
import { ToolsProvider } from "./contexts/ToolsContext";
import { useToolBoxEvents } from "./hooks/useToolBoxEvents";
import { useGlobalStyles } from "./styles/globalStyles";
import { pptbDarkTheme, pptbLightTheme } from "./theme/tokens";

const AppContent: React.FC = () => {
    const { theme, setActiveSidebar } = useAppContext();

    // Set up toolbox event listeners (notifications, etc.)
    useToolBoxEvents();

    // Determine which theme to use
    const fluentTheme = React.useMemo(() => {
        if (theme === "dark") {
            return pptbDarkTheme;
        } else if (theme === "light") {
            return pptbLightTheme;
        } else {
            // System theme
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            return prefersDark ? pptbDarkTheme : pptbLightTheme;
        }
    }, [theme]);

    useGlobalStyles();
    return (
        <FluentProvider theme={fluentTheme}>
            <div className="app-container">
                <ActivityBar onSidebarChange={setActiveSidebar} />
                <Sidebar />
                <MainContent />
            </div>
            <AppFooter />
        </FluentProvider>
    );
};

export const App: React.FC = () => {
    return (
        <AppProvider>
            <ConnectionsProvider>
                <TerminalProvider>
                    <ToolsProvider>
                        <AppContent />
                    </ToolsProvider>
                </TerminalProvider>
            </ConnectionsProvider>
        </AppProvider>
    );
};
