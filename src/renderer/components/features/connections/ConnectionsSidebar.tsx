import React, { useState } from "react";
import { Button } from "@fluentui/react-components";
import { useConnectionsContext } from "../../../contexts/ConnectionsContext";
import "./ConnectionsSidebar.scss";

export const ConnectionsSidebar: React.FC = () => {
    const { connections, activeConnection, setActiveConnection, deleteConnection, loadConnections } = useConnectionsContext();

    const handleAddConnection = () => {
        // TODO: Show AddConnectionModal
        console.log("Add connection modal not yet implemented");
        window.api.invoke("notification:show", {
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

    return (
        <div className="sidebar-content">
            <div className="sidebar-header">
                <h2 className="sidebar-title">CONNECTIONS</h2>
                <Button appearance="primary" size="small" onClick={handleAddConnection}>
                    + Add
                </Button>
            </div>

            <div className="sidebar-body">
                <div className="connections-list-sidebar">
                    {connections.length === 0 ? (
                        <div className="sidebar-empty">
                            <p>No connections configured</p>
                            <p style={{ fontSize: "11px", marginTop: "8px" }}>Click Add to create a connection</p>
                        </div>
                    ) : (
                        connections.map((conn) => {
                            const isActive = activeConnection?.id === conn.id;
                            const isExpired = conn.tokenExpiry ? new Date(conn.tokenExpiry).getTime() <= Date.now() : false;

                            return (
                                <div key={conn.id} className={`connection-item-pptb ${isActive ? "active" : ""} ${isExpired ? "expired" : ""}`}>
                                    <div className="connection-item-header-pptb">
                                        <div className="connection-item-name-pptb">
                                            {conn.name}
                                            {isExpired && (
                                                <span className="connection-warning-icon" title="Token Expired">
                                                    ⚠
                                                </span>
                                            )}
                                        </div>
                                        <span className={`connection-env-pill env-${conn.environment.toLowerCase()}`}>{conn.environment}</span>
                                    </div>
                                    <div className="connection-item-url-pptb">{conn.url}</div>
                                    <div className="connection-item-actions-pptb">
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
                                        <button className="btn-icon-delete" onClick={(e) => handleDelete(conn.id, e)} title="Delete connection">
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
