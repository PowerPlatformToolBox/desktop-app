import React, { useEffect, useState } from "react";
import { useConnectionsContext } from "../../contexts/ConnectionsContext";
import "./AppFooter.scss";

export const AppFooter: React.FC = () => {
    const { activeConnection } = useConnectionsContext();
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

    return (
        <footer className="app-footer">
            <div className="footer-content">
                <span id="connection-status" className="connection-status">
                    {connectionStatus}
                </span>
            </div>
        </footer>
    );
};
