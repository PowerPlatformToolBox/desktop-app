/**
 * IPC Handler Utilities
 * Common patterns for IPC handlers including error handling and validation
 */

import { IpcMainInvokeEvent } from "electron";

/**
 * Wraps an IPC handler with error handling
 */
export function withErrorHandling<T>(
    handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T,
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> {
    return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        try {
            return await handler(event, ...args);
        } catch (error) {
            console.error("IPC Handler Error:", error);
            throw error;
        }
    };
}

/**
 * Creates a simple IPC handler that calls a manager method
 */
export function createSimpleHandler<T>(method: (...args: unknown[]) => T | Promise<T>) {
    return async (_event: IpcMainInvokeEvent, ...args: unknown[]) => {
        return await method(...args);
    };
}

/**
 * Creates an IPC handler with error wrapping
 */
export function createHandlerWithError<T>(method: (...args: unknown[]) => T | Promise<T>, errorPrefix: string) {
    return async (_event: IpcMainInvokeEvent, ...args: unknown[]) => {
        try {
            return await method(...args);
        } catch (error) {
            throw new Error(`${errorPrefix}: ${(error as Error).message}`);
        }
    };
}
