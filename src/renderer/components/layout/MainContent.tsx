import { makeStyles } from "@fluentui/react-components";
import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { useToolsContext } from "../../contexts/ToolsContext";
import { useToolViewBounds } from "../../hooks/useToolViewBounds";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { HomeView } from "./HomeView";

const useStyles = makeStyles({
    main: { flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--bg-color)", overflow: "hidden" },
    toolPanel: { display: "flex", flexDirection: "column", height: "100%" },
    toolPanelHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "var(--sidebar-bg)",
        borderBottom: "1px solid var(--border-color)",
        padding: 0,
        height: "35px",
    },
    toolTabs: { display: "flex", alignItems: "center", flex: 1, overflowX: "auto", overflowY: "hidden" },
    toolTab: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 12px",
        backgroundColor: "var(--secondary-color)",
        borderRight: "1px solid var(--border-color)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontSize: "13px",
        color: "var(--text-color)",
        transition: "background-color 0.15s ease",
        "&:hover": { backgroundColor: "var(--bg-color)" },
    },
    toolTabActive: {
        backgroundColor: "var(--bg-color)",
        borderBottom: "2px solid var(--primary-color)",
    },
    toolTabName: { maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" },
    toolTabClose: {
        background: "none",
        border: "none",
        color: "var(--text-color)",
        opacity: 0.6,
        cursor: "pointer",
        padding: 0,
        width: "16px",
        height: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "2px",
        "&:hover": { opacity: 1, backgroundColor: "rgba(0,0,0,0.1)" },
    },
    toolPanelControls: { padding: "0 8px" },
    btnIcon: {
        background: "none",
        border: "none",
        color: "var(--text-color)",
        cursor: "pointer",
        padding: "4px 8px",
        borderRadius: "4px",
        "&:hover": { backgroundColor: "rgba(0,0,0,0.05)" },
    },
    toolPanelContentWrapper: { flex: 1, position: "relative", overflow: "hidden" },
    toolPanelContent: { width: "100%", height: "100%" },
});

export const MainContent: React.FC = () => {
    const { activeView } = useAppContext();
    const { openTools, activeToolId, closeTool, switchToTool } = useToolsContext();

    // Set up bounds handler for BrowserView positioning
    useToolViewBounds();

    const hasOpenTools = openTools.size > 0;

    const handleCloseTool = (toolId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        closeTool(toolId);
    };

    const handleCloseAllTools = () => {
        Array.from(openTools.keys()).forEach((toolId) => closeTool(toolId));
    };

    const handleSwitchTool = (toolId: string) => {
        switchToTool(toolId);
    };

    const styles = useStyles();
    return (
        <main className={styles.main}>
            {/* Tool Panel (for launched tools) */}
            {hasOpenTools && (
                <div className={styles.toolPanel}>
                    <div className={styles.toolPanelHeader}>
                        <div className={styles.toolTabs} id="tool-tabs">
                            {Array.from(openTools.entries()).map(([toolId, openTool]) => {
                                const active = activeToolId === toolId;
                                return (
                                    <div key={toolId} className={`${styles.toolTab} ${active ? styles.toolTabActive : ""}`} onClick={() => handleSwitchTool(toolId)}>
                                        <span className={styles.toolTabName}>{openTool.tool.name}</span>
                                        <button className={styles.toolTabClose} onClick={(e) => handleCloseTool(toolId, e)} title="Close">
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className={styles.toolPanelControls}>
                            <button className={styles.btnIcon} onClick={handleCloseAllTools} title="Close all tools">
                                ✕
                            </button>
                        </div>
                    </div>
                    <div className={styles.toolPanelContentWrapper} id="tool-panel-content-wrapper">
                        <div className={styles.toolPanelContent} id="tool-panel-content">
                            {/* BrowserView tools are rendered here by the backend ToolWindowManager */}
                        </div>
                    </div>

                    {/* Terminal Panel - Always mounted, visibility controlled by CSS */}
                    <TerminalPanel />
                </div>
            )}

            {/* Home/Welcome View */}
            {!hasOpenTools && activeView === "home" && <HomeView />}
        </main>
    );
};
