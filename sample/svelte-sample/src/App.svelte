<script lang="ts">
    import { onMount } from 'svelte';
    import ConnectionStatus from './lib/ConnectionStatus.svelte';
    import ToolboxAPIDemo from './lib/ToolboxAPIDemo.svelte';
    import DataverseAPIDemo from './lib/DataverseAPIDemo.svelte';
    import EventLog from './lib/EventLog.svelte';
    import { createConnectionStore, createEventLog, setupEventListeners } from './lib/stores';

    const { connection, isLoading, refreshConnection } = createConnectionStore();
    const { logs, addLog, clearLogs } = createEventLog();

    // Handle platform events
    setupEventListeners((event: string, _data: any) => {
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
    });

    // Initialize
    onMount(() => {
        refreshConnection();
        addLog('Svelte Sample Tool initialized', 'success');
    });

    function handleLog(event: CustomEvent<{ message: string; type?: 'info' | 'success' | 'warning' | 'error' }>) {
        addLog(event.detail.message, event.detail.type);
    }
</script>

<header class="header">
    <h1>🔥 Svelte Sample Tool</h1>
    <p class="subtitle">A complete example of building Power Platform Tool Box tools with Svelte 5 & TypeScript</p>
</header>

<ConnectionStatus connection={$connection} isLoading={$isLoading} />

<ToolboxAPIDemo on:log={handleLog} />

<DataverseAPIDemo connection={$connection} on:log={handleLog} />

<EventLog logs={$logs} onClear={clearLogs} />
