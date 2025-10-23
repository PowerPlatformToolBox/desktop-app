<template>
    <header class="header">
        <h1>💚 Vue Sample Tool</h1>
        <p class="subtitle">A complete example of building Power Platform Tool Box tools with Vue 3 & TypeScript</p>
    </header>

    <ConnectionStatus :connection="connection" :isLoading="isLoading" />

    <ToolboxAPIDemo @log="addLog" />

    <DataverseAPIDemo :connection="connection" @log="addLog" />

    <EventLog :logs="logs" @clear="clearLogs" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import ConnectionStatus from './components/ConnectionStatus.vue';
import ToolboxAPIDemo from './components/ToolboxAPIDemo.vue';
import DataverseAPIDemo from './components/DataverseAPIDemo.vue';
import EventLog from './components/EventLog.vue';
import { useConnection, useToolboxEvents, useEventLog } from './composables/useToolboxAPI';

const { connection, isLoading, refreshConnection } = useConnection();
const { logs, addLog, clearLogs } = useEventLog();

// Handle platform events
const handleEvent = (event: string, _data: any) => {
    addLog(`Event: ${event}`, 'info');

    switch (event) {
        case 'connection:updated':
        case 'connection:created':
            refreshConnection();
            break;

        case 'connection:deleted':
            refreshConnection();
            break;
    }
};

useToolboxEvents(handleEvent);

// Add initial log
onMounted(() => {
    addLog('Vue Sample Tool initialized', 'success');
});
</script>
