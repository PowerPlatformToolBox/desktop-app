import React from "react";
import { Button, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem } from "@fluentui/react-components";
import { MoreHorizontal20Regular, Play20Regular } from "@fluentui/react-icons";
import "./ToolCard.scss";

interface Tool {
    id: string;
    name: string;
    description: string;
    author?: string;
    version?: string;
    icon?: string;
    category?: string;
}

interface ToolCardProps {
    tool: Tool;
    onLaunch: (toolId: string) => void;
    onUninstall?: (toolId: string) => void;
}

export const ToolCard: React.FC<ToolCardProps> = ({ tool, onLaunch, onUninstall }) => {
    const handleLaunch = (e: React.MouseEvent) => {
        e.stopPropagation();
        onLaunch(tool.id);
    };

    const handleUninstall = () => {
        if (onUninstall) {
            onUninstall(tool.id);
        }
    };

    return (
        <div className="tool-card-pptb" onClick={handleLaunch}>
            <div className="tool-card-icon">
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

            <div className="tool-card-details">
                <div className="tool-card-header">
                    <h4 className="tool-card-name">{tool.name}</h4>
                    <div className="tool-card-actions">
                        <Button icon={<Play20Regular />} size="small" appearance="subtle" onClick={handleLaunch} title="Launch tool" />
                        {onUninstall && (
                            <Menu>
                                <MenuTrigger disableButtonEnhancement>
                                    <Button icon={<MoreHorizontal20Regular />} size="small" appearance="subtle" onClick={(e) => e.stopPropagation()} />
                                </MenuTrigger>
                                <MenuPopover>
                                    <MenuList>
                                        <MenuItem onClick={handleUninstall}>Uninstall</MenuItem>
                                    </MenuList>
                                </MenuPopover>
                            </Menu>
                        )}
                    </div>
                </div>
                <p className="tool-card-description">{tool.description}</p>
                {tool.author && <p className="tool-card-author">by {tool.author}</p>}
                {tool.version && <span className="tool-card-version">v{tool.version}</span>}
            </div>
        </div>
    );
};
