<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

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
        TOOLBOX_CONTEXT?: { toolId: string | null; connectionUrl: string | null; accessToken: string | null };
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

const connectionUrl = ref<string>("");
const connections = ref<Connection[]>([]);
const loading = ref<boolean>(true);
const events = ref<Event[]>([]);

let eventsSubscribed = false;

// Re-run initialization whenever the tooling context becomes available.
const initializeToolContext = async () => {
    try {
        let context = window.TOOLBOX_CONTEXT;

        if (!context) {
            try {
                context = await window.toolboxAPI.getToolContext();
                window.TOOLBOX_CONTEXT = context;
            } catch (error) {
                // Context will arrive later via postMessage.
                return;
            }
        }

        if (!context) {
            return;
        }

        connectionUrl.value = context.connectionUrl || "";

        const conns = await window.toolboxAPI.getConnections();
        connections.value = conns;

        if (!eventsSubscribed) {
            window.toolboxAPI.onToolboxEvent((event: string) => {
                events.value = [...events.value.slice(-9), { event, timestamp: new Date().toISOString() }];
            });
            eventsSubscribed = true;
        }

        loading.value = false;
    } catch (error) {
        console.error("Failed to initialize tool context:", error);
        loading.value = false;
    }
};

const handleMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === "TOOLBOX_CONTEXT") {
        window.TOOLBOX_CONTEXT = event.data.data;
        console.log("Received TOOLBOX_CONTEXT:", window.TOOLBOX_CONTEXT);
        void initializeToolContext();
    }
};

onMounted(() => {
    window.addEventListener("message", handleMessage);
    void initializeToolContext();
});

onUnmounted(() => {
    window.removeEventListener("message", handleMessage);
});

const handleShowNotification = async () => {
    await window.toolboxAPI.showNotification({
        title: "Vue Example",
        body: "This is a notification from the Vue example tool!",
        type: "success",
    });
};
</script>

<template>
    <div class="container">
        <div v-if="loading" class="loading">Loading...</div>

        <template v-else>
            <header class="header">
                <h1>💚 Vue Example Tool</h1>
                <p>Demonstrating Vue 3 integration with PowerPlatform ToolBox</p>
            </header>

            <section class="section">
                <h2>Connection Information</h2>
                <div class="card">
                    <div class="info-item">
                        <strong>Current Connection URL:</strong>
                        <span>{{ connectionUrl || "Not connected" }}</span>
                    </div>
                </div>
            </section>

            <section class="section">
                <h2>Available Connections</h2>
                <div class="connections-grid">
                    <p v-if="connections.length === 0">No connections available</p>
                    <div v-else v-for="conn in connections" :key="conn.id" class="card">
                        <h3>{{ conn.name }}</h3>
                        <p class="connection-url">{{ conn.url }}</p>
                    </div>
                </div>
            </section>

            <section class="section">
                <h2>Actions</h2>
                <button class="button" @click="handleShowNotification">Show Notification</button>
            </section>

            <section class="section">
                <h2>Recent Events</h2>
                <div class="events-list">
                    <p v-if="events.length === 0">No events yet</p>
                    <div v-else v-for="(evt, idx) in events" :key="idx" class="event-item">
                        <span class="event-name">{{ evt.event }}</span>
                        <span class="event-time">
                            {{ new Date(evt.timestamp).toLocaleTimeString() }}
                        </span>
                    </div>
                </div>
            </section>
        </template>
    </div>
</template>
