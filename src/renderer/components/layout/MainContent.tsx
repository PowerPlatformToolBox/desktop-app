import React from "react";
import { useAppContext } from "../../contexts/AppContext";
import { useToolsContext } from "../../contexts/ToolsContext";
import { HomeView } from "./HomeView";
import "./MainContent.scss";

export const MainContent: React.FC = () => {
    const { activeView } = useAppContext();
    const { openTools, activeToolId, closeTool, switchToTool } = useToolsContext();

    const hasOpenTools = openTools.size > 0;

    const handleCloseTool = (toolId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        closeTool(toolId);
    };

    const handleCloseAllTools = () => {
        Array.from(openTools.keys()).forEach((toolId) => closeTool(toolId));
    };

    const handleSwitchTool = (toolId: string) => {
        switchToTool(toolId);
    };

    return (
        <main className="main-content">
            {/* Tool Panel (for launched tools) */}
            {hasOpenTools && (
                <div className="tool-panel">
                    <div className="tool-panel-header">
                        <div className="tool-tabs" id="tool-tabs">
                            {Array.from(openTools.entries()).map(([toolId, openTool]) => (
                                <div key={toolId} className={`tool-tab ${activeToolId === toolId ? "active" : ""}`} onClick={() => handleSwitchTool(toolId)}>
                                    <span className="tool-tab-name">{openTool.tool.name}</span>
                                    <button className="tool-tab-close" onClick={(e) => handleCloseTool(toolId, e)} title="Close">
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="tool-panel-controls">
                            <button className="btn-icon" onClick={handleCloseAllTools} title="Close all tools">
                                ✕
                            </button>
                        </div>
                    </div>
                    <div className="tool-panel-content-wrapper">
                        <div className="tool-panel-content" id="tool-panel-content">
                            {/* BrowserView tools are rendered here by the backend ToolWindowManager */}
                        </div>
                    </div>
                </div>
            )}

            {/* Home/Welcome View */}
            {!hasOpenTools && activeView === "home" && <HomeView />}
        </main>
    );
};
