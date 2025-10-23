<template>
    <div class="card">
        <h2>🔗 Connection Status</h2>
        <div v-if="isLoading" class="info-box">
            <div class="loading">Checking connection...</div>
        </div>
        <div v-else-if="!connection" class="info-box warning">
            <p>
                <strong>⚠️ No active connection</strong><br />
                Please connect to a Dataverse environment to use this tool.
            </p>
        </div>
        <div v-else class="info-box success">
            <div class="connection-details">
                <div class="connection-item">
                    <strong>Name:</strong>
                    <span>{{ connection.name }}</span>
                </div>
                <div class="connection-item">
                    <strong>URL:</strong>
                    <span>{{ connection.url }}</span>
                </div>
                <div class="connection-item">
                    <strong>Environment:</strong>
                    <span :class="`env-badge ${connection.environment.toLowerCase()}`">{{ connection.environment }}</span>
                </div>
                <div class="connection-item">
                    <strong>ID:</strong>
                    <span>{{ connection.id }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    connection: ToolBoxAPI.DataverseConnection | null;
    isLoading: boolean;
}>();
</script>
