import { Link, makeStyles } from "@fluentui/react-components";
import React from "react";

const useStyles = makeStyles({
    view: {
        display: "flex",
        flex: 1,
        overflowY: "auto",
    },
    container: { maxWidth: "1200px", margin: "0 auto", padding: "48px 32px" },
    header: { textAlign: "center", marginBottom: "48px" },
    title: {
        fontSize: "36px",
        fontWeight: 700,
        background: "var(--pptb-gradient)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        marginBottom: "12px",
    },
    subtitle: { fontSize: "18px", color: "var(--text-color)", opacity: 0.7 },
    content: { display: "flex", flexDirection: "column", gap: "32px" },
    section: {
        backgroundColor: "var(--surface, #fff)",
        border: "1px solid var(--border-color)",
        borderRadius: "12px",
        padding: "24px",
        boxShadow: "var(--pptb-shadow-card)",
    },
    sectionIcon: {
        width: "48px",
        height: "48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--pptb-gradient)",
        borderRadius: "12px",
        color: "white",
        marginBottom: "16px",
        "& svg": { width: "24px", height: "24px" },
    },
    sectionTitle: { fontSize: "24px", fontWeight: 600, color: "var(--text-color)", marginBottom: "12px" },
    sectionDescription: { fontSize: "14px", color: "var(--text-color)", opacity: 0.8, marginBottom: "16px" },
    featureList: {
        listStyle: "none",
        padding: 0,
        margin: 0,
        "& li": {
            fontSize: "14px",
            color: "var(--text-color)",
            padding: "8px 0",
            borderBottom: "1px solid var(--border-color)",
            selectors: { "&:last-child": { borderBottom: "none" } },
        },
    },
    stepsList: {
        listStyle: "none",
        padding: 0,
        margin: 0,
        counterReset: "step-counter",
        "& li": {
            display: "flex",
            alignItems: "flex-start",
            gap: "16px",
            padding: "16px 0",
            borderBottom: "1px solid var(--border-color)",
            selectors: { "&:last-child": { borderBottom: "none" } },
        },
    },
    stepIcon: { fontSize: "24px", flexShrink: 0 },
    homeActions: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "16px",
        background: "transparent",
        border: "none",
        boxShadow: "none",
        padding: 0,
    },
    actionCard: {
        display: "flex",
        alignItems: "flex-start",
        gap: "16px",
        padding: "20px",
        backgroundColor: "var(--surface, #fff)",
        border: "1px solid var(--border-color)",
        borderRadius: "12px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        textDecoration: "none",
        color: "inherit",
        "&:hover": {
            border: "1px solid var(--primary-color)",
            boxShadow: "var(--pptb-shadow-fluent)",
            transform: "translateY(-2px)",
        },
    },
    actionIcon: {
        flexShrink: 0,
        width: "40px",
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--pptb-gradient)",
        borderRadius: "8px",
        color: "white",
        fontSize: "20px",
        "& svg": { width: "24px", height: "24px" },
    },
    actionContent: {
        flex: 1,
        "& h3": {
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--text-color)",
            margin: "0 0 4px 0",
        },
        "& p": { fontSize: "13px", color: "var(--text-color)", opacity: 0.7, margin: 0 },
    },
});

export const HomeView: React.FC = () => {
    const handleExternalLink = (url: string) => {
        window.api.invoke("shell:openExternal", url);
    };

    const styles = useStyles();
    return (
        <div className={styles.view} id="home-view">
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>Power Platform Tool Box</h1>
                    <p className={styles.subtitle}>A universal desktop app for Power Platform tools</p>
                </div>
                <div className={styles.content}>
                    {/* What's New Section */}
                    <section className={styles.section}>
                        <div className={styles.sectionIcon}>
                            <svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                <path d="M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.18-2.630 6.07 6.07 0 0 0 .29-5.12 5.94 5.94 0 0 0-2.23-2.8 5.82 5.82 0 0 0-4.59-.61 6 6 0 0 0-3.7 3.17 6.1 6.1 0 0 0 .24 5.58 5.93 5.93 0 0 0 3.39 2.78 5.82 5.82 0 0 0 3.42-.37z" />
                                <path d="M7.5 6h1v3h-1V6z" />
                                <path d="M8 10.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z" />
                            </svg>
                        </div>
                        <h2 className={styles.sectionTitle}>What's New</h2>
                        <p className={styles.sectionDescription}>Latest updates and features in Power Platform Tool Box:</p>
                        <ul className={styles.featureList}>
                            <li>🎨 Modern React-based UI with Fluent Design</li>
                            <li>🔧 Install and manage tools from the marketplace</li>
                            <li>🔗 Manage multiple Dataverse connections</li>
                            <li>⚙️ Customizable settings and themes</li>
                            <li>🔄 Automatic updates to keep your toolbox current</li>
                        </ul>
                    </section>

                    {/* Getting Started Section */}
                    <section className={styles.section}>
                        <div className={styles.sectionIcon}>
                            <svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                <path fillRule="evenodd" clipRule="evenodd" d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z" />
                            </svg>
                        </div>
                        <h2 className={styles.sectionTitle}>Getting Started</h2>
                        <p className={styles.sectionDescription}>Follow these steps to get started with Power Platform Tool Box:</p>
                        <ol className={styles.stepsList}>
                            <li>
                                <span className={styles.stepIcon}>📦</span>
                                <div>
                                    <strong>Install Tools:</strong> Browse the marketplace in the sidebar to discover and install tools
                                </div>
                            </li>
                            <li>
                                <span className={styles.stepIcon}>🔗</span>
                                <div>
                                    <strong>Add Connection:</strong> Set up your Dataverse environment connections in the connections panel
                                </div>
                            </li>
                            <li>
                                <span className={styles.stepIcon}>🚀</span>
                                <div>
                                    <strong>Launch Tools:</strong> Open installed tools from the tools sidebar and start working!
                                </div>
                            </li>
                        </ol>
                    </section>

                    {/* Action Buttons */}
                    <section className={`${styles.section} ${styles.homeActions}`}>
                        <Link className={styles.actionCard} onClick={() => handleExternalLink("https://github.com/sponsors/PowerPlatformToolBox")}>
                            <div className={styles.actionIcon}>❤️</div>
                            <div className={styles.actionContent}>
                                <h3>Sponsor This Project</h3>
                                <p>Support the development of Power Platform Tool Box</p>
                            </div>
                        </Link>

                        <Link className={styles.actionCard} onClick={() => handleExternalLink("https://github.com/PowerPlatformToolBox/desktop-app")}>
                            <div className={styles.actionIcon}>
                                <svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                    <path d="M7.976 0A7.977 7.977 0 0 0 0 7.976c0 3.522 2.3 6.507 5.431 7.584.392.049.538-.196.538-.392v-1.37c-2.201.49-2.69-1.076-2.69-1.076-.343-.93-.881-1.175-.881-1.175-.734-.489.048-.489.048-.489.783.049 1.224.832 1.224.832.734 1.223 1.859.88 2.3.685.048-.538.293-.88.489-1.076-1.762-.196-3.621-.881-3.621-3.964 0-.88.293-1.566.832-2.153-.05-.147-.343-.978.098-2.055 0 0 .685-.196 2.201.832.636-.196 1.322-.245 2.007-.245s1.37.098 2.006.245c1.517-1.027 2.202-.832 2.202-.832.44 1.077.146 1.908.097 2.104a3.16 3.16 0 0 1 .832 2.153c0 3.083-1.86 3.719-3.62 3.915.293.244.538.733.538 1.467v2.202c0 .196.146.44.538.392A7.984 7.984 0 0 0 16 7.976C15.951 3.572 12.38 0 7.976 0z" />
                                </svg>
                            </div>
                            <div className={styles.actionContent}>
                                <h3>View on GitHub</h3>
                                <p>Explore the source code and contribute</p>
                            </div>
                        </Link>
                    </section>
                </div>
            </div>
        </div>
    );
};
