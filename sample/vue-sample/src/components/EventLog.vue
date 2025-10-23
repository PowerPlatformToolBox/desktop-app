<template>
    <div class="card">
        <h2>📋 Event Log</h2>
        <button @click="$emit('clear')" class="btn btn-secondary">Clear Log</button>
        <div class="log">
            <div v-if="logs.length === 0" style="color: #666; font-style: italic">No logs yet...</div>
            <div v-for="(log, index) in logs" :key="index" :class="`log-entry ${log.type}`">
                <span class="log-timestamp">[{{ log.timestamp.toLocaleTimeString() }}]</span>
                <span>{{ log.message }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { LogEntry } from '../composables/useToolboxAPI';

defineProps<{
    logs: LogEntry[];
}>();

defineEmits<{
    clear: [];
}>();
</script>
