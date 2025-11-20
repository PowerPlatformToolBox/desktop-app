import React from "react";
import { Button } from "@fluentui/react-components";

export const DebugSidebar: React.FC = () => {
    return (
        <div className="sidebar-content">
            <div className="sidebar-header">
                <h2 className="sidebar-title">DEBUG</h2>
            </div>

            <div className="sidebar-body">
                <div className="debug-container-sidebar" style={{ padding: "16px" }}>
                    <div className="debug-section" style={{ marginBottom: "24px" }}>
                        <h3 style={{ fontSize: "13px", marginBottom: "8px" }}>Load Local Tool</h3>
                        <p style={{ fontSize: "11px", opacity: 0.7, marginBottom: "12px" }}>Load a tool directly from your local file system for development and testing.</p>
                        <Button appearance="primary" size="small">
                            Browse
                        </Button>
                    </div>

                    <div className="debug-section">
                        <h3 style={{ fontSize: "13px", marginBottom: "8px" }}>Install Tool by Package Name</h3>
                        <p style={{ fontSize: "11px", opacity: 0.7, marginBottom: "12px" }}>Enter an npm package name to install a custom tool.</p>
                        <input type="text" placeholder="e.g., @powerplatform/tool-example" style={{ width: "100%", padding: "6px", marginBottom: "8px" }} />
                        <Button appearance="primary" size="small">
                            Install Package
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
