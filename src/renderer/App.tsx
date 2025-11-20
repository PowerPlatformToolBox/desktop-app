import React from "react";
import { FluentProvider, webLightTheme, webDarkTheme } from "@fluentui/react-components";
import { AppProvider, useAppContext } from "./contexts/AppContext";
import { ToolsProvider } from "./contexts/ToolsContext";
import { ConnectionsProvider } from "./contexts/ConnectionsContext";
import { ActivityBar } from "./components/layout/ActivityBar";
import { Sidebar } from "./components/layout/Sidebar";
import { MainContent } from "./components/layout/MainContent";
import { AppFooter } from "./components/layout/AppFooter";
import "./App.scss";

const AppContent: React.FC = () => {
    const { theme, setActiveSidebar } = useAppContext();

    // Determine which Fluent UI theme to use
    const fluentTheme = React.useMemo(() => {
        if (theme === "dark") {
            return webDarkTheme;
        } else if (theme === "light") {
            return webLightTheme;
        } else {
            // System theme
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            return prefersDark ? webDarkTheme : webLightTheme;
        }
    }, [theme]);

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
                <ToolsProvider>
                    <AppContent />
                </ToolsProvider>
            </ConnectionsProvider>
        </AppProvider>
    );
};
