import { Input, makeStyles } from "@fluentui/react-components";
import { DismissCircleColor } from "@fluentui/react-icons";
import React, { useMemo, useState } from "react";
import { useToolsContext } from "../../../contexts/ToolsContext";
import { ToolCard } from "./ToolCard";

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
        fontWeight: 800,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        color: "var(--text-color)",
        opacity: 0.8,
        margin: 0,
    },
    search: { padding: "8px 16px", borderBottom: "1px solid var(--border-color)" },
    searchInput: { width: "100%" },
    body: { flex: 1, overflowY: "auto", padding: "8px" },
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
        "& svg": { width: "48px", height: "48px", marginBottom: "16px", opacity: 0.5 },
        "& p": { fontSize: "13px", margin: 0 },
    },
    list: { display: "flex", flexDirection: "column", gap: "8px" },
});

export const ToolsSidebar: React.FC = () => {
    const { installedTools, launchTool, uninstallTool } = useToolsContext();
    const [searchQuery, setSearchQuery] = useState("");

    const filteredTools = useMemo(() => {
        if (!searchQuery.trim()) {
            return installedTools;
        }

        const query = searchQuery.toLowerCase();
        return installedTools.filter(
            (tool) =>
                tool.name.toLowerCase().includes(query) ||
                tool.description?.toLowerCase().includes(query) ||
                tool.author?.toLowerCase().includes(query) ||
                tool.category?.toLowerCase().includes(query),
        );
    }, [installedTools, searchQuery]);

    const handleLaunchTool = async (toolId: string) => {
        await launchTool(toolId);
    };

    const handleUninstallTool = async (toolId: string) => {
        if (confirm("Are you sure you want to uninstall this tool?")) {
            await uninstallTool(toolId);
        }
    };

    const styles = useStyles();
    return (
        <div className={styles.content}>
            <div className={styles.header}>
                <h2 className={styles.title}>INSTALLED</h2>
            </div>
            <div className={styles.search}>
                <Input className={styles.searchInput} type="text" placeholder="Search installed tools..." value={searchQuery} onChange={(e, data) => setSearchQuery(data.value)} />
            </div>
            <div className={styles.body}>
                <div className={styles.list}>
                    {filteredTools.length === 0 ? (
                        <div className={styles.empty}>
                            <DismissCircleColor />
                            {searchQuery ? (
                                <p>No tools match your search</p>
                            ) : (
                                <>
                                    <p>No tools installed</p>
                                    <p style={{ fontSize: "11px", marginTop: "8px" }}>Browse the marketplace to install tools</p>
                                </>
                            )}
                        </div>
                    ) : (
                        filteredTools.map((tool) => <ToolCard key={tool.id} tool={tool} onLaunch={handleLaunchTool} onUninstall={handleUninstallTool} />)
                    )}
                </div>
            </div>
        </div>
    );
};
