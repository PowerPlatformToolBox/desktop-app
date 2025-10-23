import { writable, type Writable } from 'svelte/store';
import { onMount } from 'svelte';

export type LogEntry = {
    timestamp: Date;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
};

export function createConnectionStore() {
    const connection: Writable<ToolBoxAPI.DataverseConnection | null> = writable(null);
    const isLoading = writable(true);

    const refreshConnection = async () => {
        try {
            const conn = await window.toolboxAPI.connections.getActiveConnection();
            connection.set(conn);
        } catch (error) {
            console.error('Error refreshing connection:', error);
        } finally {
            isLoading.set(false);
        }
    };

    return { connection, isLoading, refreshConnection };
}

export function createEventLog() {
    const logs = writable<LogEntry[]>([]);

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        logs.update((current) => {
            const newLogs = [
                {
                    timestamp: new Date(),
                    message,
                    type,
                },
                ...current,
            ];

            // Keep only last 50 entries
            return newLogs.slice(0, 50);
        });

        console.log(`[${type.toUpperCase()}] ${message}`);
    };

    const clearLogs = () => {
        logs.set([]);
    };

    return { logs, addLog, clearLogs };
}

export function setupEventListeners(callback: (event: string, data: any) => void) {
    onMount(() => {
        const handler = (_event: any, payload: ToolBoxAPI.ToolBoxEventPayload) => {
            callback(payload.event, payload.data);
        };

        window.toolboxAPI.events.on(handler);
    });
}
