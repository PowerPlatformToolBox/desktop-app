<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    interface ToolboxContext {
        toolId?: string | null;
        connectionUrl?: string | null;
        accessToken?: string | null;
    }

    interface ToolboxAPI {
        getToolContext: () => Promise<ToolboxContext>;
        showNotification: (options: { title: string; body: string; type: string }) => Promise<void>;
        onToolboxEvent: (callback: (event: string, payload: unknown) => void) => void | (() => void);
        getConnections: () => Promise<Array<{ id: string; name: string; url: string }>>;
        getActiveConnection: () => Promise<{ id: string; name: string; url: string } | null>;
    }

    type ToolboxWindow = Window & {
        toolboxAPI?: ToolboxAPI;
        TOOLBOX_CONTEXT?: ToolboxContext;
    };

    const toolboxWindow = window as unknown as ToolboxWindow;
    const getToolboxAPI = (): ToolboxAPI | undefined => toolboxWindow.toolboxAPI;
    const hasToolboxAPI = (api: ToolboxAPI | undefined): api is ToolboxAPI => !!api && typeof api.getToolContext === "function";

    interface Connection {
        id: string;
        name: string;
        url: string;
    }

    interface Event {
        event: string;
        timestamp: string;
    }

    let connectionUrl = "";
    let connections: Connection[] = [];
    let loading = true;
    let events: Event[] = [];
    let eventsSubscribed = false;
    let isDestroyed = false;
    let unsubscribeFromEvents: (() => void) | undefined;

    const updateEvents = (eventName: string) => {
        if (isDestroyed) {
            return;
        }

        events = [...events.slice(-9), { event: eventName, timestamp: new Date().toISOString() }];
    };

    // Re-run initialization whenever toolbox context arrives.
    const initializeToolContext = async () => {
        try {
            if (isDestroyed) {
                return;
            }
            const api = getToolboxAPI();

            if (!hasToolboxAPI(api)) {
                console.warn("Toolbox API is not available yet. Waiting for context message...");
                loading = false;
                return;
            }

            let context = toolboxWindow.TOOLBOX_CONTEXT;

            if (!context) {
                try {
                    context = await api.getToolContext();
                    toolboxWindow.TOOLBOX_CONTEXT = context;
                } catch (error) {
                    // Context not ready yet; wait for postMessage to deliver it.
                    return;
                }
            }

            if (!context) {
                return;
            }

            if (isDestroyed) {
                return;
            }

            connectionUrl = context.connectionUrl || "";

            const connectionsGetter = api.getConnections;
            if (typeof connectionsGetter !== "function") {
                console.warn("Toolbox API does not provide getConnections().");
                connections = [];
                loading = false;
                return;
            }

            const conns = await connectionsGetter();

            if (isDestroyed) {
                return;
            }

            connections = conns;

            if (!eventsSubscribed) {
                const eventListener = api.onToolboxEvent;

                if (typeof eventListener === "function") {
                    const maybeUnsubscribe = eventListener((eventName: string) => {
                        updateEvents(eventName);
                    });

                    if (typeof maybeUnsubscribe === "function") {
                        unsubscribeFromEvents = maybeUnsubscribe;
                    }

                    eventsSubscribed = true;
                } else {
                    console.warn("Toolbox API does not expose onToolboxEvent().");
                }
            }

            loading = false;
        } catch (error) {
            console.error("Failed to initialize tool context:", error);
            if (isDestroyed) {
                return;
            }
            loading = false;
        }
    };

    const handleMessage = (event: MessageEvent) => {
        if (isDestroyed) {
            return;
        }

        if (event.data && event.data.type === "TOOLBOX_CONTEXT") {
            toolboxWindow.TOOLBOX_CONTEXT = event.data.data;
            console.log("Received TOOLBOX_CONTEXT:", toolboxWindow.TOOLBOX_CONTEXT);
            void initializeToolContext();
        }
    };

    onMount(() => {
        window.addEventListener("message", handleMessage);
        void initializeToolContext();
    });

    onDestroy(() => {
        isDestroyed = true;
        window.removeEventListener("message", handleMessage);
        unsubscribeFromEvents?.();
    });

    async function handleShowNotification() {
        const api = getToolboxAPI();
        if (!api || typeof api.showNotification !== "function") {
            console.warn("Toolbox API does not expose showNotification().");
            return;
        }

        await api.showNotification({
            title: "Svelte Example",
            body: "This is a notification from the Svelte example tool!",
            type: "success",
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
                    <span>{connectionUrl || "Not connected"}</span>
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
            <button class="button" on:click={handleShowNotification}> Show Notification </button>
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
