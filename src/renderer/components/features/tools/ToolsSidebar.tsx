import React, { useState, useMemo } from "react";
import { Button } from "@fluentui/react-components";
import { useToolsContext } from "../../../contexts/ToolsContext";
import { ToolCard } from "./ToolCard";
import "./ToolsSidebar.scss";

export const ToolsSidebar: React.FC = () => {
    const { installedTools, launchTool } = useToolsContext();
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
                tool.category?.toLowerCase().includes(query)
        );
    }, [installedTools, searchQuery]);

    const handleLaunchTool = async (toolId: string) => {
        await launchTool(toolId);
    };

    return (
        <div className="sidebar-content">
            <div className="sidebar-header">
                <h2 className="sidebar-title">INSTALLED</h2>
            </div>

            <div className="sidebar-search">
                <input type="text" className="fluent-input" placeholder="Search installed tools..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            <div className="sidebar-body">
                <div className="tools-list-pptb">
                    {filteredTools.length === 0 ? (
                        <div className="sidebar-empty">
                            <svg width="48" height="48" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M9.5 1.1l3.4 3.5.1.4v2h-1V5.5L8 5v-.5l.5-.5h1.6L7.9 1.8 7.5 1.1h2zM9 2v3h3V4H9.7L9 2zM1 14.5V13h1.5v1.5H4V16H1.5v-1.5H1zm6.5 0V13H9v1.5h1.5V16H8v-1.5H6.5zm6 0V13H15v1.5h-1.5V16H12v-1.5h-1.5zM7 7H1.5L1 6.5v-5l.5-.5h5l.5.5V7zm-1-5H2v4h4V2zm7.5 7h-2.25v1.5h2.25V10H15v3.5h-1.5V12zm-8.25 0H3v1.5h2.25V10H7v3.5H5.25V12zm5.5-2H9.25v1.5h1.5V10h1.5v3.5H10.5V12h-.75v-1.5z"
                                />
                            </svg>
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
                        filteredTools.map((tool) => <ToolCard key={tool.id} tool={tool} onLaunch={handleLaunchTool} />)
                    )}
                </div>
            </div>
        </div>
    );
};
