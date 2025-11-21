import { makeStyles } from "@fluentui/react-components";
import React from "react";
import { useTerminal } from "../../../contexts/TerminalContext";
import { useTerminalPanel } from "../../../hooks/useTerminalPanel";

const useStyles = makeStyles({
    terminalPanel: {
        display: "flex",
        flexDirection: "column",
        height: "250px",
        minHeight: "100px",
        backgroundColor: "var(--bg-color)",
        borderTop: "1px solid var(--border-color)",
        position: "relative",
    },
    terminalHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 0,
        backgroundColor: "var(--sidebar-bg)",
        borderBottom: "1px solid var(--border-color)",
        height: "35px",
    },
    terminalTabs: {
        display: "flex",
        alignItems: "center",
        flex: 1,
        overflowX: "auto",
        overflowY: "hidden",
    },
    terminalControls: {
        display: "flex",
        gap: "4px",
        padding: "0 8px",
    },
    terminalButton: {
        background: "none",
        border: "none",
        color: "var(--text-color)",
        cursor: "pointer",
        padding: "4px 8px",
        borderRadius: "4px",
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        "&:hover": {
            backgroundColor: "rgba(0,0,0,0.05)",
        },
    },
    terminalContent: {
        flex: 1,
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#1E1E1E",
    },
    resizeHandle: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "4px",
        cursor: "ns-resize",
        backgroundColor: "transparent",
        zIndex: 10,
        "&:hover": {
            backgroundColor: "var(--primary-color)",
        },
    },
});

/**
 * Terminal Panel Component
 *
 * Full-featured terminal panel with tabs, output, and resize functionality
 * Integrates existing terminal logic from renderer.ts
 * Terminal tabs and output are managed dynamically via DOM manipulation
 *
 * Note: This component is always mounted to preserve terminal state.
 * Visibility is controlled via CSS display property from TerminalContext.
 */
export const TerminalPanel: React.FC = () => {
    const { isTerminalVisible, hideTerminal } = useTerminal();
    const styles = useStyles();

    // Set up terminal functionality
    useTerminalPanel();

    return (
        <div className={styles.terminalPanel} id="terminal-panel" style={{ display: isTerminalVisible ? "flex" : "none" }}>
            <div className={styles.resizeHandle} id="terminal-resize-handle" />
            <div className={styles.terminalHeader}>
                <div className={styles.terminalTabs} id="terminal-tabs">
                    {/* Terminal tabs are dynamically added here via useTerminalPanel hook */}
                </div>
                <div className={styles.terminalControls}>
                    <button className={styles.terminalButton} onClick={hideTerminal} title="Close Terminal">
                        ✕
                    </button>
                </div>
            </div>
            <div className={styles.terminalContent} id="terminal-panel-content">
                {/* Terminal output containers are dynamically added here via useTerminalPanel hook */}
            </div>
        </div>
    );
};
