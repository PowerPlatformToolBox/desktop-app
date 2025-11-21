import React from "react";
import { AppProvider, useAppContext } from "./contexts/AppContext";
import { ToolsProvider } from "./contexts/ToolsContext";
import { ConnectionsProvider } from "./contexts/ConnectionsContext";
import { ActivityBar } from "./components/layout/ActivityBar";
import { Sidebar } from "./components/layout/Sidebar";
import { MainContent } from "./components/layout/MainContent";
import { AppFooter } from "./components/layout/AppFooter";
import "./App.scss";

const AppContent: React.FC = () => {
    const { setActiveSidebar } = useAppContext();

    return (
        <>
            <div className="app-container">
                <ActivityBar onSidebarChange={setActiveSidebar} />
                <Sidebar />
                <MainContent />
            </div>
            <AppFooter />
        </>
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
