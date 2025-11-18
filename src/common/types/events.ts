/**
 * Event-related type definitions
 */

/**
 * Event types that can be emitted by the ToolBox API
 */
export enum ToolBoxEvent {
    TOOL_LOADED = "tool:loaded",
    TOOL_UNLOADED = "tool:unloaded",
    CONNECTION_CREATED = "connection:created",
    CONNECTION_UPDATED = "connection:updated",
    CONNECTION_DELETED = "connection:deleted",
    SETTINGS_UPDATED = "settings:updated",
    NOTIFICATION_SHOWN = "notification:shown",
    TERMINAL_CREATED = "terminal:created",
    TERMINAL_CLOSED = "terminal:closed",
    TERMINAL_OUTPUT = "terminal:output",
    TERMINAL_COMMAND_COMPLETED = "terminal:command:completed",
    TERMINAL_ERROR = "terminal:error",
}

/**
 * Event payload for ToolBox events
 */
export interface ToolBoxEventPayload {
    event: ToolBoxEvent;
    data: unknown;
    timestamp: string;
}
