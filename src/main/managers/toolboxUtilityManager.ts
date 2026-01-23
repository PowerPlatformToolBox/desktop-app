import { clipboard } from "electron";
import { EventEmitter } from "events";
import { NotificationOptions, ToolBoxEvent, ToolBoxEventPayload } from "../../common/types";

/**
 * ToolBox API that provides events and functionality to tools
 */
export class ToolBoxUtilityManager extends EventEmitter {
    private eventHistory: ToolBoxEventPayload[] = [];

    constructor() {
        super();
    }

    /**
     * Show a notification to the user
     * This emits an event that will be handled by the renderer process using the custom PPTB notification system
     */
    showNotification(options: NotificationOptions): void {
        // Emit event to be handled by renderer
        this.emitEvent(ToolBoxEvent.NOTIFICATION_SHOWN, options);
    }

    /**
     * Copy text to clipboard
     */
    copyToClipboard(text: string): void {
        clipboard.writeText(text);
    }

    /**
     * Emit a ToolBox event
     */
    emitEvent(event: ToolBoxEvent, data: unknown): void {
        const payload: ToolBoxEventPayload = {
            event,
            data,
            timestamp: new Date().toISOString(),
        };

        this.eventHistory.push(payload);
        this.emit(event, payload);
    }

    /**
     * Get event history
     */
    getEventHistory(limit?: number): ToolBoxEventPayload[] {
        if (limit) {
            return this.eventHistory.slice(-limit);
        }
        return [...this.eventHistory];
    }

    /**
     * Clear event history
     */
    clearEventHistory(): void {
        this.eventHistory = [];
    }

    /**
     * Subscribe to a specific event
     */
    subscribe(event: ToolBoxEvent, callback: (payload: ToolBoxEventPayload) => void): void {
        this.on(event, callback);
    }

    /**
     * Unsubscribe from a specific event
     */
    unsubscribe(event: ToolBoxEvent, callback: (payload: ToolBoxEventPayload) => void): void {
        this.off(event, callback);
    }
}
