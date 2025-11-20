import React from "react";
import { Button, Dropdown, Option, Checkbox } from "@fluentui/react-components";
import { useAppContext } from "../../../contexts/AppContext";

export const SettingsSidebar: React.FC = () => {
    const { theme, setTheme } = useAppContext();

    return (
        <div className="sidebar-content">
            <div className="sidebar-header">
                <h2 className="sidebar-title">SETTINGS</h2>
            </div>

            <div className="sidebar-body">
                <div className="settings-container-sidebar" style={{ padding: "16px" }}>
                    <div className="setting-group" style={{ marginBottom: "20px" }}>
                        <label style={{ display: "block", fontSize: "12px", marginBottom: "8px", fontWeight: 600 }}>Theme</label>
                        <Dropdown value={theme} onOptionSelect={(_, data) => setTheme(data.optionValue as any)} style={{ width: "100%" }}>
                            <Option value="system">System</Option>
                            <Option value="light">Light</Option>
                            <Option value="dark">Dark</Option>
                        </Dropdown>
                    </div>

                    <div className="setting-group" style={{ marginBottom: "20px" }}>
                        <label style={{ display: "block", fontSize: "12px", marginBottom: "8px", fontWeight: 600 }}>Auto Update</label>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <Checkbox />
                            <span style={{ fontSize: "11px" }}>Automatically check for updates</span>
                        </div>
                    </div>

                    <div className="setting-group">
                        <Button appearance="primary" size="small">
                            Save Settings
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
