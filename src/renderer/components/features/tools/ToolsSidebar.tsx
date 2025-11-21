import { Input } from "@fluentui/react-components";
import { DismissCircleColor } from "@fluentui/react-icons";
import React, { useMemo, useState } from "react";
import { useToolsContext } from "../../../contexts/ToolsContext";
import { ToolCard } from "./ToolCard";
import "./ToolsSidebar.scss";

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

    return (
        <div className="sidebar-content">
            <div className="sidebar-header">
                <h2 className="sidebar-title">INSTALLED</h2>
            </div>

            <div className="sidebar-search">
                <Input type="text" placeholder="Search installed tools..." value={searchQuery} onChange={(e, data) => setSearchQuery(data.value)} />
            </div>

            <div className="sidebar-body">
                <div className="tools-list-pptb">
                    {filteredTools.length === 0 ? (
                        <div className="sidebar-empty">
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
