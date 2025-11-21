import { makeStyles } from "@fluentui/react-components";
import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { ConnectionsSidebar } from "../features/connections/ConnectionsSidebar";
import { DebugSidebar } from "../features/debug/DebugSidebar";
import { MarketplaceSidebar } from "../features/marketplace/MarketplaceSidebar";
import { SettingsSidebar } from "../features/settings/SettingsSidebar";
import { ToolsSidebar } from "../features/tools/ToolsSidebar";

const useStyles = makeStyles({
    sidebar: {
        width: "var(--pptb-sidebar-width, 280px)",
        backgroundColor: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "calc(100% - var(--pptb-footer-height))",
    },
});

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

    const styles = useStyles();
    return <aside className={styles.sidebar}>{renderSidebarContent()}</aside>;
};
