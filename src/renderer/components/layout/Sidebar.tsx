import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { ToolsSidebar } from "../features/tools/ToolsSidebar";
import { ConnectionsSidebar } from "../features/connections/ConnectionsSidebar";
import { MarketplaceSidebar } from "../features/marketplace/MarketplaceSidebar";
import { DebugSidebar } from "../features/debug/DebugSidebar";
import { SettingsSidebar } from "../features/settings/SettingsSidebar";
import "./Sidebar.scss";

export const Sidebar: React.FC = () => {
    const { activeSidebar } = useAppContext();

    const renderSidebarContent = () => {
        switch (activeSidebar) {
            case "tools":
                return <ToolsSidebar />;
            case "connections":
                return <ConnectionsSidebar />;
            case "marketplace":
                return <MarketplaceSidebar />;
            case "debug":
                return <DebugSidebar />;
            case "settings":
                return <SettingsSidebar />;
            default:
                return <ToolsSidebar />;
        }
    };

    return <aside className="sidebar">{renderSidebarContent()}</aside>;
};
