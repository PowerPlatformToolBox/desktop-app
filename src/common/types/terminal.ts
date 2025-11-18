/**
 * Terminal-related type definitions
 */

/**
 * Terminal configuration options
 */
export interface TerminalOptions {
    name: string;
    shell?: string;
    cwd?: string;
    env?: Record<string, string>;
    visible?: boolean; // Whether terminal should be visible initially (default: true)
}

/**
 * Terminal instance
 */
export interface Terminal {
    id: string;
    name: string;
    toolId: string;
    shell: string;
    cwd: string;
    isVisible: boolean;
    createdAt: string;
}

/**
 * Terminal command execution result
 */
export interface TerminalCommandResult {
    terminalId: string;
    commandId: string;
    output?: string;
    exitCode?: number;
    error?: string;
}

/**
 * Terminal event types
 */
export enum TerminalEvent {
    TERMINAL_CREATED = "terminal:created",
    TERMINAL_CLOSED = "terminal:closed",
    TERMINAL_OUTPUT = "terminal:output",
    TERMINAL_COMMAND_COMPLETED = "terminal:command:completed",
    TERMINAL_ERROR = "terminal:error",
}

/**
 * Type guard to check if an object is a valid Terminal
 */
export function isTerminal(obj: unknown): obj is Terminal {
    if (!obj || typeof obj !== "object") return false;
    const terminal = obj as Record<string, unknown>;
    return (
        typeof terminal.id === "string" &&
        typeof terminal.name === "string" &&
        typeof terminal.toolId === "string" &&
        typeof terminal.shell === "string" &&
        typeof terminal.cwd === "string" &&
        typeof terminal.isVisible === "boolean" &&
        typeof terminal.createdAt === "string"
    );
}
