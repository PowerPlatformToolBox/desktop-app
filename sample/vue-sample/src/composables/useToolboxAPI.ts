import { ref, onMounted, type Ref } from 'vue';

export type LogEntry = {
    timestamp: Date;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
};

export function useConnection() {
    const connection: Ref<ToolBoxAPI.DataverseConnection | null> = ref(null);
    const isLoading = ref(true);

    const refreshConnection = async () => {
        try {
            const conn = await window.toolboxAPI.connections.getActiveConnection();
            connection.value = conn;
        } catch (error) {
            console.error('Error refreshing connection:', error);
        } finally {
            isLoading.value = false;
        }
    };

    onMounted(() => {
        refreshConnection();
    });

    return { connection, isLoading, refreshConnection };
}

export function useToolboxEvents(callback: (event: string, data: any) => void) {
    onMounted(() => {
        const handler = (_event: any, payload: ToolBoxAPI.ToolBoxEventPayload) => {
            callback(payload.event, payload.data);
        };

        window.toolboxAPI.events.on(handler);
    });
}

export function useEventLog() {
    const logs = ref<LogEntry[]>([]);

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        logs.value.unshift({
            timestamp: new Date(),
            message,
            type,
        });

        // Keep only last 50 entries
        if (logs.value.length > 50) {
            logs.value = logs.value.slice(0, 50);
        }

        console.log(`[${type.toUpperCase()}] ${message}`);
    };

    const clearLogs = () => {
        logs.value = [];
    };

    return { logs, addLog, clearLogs };
}
