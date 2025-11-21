import { makeStyles } from "@fluentui/react-components";
import React, { useEffect, useState } from "react";
import { useConnectionsContext } from "../../contexts/ConnectionsContext";
import { useTerminal } from "../../contexts/TerminalContext";

const useStyles = makeStyles({
    footer: {
        height: "var(--pptb-footer-height, 32px)",
        backgroundColor: "var(--sidebar-bg)",
        borderTop: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        fontSize: "12px",
        color: "var(--text-color)",
    },
    content: { display: "flex", alignItems: "center", gap: "12px", width: "100%", justifyContent: "space-between" },
    connectionStatus: { opacity: 0.8 },
    terminalToggle: {
        background: "none",
        border: "none",
        color: "var(--text-color)",
        cursor: "pointer",
        padding: "4px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        opacity: 0.8,
        "&:hover": {
            opacity: 1,
            backgroundColor: "rgba(0,0,0,0.05)",
        },
    },
});

export const AppFooter: React.FC = () => {
    const { activeConnection } = useConnectionsContext();
    const { isTerminalVisible, toggleTerminal } = useTerminal();
    const [connectionStatus, setConnectionStatus] = useState("No active connection");

    useEffect(() => {
        if (activeConnection) {
            // Check if token is expired
            let isExpired = false;
            if (activeConnection.tokenExpiry) {
                const expiryDate = new Date(activeConnection.tokenExpiry);
                const now = new Date();
                isExpired = expiryDate.getTime() <= now.getTime();
            }

            const warningIcon = isExpired ? " ⚠" : "";
            setConnectionStatus(`${activeConnection.name} (${activeConnection.environment})${warningIcon}`);
        } else {
            setConnectionStatus("No active connection");
        }
    }, [activeConnection]);

    const styles = useStyles();
    return (
        <footer className={styles.footer}>
            <div className={styles.content}>
                <span id="connection-status" className={styles.connectionStatus}>
                    {connectionStatus}
                </span>
                <button className={styles.terminalToggle} onClick={toggleTerminal} title={isTerminalVisible ? "Hide Terminal" : "Show Terminal"}>
                    <span>{isTerminalVisible ? "▼" : "▲"}</span>
                    <span>Terminal</span>
                </button>
            </div>
        </footer>
    );
};
