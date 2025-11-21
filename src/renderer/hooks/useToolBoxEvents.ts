import { useEffect } from "react";

interface NotificationOptions {
    title: string;
    body: string;
    type?: "info" | "success" | "warning" | "error";
    duration?: number;
    actions?: Array<{ label: string; callback: string }>;
}

interface ToolboxEventPayload {
    event: string;
    data: unknown;
    timestamp: string;
}

/**
 * Hook to handle toolbox events including notifications
 * Listens for toolbox events and displays notifications via the NotificationWindowManager
 *
 * This hook should be used once at the app level to set up global event listeners
 * for notifications triggered by tools or other parts of the application.
 */
export const useToolBoxEvents = () => {
    useEffect(() => {
        const handleToolboxEvent = (_event: unknown, payload: unknown) => {
            const eventPayload = payload as ToolboxEventPayload;
            console.log("ToolBox Event:", eventPayload);

            // Handle notifications using PPTB notification system
            // Tools call window.pptoolbox.utils.showNotification() which emits "notification:shown" events
            if (eventPayload.event === "notification:shown") {
                const notificationData = eventPayload.data as NotificationOptions;

                // Send to notification window manager via IPC
                // The NotificationWindowManager displays notifications in a dedicated window
                window.api.invoke("notification:show", {
                    title: notificationData.title,
                    body: notificationData.body,
                    type: notificationData.type || "info",
                    duration: notificationData.duration || 5000,
                    actions: notificationData.actions,
                });
            }

            // NOTE: Connection and tool reload events are handled by their respective contexts
            // Terminal events are handled by terminal-specific hooks
        };

        // Listen for toolbox events
        // NOTE: With BrowserView, events are forwarded to tools via IPC through the toolPreloadBridge
        // No need to forward via postMessage as tools are in separate renderer processes
        // The backend ToolWindowManager handles event forwarding to BrowserView instances
        window.toolboxAPI.events.on(handleToolboxEvent);

        // Note: No cleanup since window.toolboxAPI.events.off expects a different signature
        // The listener will remain active for the lifetime of the app
    }, []);
};
