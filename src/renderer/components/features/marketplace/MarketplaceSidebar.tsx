import React, { useState } from "react";
import { useToolsContext } from "../../../contexts/ToolsContext";

export const MarketplaceSidebar: React.FC = () => {
    const { marketplaceTools } = useToolsContext();
    const [searchQuery, setSearchQuery] = useState("");

    return (
        <div className="sidebar-content">
            <div className="sidebar-header">
                <h2 className="sidebar-title">MARKETPLACE</h2>
            </div>

            <div className="sidebar-search">
                <input type="text" className="fluent-input" placeholder="Search tools..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            <div className="sidebar-body">
                <div className="marketplace-tools-list-pptb">
                    {marketplaceTools.length === 0 ? (
                        <div className="sidebar-empty">
                            <p>Loading marketplace...</p>
                        </div>
                    ) : (
                        marketplaceTools.map((tool) => (
                            <div key={tool.id} className="tool-card-pptb" style={{ padding: "12px", marginBottom: "8px", border: "1px solid var(--border-color)", borderRadius: "6px" }}>
                                <h4 style={{ margin: "0 0 4px 0", fontSize: "13px" }}>{tool.name}</h4>
                                <p style={{ margin: "0", fontSize: "11px", opacity: 0.7 }}>{tool.description}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
