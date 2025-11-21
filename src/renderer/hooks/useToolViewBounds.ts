import { useEffect } from "react";

/**
 * Hook to handle tool view bounds updates for BrowserView positioning
 * Listens for bounds requests from main process and responds with current bounds
 */
export const useToolViewBounds = () => {
    useEffect(() => {
        const handleBoundsRequest = () => {
            const toolPanelContent = document.getElementById("tool-panel-content");

            if (toolPanelContent) {
                const rect = toolPanelContent.getBoundingClientRect();

                // The tool-panel-content is inside tool-panel-content-wrapper which uses flex:1
                // When terminal is visible, the wrapper automatically shrinks to accommodate it
                // So we can use the actual bounds of tool-panel-content directly
                const bounds = {
                    x: Math.round(rect.left),
                    y: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                };
                console.log("[Renderer] Sending tool panel bounds:", bounds);
                window.api.send("get-tool-panel-bounds-response", bounds);
            } else {
                console.warn("[Renderer] Tool panel content element not found");
            }
        };

        // Set up listener once on mount
        // The handler checks if element exists before responding
        window.api.on("get-tool-panel-bounds-request", handleBoundsRequest);

        // Note: No cleanup since window.api doesn't expose removeListener
        // The handler is harmless if called when no tools are open (element won't exist)
    }, []);
};
