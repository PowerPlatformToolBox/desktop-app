import { Button, makeStyles } from "@fluentui/react-components";
import React from "react";
import { useConnectionsContext } from "../../../contexts/ConnectionsContext";

const useStyles = makeStyles({
    content: { display: "flex", flexDirection: "column", height: "100%" },
    header: {
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "var(--sidebar-bg)",
    },
    title: {
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        color: "var(--text-color)",
        opacity: 0.8,
        margin: 0,
    },
    body: { flex: 1, overflowY: "auto", padding: "8px" },
    list: { display: "flex", flexDirection: "column", gap: "8px" },
    empty: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "32px",
        textAlign: "center",
        color: "var(--text-color)",
        opacity: 0.6,
        "& p": { fontSize: "13px", margin: 0 },
    },
    item: {
        padding: "12px",
        backgroundColor: "var(--bg-color)",
        border: "1px solid var(--border-color)",
        borderRadius: "6px",
        transition: "all 0.2s ease",
        cursor: "pointer",
        "&:hover": { border: "1px solid var(--primary-color)", boxShadow: "var(--shadow)" },
    },
    itemActive: {
        border: "1px solid var(--primary-color)",
        backgroundColor: "rgba(0,120,212,0.05)",
    },
    itemExpired: { border: "1px solid #f59e0b" },
    itemHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "4px",
    },
    itemName: {
        fontSize: "13px",
        fontWeight: 600,
        color: "var(--text-color)",
        display: "flex",
        alignItems: "center",
        gap: "4px",
    },
    warningIcon: { color: "#f59e0b", fontSize: "14px" },
    envPill: {
        fontSize: "10px",
        padding: "2px 8px",
        borderRadius: "12px",
        fontWeight: 500,
        textTransform: "uppercase",
    },
    envDev: { backgroundColor: "#e3f2fd", color: "#1976d2" },
    envTest: { backgroundColor: "#fff3e0", color: "#f57c00" },
    envUat: { backgroundColor: "#f3e5f5", color: "#7b1fa2" },
    envProduction: { backgroundColor: "#e8f5e9", color: "#388e3c" },
    url: {
        fontSize: "11px",
        color: "var(--text-color)",
        opacity: 0.7,
        marginBottom: "8px",
        wordBreak: "break-all",
    },
    actions: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" },
    deleteBtn: {
        background: "none",
        border: "none",
        color: "#d83b01",
        cursor: "pointer",
        padding: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        transition: "all 0.2s ease",
        "&:hover": { backgroundColor: "rgba(216,59,1,0.1)" },
        "& svg": { width: "16px", height: "16px" },
    },
});

export const ConnectionsSidebar: React.FC = () => {
    const { connections, activeConnection, setActiveConnection, deleteConnection, loadConnections } = useConnectionsContext();

    const handleAddConnection = () => {
        // TODO: Show AddConnectionModal
        console.log("Add connection modal not yet implemented");
        window.toolboxAPI.utils.showNotification({
            title: "Coming Soon",
            body: "Add connection functionality will be implemented in a future update",
            type: "info",
        });
    };

    const handleConnect = async (connectionId: string) => {
        try {
            await setActiveConnection(connectionId);
        } catch (error) {
            console.error("Failed to connect:", error);
        }
    };

    const handleDisconnect = async () => {
        try {
            await window.toolboxAPI.connections.disconnect();
            await loadConnections();
        } catch (error) {
            console.error("Failed to disconnect:", error);
        }
    };

    const handleDelete = async (connectionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this connection?")) {
            await deleteConnection(connectionId);
        }
    };

    const styles = useStyles();
    return (
        <div className={styles.content}>
            <div className={styles.header}>
                <h2 className={styles.title}>CONNECTIONS</h2>
                <Button appearance="primary" size="small" onClick={handleAddConnection}>
                    + Add
                </Button>
            </div>
            <div className={styles.body}>
                <div className={styles.list}>
                    {connections.length === 0 ? (
                        <div className={styles.empty}>
                            <p>No connections configured</p>
                            <p style={{ fontSize: "11px", marginTop: "8px" }}>Click Add to create a connection</p>
                        </div>
                    ) : (
                        connections.map((conn) => {
                            const isActive = activeConnection?.id === conn.id;
                            const isExpired = conn.tokenExpiry ? new Date(conn.tokenExpiry).getTime() <= Date.now() : false;
                            const envMap: Record<string, string> = {
                                Development: styles.envDev,
                                Dev: styles.envDev,
                                Test: styles.envTest,
                                UAT: styles.envUat,
                                Production: styles.envProduction,
                                Prod: styles.envProduction,
                            };
                            const envClass = envMap[conn.environment] || "";

                            return (
                                <div key={conn.id} className={`${styles.item} ${isActive ? styles.itemActive : ""} ${isExpired ? styles.itemExpired : ""}`} onClick={() => handleConnect(conn.id)}>
                                    <div className={styles.itemHeader}>
                                        <div className={styles.itemName}>
                                            {conn.name}
                                            {isExpired && (
                                                <span className={styles.warningIcon} title="Token Expired">
                                                    ⚠
                                                </span>
                                            )}
                                        </div>
                                        <span className={`${styles.envPill} ${envClass}`}>{conn.environment}</span>
                                    </div>
                                    <div className={styles.url}>{conn.url}</div>
                                    <div className={styles.actions}>
                                        <div>
                                            {isActive ? (
                                                isExpired ? (
                                                    <Button appearance="primary" size="small" onClick={() => handleConnect(conn.id)}>
                                                        Re-authenticate
                                                    </Button>
                                                ) : (
                                                    <Button appearance="secondary" size="small" onClick={handleDisconnect}>
                                                        Disconnect
                                                    </Button>
                                                )
                                            ) : (
                                                <Button appearance="primary" size="small" onClick={() => handleConnect(conn.id)}>
                                                    Connect
                                                </Button>
                                            )}
                                        </div>
                                        <button className={styles.deleteBtn} onClick={(e) => handleDelete(conn.id, e)} title="Delete connection">
                                            <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                                <path d="M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
