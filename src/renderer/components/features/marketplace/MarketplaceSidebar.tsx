import { Badge, Button, Input, makeStyles } from "@fluentui/react-components";
import React, { useMemo, useState } from "react";
import { useToolsContext } from "../../../contexts/ToolsContext";

interface MarketplaceTool {
    id: string;
    name: string;
    description: string;
    author?: string;
    icon?: string;
}

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
    search: { padding: "8px 16px", borderBottom: "1px solid var(--border-color)" },
    body: { flex: 1, overflowY: "auto", padding: "8px" },
    list: { display: "flex", flexDirection: "column", gap: "12px" },
    card: {
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "12px",
        backgroundColor: "var(--bg-color)",
        border: "1px solid var(--border-color)",
        borderRadius: "6px",
        transition: "all 0.2s ease",
        "&:hover": { border: "1px solid var(--primary-color)", boxShadow: "var(--shadow)" },
    },
    cardIcon: {
        flexShrink: 0,
        width: "40px",
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--primary-color)",
        "& img": { width: "100%", height: "100%", objectFit: "contain" },
        "& svg": { width: "32px", height: "32px" },
    },
    cardDetails: { flex: 1, minWidth: 0 },
    cardHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        marginBottom: "4px",
    },
    cardName: {
        fontSize: "13px",
        fontWeight: 600,
        color: "var(--text-color)",
        margin: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    cardDescription: {
        fontSize: "12px",
        color: "var(--text-color)",
        opacity: 0.7,
        margin: "0 0 4px 0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: "-webkit-box",
        WebkitLineClamp: "2",
        WebkitBoxOrient: "vertical",
    },
    cardAuthor: { fontSize: "11px", color: "var(--text-color)", opacity: 0.6, margin: "0 0 8px 0" },
    cardActions: { display: "flex", gap: "8px", marginTop: "8px" },
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
});

export const MarketplaceSidebar: React.FC = () => {
    const { marketplaceTools, installedTools, installTool } = useToolsContext();
    const [searchQuery, setSearchQuery] = useState("");

    const filteredTools = useMemo(() => {
        if (!searchQuery.trim()) {
            return marketplaceTools;
        }

        const query = searchQuery.toLowerCase();
        return marketplaceTools.filter((tool) => tool.name?.toLowerCase().includes(query) || tool.description?.toLowerCase().includes(query) || tool.author?.toLowerCase().includes(query));
    }, [marketplaceTools, searchQuery]);

    const isToolInstalled = (toolId: string) => {
        return installedTools.some((tool) => tool.id === toolId);
    };

    const handleInstall = async (tool: MarketplaceTool) => {
        await installTool(tool);
    };

    const styles = useStyles();
    return (
        <div className={styles.content}>
            <div className={styles.header}>
                <h2 className={styles.title}>MARKETPLACE</h2>
            </div>
            <div className={styles.search}>
                <Input type="text" placeholder="Search tools..." value={searchQuery} onChange={(e, data) => setSearchQuery(data.value)} />
            </div>
            <div className={styles.body}>
                <div className={styles.list}>
                    {filteredTools.length === 0 ? (
                        <div className={styles.empty}>{searchQuery ? <p>No tools match your search</p> : <p>Loading marketplace...</p>}</div>
                    ) : (
                        filteredTools.map((tool) => {
                            const installed = isToolInstalled(tool.id);
                            return (
                                <div key={tool.id} className={styles.card}>
                                    <div className={styles.cardIcon}>
                                        {tool.icon ? (
                                            <img src={tool.icon} alt={`${tool.name} icon`} />
                                        ) : (
                                            <svg width="32" height="32" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                                <path
                                                    fillRule="evenodd"
                                                    clipRule="evenodd"
                                                    d="M9.5 1.1l3.4 3.5.1.4v2h-1V5.5L8 5v-.5l.5-.5h1.6L7.9 1.8 7.5 1.1h2zM9 2v3h3V4H9.7L9 2zM1 14.5V13h1.5v1.5H4V16H1.5v-1.5H1zm6.5 0V13H9v1.5h1.5V16H8v-1.5H6.5zm6 0V13H15v1.5h-1.5V16H12v-1.5h-1.5zM7 7H1.5L1 6.5v-5l.5-.5h5l.5.5V7zm-1-5H2v4h4V2zm7.5 7h-2.25v1.5h2.25V10H15v3.5h-1.5V12zm-8.25 0H3v1.5h2.25V10H7v3.5H5.25V12zm5.5-2H9.25v1.5h1.5V10h1.5v3.5H10.5V12h-.75v-1.5z"
                                                />
                                            </svg>
                                        )}
                                    </div>
                                    <div className={styles.cardDetails}>
                                        <div className={styles.cardHeader}>
                                            <h4 className={styles.cardName}>{tool.name}</h4>
                                            {installed && (
                                                <Badge appearance="filled" color="success" size="small">
                                                    Installed
                                                </Badge>
                                            )}
                                        </div>
                                        <p className={styles.cardDescription}>{tool.description}</p>
                                        {tool.author && <p className={styles.cardAuthor}>by {tool.author}</p>}
                                        <div className={styles.cardActions}>
                                            <Button appearance="primary" size="small" onClick={() => handleInstall(tool)} disabled={installed}>
                                                {installed ? "Installed" : "Install"}
                                            </Button>
                                        </div>
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
