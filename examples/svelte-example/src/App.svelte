<script lang="ts">
  import { onMount } from 'svelte';

  // Declare the toolboxAPI on window
  declare global {
    interface Window {
      toolboxAPI: {
        getToolContext: () => Promise<{ connectionUrl: string; accessToken: string }>;
        showNotification: (options: { title: string; body: string; type: string }) => Promise<void>;
        onToolboxEvent: (callback: (event: string, payload: unknown) => void) => void;
        getConnections: () => Promise<Array<{ id: string; name: string; url: string }>>;
        getActiveConnection: () => Promise<{ id: string; name: string; url: string } | null>;
      };
    }
  }

  interface Connection {
    id: string;
    name: string;
    url: string;
  }

  interface Event {
    event: string;
    timestamp: string;
  }

  let connectionUrl = '';
  let connections: Connection[] = [];
  let loading = true;
  let events: Event[] = [];

  onMount(async () => {
    try {
      // Get connection context
      const context = await window.toolboxAPI.getToolContext();
      connectionUrl = context.connectionUrl;

      // Get all connections
      const conns = await window.toolboxAPI.getConnections();
      connections = conns;

      // Subscribe to events
      window.toolboxAPI.onToolboxEvent((event: string) => {
        events = [
          ...events.slice(-9),
          { event, timestamp: new Date().toISOString() }
        ];
      });

      loading = false;
    } catch (error) {
      console.error('Failed to initialize tool:', error);
      loading = false;
    }
  });

  async function handleShowNotification() {
    await window.toolboxAPI.showNotification({
      title: 'Svelte Example',
      body: 'This is a notification from the Svelte example tool!',
      type: 'success'
    });
  }
</script>

<div class="container">
  {#if loading}
    <div class="loading">Loading...</div>
  {:else}
    <header class="header">
      <h1>🔥 Svelte Example Tool</h1>
      <p>Demonstrating Svelte integration with PowerPlatform ToolBox</p>
    </header>

    <section class="section">
      <h2>Connection Information</h2>
      <div class="card">
        <div class="info-item">
          <strong>Current Connection URL:</strong>
          <span>{connectionUrl || 'Not connected'}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Available Connections</h2>
      <div class="connections-grid">
        {#if connections.length === 0}
          <p>No connections available</p>
        {:else}
          {#each connections as conn (conn.id)}
            <div class="card">
              <h3>{conn.name}</h3>
              <p class="connection-url">{conn.url}</p>
            </div>
          {/each}
        {/if}
      </div>
    </section>

    <section class="section">
      <h2>Actions</h2>
      <button class="button" on:click={handleShowNotification}>
        Show Notification
      </button>
    </section>

    <section class="section">
      <h2>Recent Events</h2>
      <div class="events-list">
        {#if events.length === 0}
          <p>No events yet</p>
        {:else}
          {#each events as evt, idx (idx)}
            <div class="event-item">
              <span class="event-name">{evt.event}</span>
              <span class="event-time">
                {new Date(evt.timestamp).toLocaleTimeString()}
              </span>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  /* Component-specific styles can go here */
  /* Global styles are in app.css */
</style>
