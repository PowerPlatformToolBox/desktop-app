<script lang="ts">
    export let connection: ToolBoxAPI.DataverseConnection | null = null;
    export let isLoading: boolean = false;
</script>

<div class="card">
    <h2>🔗 Connection Status</h2>
    {#if isLoading}
        <div class="info-box">
            <div class="loading">Checking connection...</div>
        </div>
    {:else if !connection}
        <div class="info-box warning">
            <p>
                <strong>⚠️ No active connection</strong><br />
                Please connect to a Dataverse environment to use this tool.
            </p>
        </div>
    {:else}
        <div class="info-box success">
            <div class="connection-details">
                <div class="connection-item">
                    <strong>Name:</strong>
                    <span>{connection.name}</span>
                </div>
                <div class="connection-item">
                    <strong>URL:</strong>
                    <span>{connection.url}</span>
                </div>
                <div class="connection-item">
                    <strong>Environment:</strong>
                    <span class="env-badge {connection.environment.toLowerCase()}">{connection.environment}</span>
                </div>
                <div class="connection-item">
                    <strong>ID:</strong>
                    <span>{connection.id}</span>
                </div>
            </div>
        </div>
    {/if}
</div>
