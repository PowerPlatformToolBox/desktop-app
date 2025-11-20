import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface Tool {
    id: string;
    name: string;
    description: string;
    author?: string;
    version?: string;
    icon?: string;
    category?: string;
    [key: string]: any;
}

interface OpenTool {
    id: string;
    tool: Tool;
    isPinned: boolean;
    connectionId: string | null;
}

interface ToolsContextType {
    installedTools: Tool[];
    marketplaceTools: Tool[];
    openTools: Map<string, OpenTool>;
    activeToolId: string | null;
    loadInstalledTools: () => Promise<void>;
    loadMarketplaceTools: () => Promise<void>;
    launchTool: (toolId: string) => Promise<void>;
    closeTool: (toolId: string) => void;
    switchToTool: (toolId: string) => void;
    installTool: (tool: Tool) => Promise<void>;
    uninstallTool: (toolId: string) => Promise<void>;
}

const ToolsContext = createContext<ToolsContextType | undefined>(undefined);

export const useToolsContext = () => {
    const context = useContext(ToolsContext);
    if (!context) {
        throw new Error("useToolsContext must be used within ToolsProvider");
    }
    return context;
};

interface ToolsProviderProps {
    children: ReactNode;
}

export const ToolsProvider: React.FC<ToolsProviderProps> = ({ children }) => {
    const [installedTools, setInstalledTools] = useState<Tool[]>([]);
    const [marketplaceTools, setMarketplaceTools] = useState<Tool[]>([]);
    const [openTools, setOpenTools] = useState<Map<string, OpenTool>>(new Map());
    const [activeToolId, setActiveToolId] = useState<string | null>(null);

    const loadInstalledTools = async () => {
        try {
            const tools = await window.toolboxAPI.getAllTools();
            setInstalledTools(tools);
        } catch (error) {
            console.error("Failed to load installed tools:", error);
        }
    };

    const loadMarketplaceTools = async () => {
        try {
            const tools = await window.toolboxAPI.fetchRegistryTools();
            setMarketplaceTools(
                tools.map((tool: any) => ({
                    id: tool.id,
                    name: tool.name,
                    description: tool.description,
                    author: tool.author,
                    category: tool.tags?.[0] || "Tools",
                    version: tool.version,
                    icon: tool.icon,
                    downloadUrl: tool.downloadUrl,
                    tags: tool.tags || [],
                }))
            );
        } catch (error) {
            console.error("Failed to load marketplace tools:", error);
        }
    };

    const launchTool = async (toolId: string) => {
        try {
            // If tool is already open, just switch to it
            if (openTools.has(toolId)) {
                switchToTool(toolId);
                return;
            }

            const tool = await window.toolboxAPI.getTool(toolId);

            // Check if tool requires CSP exceptions
            if (tool.cspExceptions && Object.keys(tool.cspExceptions).length > 0) {
                // TODO: Show CSP consent dialog
                // For now, proceed with launch
            }

            // Launch the tool
            await window.toolboxAPI.launchToolWindow(toolId, tool);

            // Add to open tools
            const newOpenTool: OpenTool = {
                id: toolId,
                tool,
                isPinned: false,
                connectionId: null,
            };

            setOpenTools((prev) => new Map(prev).set(toolId, newOpenTool));
            setActiveToolId(toolId);
        } catch (error) {
            console.error("Failed to launch tool:", error);
            await window.toolboxAPI.utils.showNotification({
                title: "Launch Failed",
                body: `Failed to launch tool: ${(error as Error).message}`,
                type: "error",
            });
        }
    };

    const closeTool = (toolId: string) => {
        window.toolboxAPI.closeToolWindow(toolId);
        setOpenTools((prev) => {
            const newMap = new Map(prev);
            newMap.delete(toolId);
            return newMap;
        });

        // If closing active tool, switch to another or home
        if (activeToolId === toolId) {
            const remaining = Array.from(openTools.keys()).filter((id) => id !== toolId);
            setActiveToolId(remaining.length > 0 ? remaining[0] : null);
        }
    };

    const switchToTool = (toolId: string) => {
        window.toolboxAPI.switchToolWindow(toolId);
        setActiveToolId(toolId);
    };

    const installTool = async (tool: Tool) => {
        try {
            // Use tool id as package name for registry tools
            await window.toolboxAPI.installTool(tool.id);
            await loadInstalledTools();
            await window.toolboxAPI.utils.showNotification({
                title: "Tool Installed",
                body: `${tool.name} has been installed successfully.`,
                type: "success",
            });
        } catch (error) {
            console.error("Failed to install tool:", error);
            await window.toolboxAPI.utils.showNotification({
                title: "Installation Failed",
                body: `Failed to install ${tool.name}: ${(error as Error).message}`,
                type: "error",
            });
        }
    };

    const uninstallTool = async (toolId: string) => {
        try {
            const tool = await window.toolboxAPI.getTool(toolId);
            await window.toolboxAPI.uninstallTool(tool.id, toolId);
            await loadInstalledTools();
            await window.toolboxAPI.utils.showNotification({
                title: "Tool Uninstalled",
                body: `${tool.name} has been uninstalled.`,
                type: "success",
            });
        } catch (error) {
            console.error("Failed to uninstall tool:", error);
            await window.toolboxAPI.utils.showNotification({
                title: "Uninstall Failed",
                body: `Failed to uninstall tool: ${(error as Error).message}`,
                type: "error",
            });
        }
    };

    // Load tools on mount
    useEffect(() => {
        loadInstalledTools();
        loadMarketplaceTools();
    }, []);

    const value: ToolsContextType = {
        installedTools,
        marketplaceTools,
        openTools,
        activeToolId,
        loadInstalledTools,
        loadMarketplaceTools,
        launchTool,
        closeTool,
        switchToTool,
        installTool,
        uninstallTool,
    };

    return <ToolsContext.Provider value={value}>{children}</ToolsContext.Provider>;
};
