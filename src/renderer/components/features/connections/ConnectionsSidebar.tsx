import React, { useState } from "react";
import { Button } from "@fluentui/react-components";
import { useConnectionsContext } from "../../../contexts/ConnectionsContext";

export const ConnectionsSidebar: React.FC = () => {
    const { connections } = useConnectionsContext();
    // TODO: Implement AddConnectionModal component
    // const [showAddModal, setShowAddModal] = useState(false);

    const handleAddConnection = () => {
        // TODO: Show AddConnectionModal
        console.log("Add connection modal not yet implemented");
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
                        connections.map((conn) => (
                            <div key={conn.id} className="connection-card" style={{ padding: "12px", marginBottom: "8px", border: "1px solid var(--border-color)", borderRadius: "6px" }}>
                                <h4 style={{ margin: "0 0 4px 0", fontSize: "13px" }}>{conn.name}</h4>
                                <p style={{ margin: "0", fontSize: "11px", opacity: 0.7 }}>{conn.environment}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
