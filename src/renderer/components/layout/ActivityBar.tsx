import { makeStyles } from "@fluentui/react-components";
import React from "react";
import { useAppContext } from "../../contexts/AppContext";

const useStyles = makeStyles({
    root: {
        width: "var(--pptb-activity-bar-width, 48px)",
        backgroundColor: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 100,
        height: "calc(100% - var(--pptb-footer-height))",
    },
    header: {
        padding: "8px 0",
        textAlign: "center",
        borderBottom: "1px solid rgba(var(--icon-bg-color),1)",
    },
    appIcon: {
        width: "40px",
        height: "40px",
        margin: "0 auto",
        background: "var(--icon-bg-color)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: "bold",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "transform 0.2s ease",
        padding: "4px",
        "&:hover": { transform: "scale(1.05)" },
        "& img": { width: "100%", height: "100%", objectFit: "contain" },
    },
    nav: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        paddingTop: "8px",
    },
    footer: { paddingBottom: "8px", marginTop: "auto" },
    activityItem: {
        position: "relative",
        width: "100%",
        height: "48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#cccccc",
        transition: "background-color 0.15s ease, color 0.15s ease",
        "&:hover": { backgroundColor: "rgba(255,255,255,0.05)", color: "white" },
    },
    activityItemActive: {
        color: "var(--bg-color)",
        backgroundColor: "rgba(var(--bg-color),0.1)",
        "&::before": {
            content: '""',
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: "3px",
            height: "24px",
            backgroundColor: "var(--primary-color)",
            borderRadius: "0 2px 2px 0",
        },
    },
    activityIcon: {
        width: "24px",
        height: "24px",
        filter: "brightness(0.8)",
    },
    activityIconActive: { filter: "brightness(1)" },
});

interface ActivityBarProps {
    onSidebarChange: (sidebar: string) => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ onSidebarChange }) => {
    const { activeSidebar, setActiveSidebar, theme } = useAppContext();
    const styles = useStyles();

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

    console.log(theme);

    return (
        <aside className={styles.root}>
            <div className={styles.header}>
                <div className={styles.appIcon} title="Power Platform Tool Box">
                    <img id="app-icon-img" src={`icons/${theme === "light" ? "light" : "dark"}/app-icon.svg`} alt="App Icon" />
                </div>
            </div>
            <nav className={styles.nav}>
                {activityItems.map((item) => {
                    const active = activeSidebar === item.id;
                    return (
                        <button
                            key={item.id}
                            className={`${styles.activityItem} ${active ? styles.activityItemActive : ""}`}
                            data-sidebar={item.id}
                            title={item.title}
                            onClick={() => handleItemClick(item.id)}
                        >
                            <img
                                src={`icons/${theme === "light" ? "light" : "dark"}/${item.icon}`}
                                alt={`${item.title} Icon`}
                                className={`${styles.activityIcon} ${active ? styles.activityIconActive : ""}`}
                            />
                        </button>
                    );
                })}
            </nav>
            <nav className={styles.footer}>
                {footerItems.map((item) => {
                    const active = activeSidebar === item.id;
                    return (
                        <button
                            key={item.id}
                            className={`${styles.activityItem} ${active ? styles.activityItemActive : ""}`}
                            data-sidebar={item.id}
                            title={item.title}
                            onClick={() => handleItemClick(item.id)}
                        >
                            <img src={`icons/dark/${item.icon}`} alt={`${item.title} Icon`} className={`${styles.activityIcon} ${active ? styles.activityIconActive : ""}`} />
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
};
