import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import "./ActivityBar.scss";

interface ActivityBarProps {
    onSidebarChange: (sidebar: string) => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ onSidebarChange }) => {
    const { activeSidebar, setActiveSidebar } = useAppContext();

    const handleItemClick = (sidebar: string) => {
        setActiveSidebar(sidebar);
        onSidebarChange(sidebar);
    };

    const activityItems = [
        { id: "tools", title: "Installed Tools", icon: "tools.svg" },
        { id: "connections", title: "Connection Manager", icon: "connections.svg" },
        { id: "marketplace", title: "Tools Marketplace", icon: "marketplace.svg" },
        { id: "debug", title: "Debug / Install by Package", icon: "debug.svg" },
    ];

    const footerItems = [{ id: "settings", title: "Settings", icon: "settings.svg" }];

    return (
        <aside className="activity-bar">
            <div className="activity-bar-header">
                <div className="app-icon" title="Power Platform Tool Box">
                    <img id="app-icon-img" src="icons/dark/app-icon.svg" alt="App Icon" />
                </div>
            </div>

            <nav className="activity-bar-nav">
                {activityItems.map((item) => (
                    <button
                        key={item.id}
                        className={`activity-item ${activeSidebar === item.id ? "active" : ""}`}
                        data-sidebar={item.id}
                        title={item.title}
                        onClick={() => handleItemClick(item.id)}
                    >
                        <img src={`icons/dark/${item.icon}`} alt={`${item.title} Icon`} className="activity-icon" />
                    </button>
                ))}
            </nav>

            <nav className="activity-bar-footer">
                {footerItems.map((item) => (
                    <button
                        key={item.id}
                        className={`activity-item ${activeSidebar === item.id ? "active" : ""}`}
                        data-sidebar={item.id}
                        title={item.title}
                        onClick={() => handleItemClick(item.id)}
                    >
                        <img src={`icons/dark/${item.icon}`} alt={`${item.title} Icon`} className="activity-icon" />
                    </button>
                ))}
            </nav>
        </aside>
    );
};
