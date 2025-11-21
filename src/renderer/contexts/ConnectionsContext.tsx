import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface Connection {
    id: string;
    name: string;
    url: string;
    authenticationType: string;
    environment: string;
    tokenExpiry?: string;
    [key: string]: any;
}

interface ConnectionsContextType {
    connections: Connection[];
    activeConnection: Connection | null;
    loadConnections: () => Promise<void>;
    addConnection: (connection: Partial<Connection>) => Promise<void>;
    deleteConnection: (connectionId: string) => Promise<void>;
    setActiveConnection: (connectionId: string) => Promise<void>;
}

const ConnectionsContext = createContext<ConnectionsContextType | undefined>(undefined);

export const useConnectionsContext = () => {
    const context = useContext(ConnectionsContext);
    if (!context) {
        throw new Error("useConnectionsContext must be used within ConnectionsProvider");
    }
    return context;
};

interface ConnectionsProviderProps {
    children: ReactNode;
}

export const ConnectionsProvider: React.FC<ConnectionsProviderProps> = ({ children }) => {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [activeConnection, setActiveConnectionState] = useState<Connection | null>(null);

    const loadConnections = async () => {
        try {
            const conns = await window.toolboxAPI.connections.getAll();
            setConnections(conns);

            const activeConn = await window.toolboxAPI.connections.getActiveConnection();
            setActiveConnectionState(activeConn);
        } catch (error) {
            console.error("Failed to load connections:", error);
        }
    };

    const addConnection = async (connection: Partial<Connection>) => {
        try {
            await window.toolboxAPI.connections.add(connection as any);
            await loadConnections();
            await window.toolboxAPI.utils.showNotification({
                title: "Connection Added",
                body: `${connection.name} has been added successfully.`,
                type: "success",
            });
        } catch (error) {
            console.error("Failed to add connection:", error);
            await window.toolboxAPI.utils.showNotification({
                title: "Connection Failed",
                body: `Failed to add connection: ${(error as Error).message}`,
                type: "error",
            });
            throw error;
        }
    };

    const deleteConnection = async (connectionId: string) => {
        try {
            await window.toolboxAPI.connections.delete(connectionId);
            await loadConnections();
            await window.toolboxAPI.utils.showNotification({
                title: "Connection Deleted",
                body: "Connection has been deleted.",
                type: "success",
            });
        } catch (error) {
            console.error("Failed to delete connection:", error);
            await window.toolboxAPI.utils.showNotification({
                title: "Delete Failed",
                body: `Failed to delete connection: ${(error as Error).message}`,
                type: "error",
            });
        }
    };

    const setActiveConnection = async (connectionId: string) => {
        try {
            await window.toolboxAPI.connections.setActive(connectionId);
            await loadConnections();
        } catch (error) {
            console.error("Failed to set active connection:", error);
            throw error;
        }
    };

    // Load connections on mount
    useEffect(() => {
        loadConnections();
    }, []);

    const value: ConnectionsContextType = {
        connections,
        activeConnection,
        loadConnections,
        addConnection,
        deleteConnection,
        setActiveConnection,
    };

    return <ConnectionsContext.Provider value={value}>{children}</ConnectionsContext.Provider>;
};
