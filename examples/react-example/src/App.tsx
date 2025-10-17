import { useEffect, useState } from "react";

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

function App() {
    const [toolContext, setToolContext] = useState<{ toolId: string | null; connectionUrl: string | null; accessToken: string | null } | null>(null);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [connections, setConnections] = useState<Connection[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [events, setEvents] = useState<Array<{ event: string; timestamp: string }>>([]);

    useEffect(() => {
        // Listen for TOOLBOX_CONTEXT from parent window
        const handleMessage = (event: MessageEvent) => {
            // eslint-disable-next-line no-debugger
            debugger;
            if (event.data && event.data.type === "TOOLBOX_CONTEXT") {
                window.TOOLBOX_CONTEXT = event.data.data;
                setToolContext(event.data.data);
                console.log("Received TOOLBOX_CONTEXT:", window.TOOLBOX_CONTEXT);
            }
        };

        window.addEventListener("message", handleMessage);

        // Initialize tool
        const init = async () => {
            try {
                // If not available, fetch it via API
                if (!toolContext) {
                    const toolContext = await window.toolboxAPI.getToolContext();
                    console.log(toolContext);
                }
                setConnectionUrl(toolContext?.connectionUrl || "");

                // Get all connections
                const conns = await window.toolboxAPI.getConnections();
                setConnections(conns);

                // Subscribe to events
                window.toolboxAPI.onToolboxEvent((event: string) => {
                    setEvents((prev) => [...prev.slice(-9), { event, timestamp: new Date().toISOString() }]);
                });

                setLoading(false);
            } catch (error) {
                console.error("Failed to initialize tool:", error);
                setLoading(false);
            }
        };

        init();

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, [toolContext]);

    const handleShowNotification = async () => {
        await window.toolboxAPI.showNotification({
            title: "React Example",
            body: "This is a notification from the React example tool!",
            type: "success",
        });
    };

    if (loading) {
        return (
            <div className="container">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    return (
        <div className="container">
            <header className="header">
                <h1>⚛️ React Example Tool</h1>
                <p>Demonstrating React integration with PowerPlatform ToolBox</p>
            </header>

            <section className="section">
                <h2>Connection Information</h2>
                <div className="card">
                    <div className="info-item">
                        <strong>Current Connection URL:</strong>
                        <span>{connectionUrl || "Not connected"}</span>
                    </div>
                </div>
            </section>

            <section className="section">
                <h2>Available Connections</h2>
                <div className="connections-grid">
                    {connections.length === 0 ? (
                        <p>No connections available</p>
                    ) : (
                        connections.map((conn) => (
                            <div key={conn.id} className="card">
                                <h3>{conn.name}</h3>
                                <p className="connection-url">{conn.url}</p>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <section className="section">
                <h2>Actions</h2>
                <button className="button" onClick={handleShowNotification}>
                    Show Notification
                </button>
            </section>

            <section className="section">
                <h2>Recent Events</h2>
                <div className="events-list">
                    {events.length === 0 ? (
                        <p>No events yet</p>
                    ) : (
                        events.map((evt, idx) => (
                            <div key={idx} className="event-item">
                                <span className="event-name">{evt.event}</span>
                                <span className="event-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}

export default App;
