import { useState, useEffect, useCallback } from 'react';

export type LogEntry = {
    timestamp: Date;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
};

export function useConnection() {
    const [connection, setConnection] = useState<ToolBoxAPI.DataverseConnection | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshConnection = useCallback(async () => {
        try {
            const conn = await window.toolboxAPI.connections.getActiveConnection();
            setConnection(conn);
        } catch (error) {
            console.error('Error refreshing connection:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshConnection();
    }, [refreshConnection]);

    return { connection, isLoading, refreshConnection };
}

export function useToolboxEvents(onEvent: (event: string, data: any) => void) {
    useEffect(() => {
        const handler = (_event: any, payload: ToolBoxAPI.ToolBoxEventPayload) => {
            onEvent(payload.event, payload.data);
        };

        window.toolboxAPI.events.on(handler);

        return () => {
            // Note: Current API doesn't support unsubscribe
            // This would need to be added to the API
        };
    }, [onEvent]);
}

export function useEventLog() {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
        setLogs((prev) => [
            {
                timestamp: new Date(),
                message,
                type,
            },
            ...prev.slice(0, 49), // Keep last 50 entries
        ]);
        console.log(`[${type.toUpperCase()}] ${message}`);
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    return { logs, addLog, clearLogs };
}
