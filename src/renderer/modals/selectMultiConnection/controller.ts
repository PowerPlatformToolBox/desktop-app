import { UIConnectionData } from "../../../common/types/connection";

export interface SelectMultiConnectionModalChannelIds {
    selectConnections: string;
    connectReady: string;
    populateConnections: string;
}

export interface ConnectionListData {
    connections: UIConnectionData[];
}

/**
 * Returns the controller script that wires up DOM events for the select multi-connection modal.
 */
export function getSelectMultiConnectionModalControllerScript(channels: SelectMultiConnectionModalChannelIds): string {
    const serializedChannels = JSON.stringify(channels);
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        console.warn("modalBridge API is unavailable");
        return;
    }

    const primaryConnectionsListContainer = document.getElementById("primary-connections-list");
    const secondaryConnectionsListContainer = document.getElementById("secondary-connections-list");
    const confirmButton = document.getElementById("confirm-multi-connection-btn");
    const cancelButton = document.getElementById("cancel-select-multi-connection-btn");
    const closeButton = document.getElementById("close-select-multi-connection-modal");
    
    let authenticatedPrimaryConnectionId = null;
    let authenticatedSecondaryConnectionId = null;
    let connections = [];

    const formatAuthType = (authType) => {
        const labels = {
            interactive: "Microsoft Login",
            clientSecret: "Client Secret",
            usernamePassword: "Username/Password"
        };
        return labels[authType] || authType;
    };

    const renderConnections = (connectionsData) => {
        connections = connectionsData || [];
        
        if (connections.length === 0) {
            const emptyState = \`
                <div class="empty-state">
                    <p>No connections configured yet.</p>
                    <p>Please add connections first from the Connections page.</p>
                </div>
            \`;
            if (primaryConnectionsListContainer) {
                primaryConnectionsListContainer.innerHTML = emptyState;
            }
            if (secondaryConnectionsListContainer) {
                secondaryConnectionsListContainer.innerHTML = emptyState;
            }
            return;
        }

        const connectionHtml = (conn, idPrefix, isDisabled = false) => {
            const isAuthenticated = (idPrefix === 'primary' && conn.id === authenticatedPrimaryConnectionId) ||
                                   (idPrefix === 'secondary' && conn.id === authenticatedSecondaryConnectionId);
            
            return \`
            <div class="connection-item \${isAuthenticated ? 'authenticated' : ''} \${isDisabled ? 'disabled' : ''}" 
                 data-connection-id="\${conn.id}" 
                 data-list="\${idPrefix}">
                <div class="connection-header">
                    <div style="flex: 1;">
                        <div class="connection-title-row">
                            <div class="connection-name">\${conn.name}</div>
                            <span class="connection-env-badge env-\${conn.environment.toLowerCase()}">\${conn.environment}</span>
                        </div>
                    </div>
                    <div class="connection-actions">
                        \${isAuthenticated 
                            ? '<div class="connected-badge"><svg viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>Connected</div>' 
                            : '<button class="connect-button" data-connection-id="' + conn.id + '" data-list="' + idPrefix + '">Connect</button>'
                        }
                    </div>
                </div>
                <div class="connection-url">\${conn.url}</div>
                <div class="connection-meta">
                    <div class="connection-meta-item">
                        <span class="auth-type-badge">\${formatAuthType(conn.authenticationType)}</span>
                    </div>
                </div>
            </div>
        \`;
        };

        // Render primary connections (disable if selected as secondary)
        if (primaryConnectionsListContainer) {
            primaryConnectionsListContainer.innerHTML = connections
                .map(conn => connectionHtml(conn, 'primary', conn.id === authenticatedSecondaryConnectionId))
                .join('');
        }

        // Render secondary connections (disable if selected as primary)
        if (secondaryConnectionsListContainer) {
            secondaryConnectionsListContainer.innerHTML = connections
                .map(conn => connectionHtml(conn, 'secondary', conn.id === authenticatedPrimaryConnectionId))
                .join('');
        }

        // Add click handlers to all connect buttons
        document.querySelectorAll('.connect-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation();
                const connectionId = button.getAttribute('data-connection-id');
                const listType = button.getAttribute('data-list');
                await handleConnectClick(connectionId, listType);
            });
        });

        // Update confirm button state
        updateConfirmButtonState();
    };

    const handleConnectClick = async (connectionId, listType) => {
        const button = document.querySelector(\`.connect-button[data-connection-id="\${connectionId}"][data-list="\${listType}"]\`);
        if (!button) return;

        try {
            // Disable button and show loading state
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'Connecting...';

            // Send message to main process to authenticate this connection
            // The main process will:
            // 1. Call window.toolboxAPI.connections.authenticate(connectionId)
            // 2. Send back a connectReady message with success/failure status
            // 3. On success, we'll update UI to show connected badge
            // 4. On failure, we'll restore the button and show error
            modalBridge.send(CHANNELS.selectConnections, { 
                connectionId: connectionId,
                listType: listType,
                action: 'authenticate'
            });

            // The connectReady message handler will update the UI based on success/failure
        } catch (error) {
            console.error('Error connecting:', error);
            button.disabled = false;
            button.textContent = originalText;
        }
    };

    const updateConfirmButtonState = () => {
        if (confirmButton) {
            confirmButton.disabled = !(authenticatedPrimaryConnectionId && authenticatedSecondaryConnectionId);
        }
    };

    // Confirm button handler - just close modal as authentication is already done
    confirmButton?.addEventListener('click', () => {
        if (!authenticatedPrimaryConnectionId || !authenticatedSecondaryConnectionId) return;
        
        // Send the authenticated connection IDs to main process
        modalBridge.send(CHANNELS.selectConnections, { 
            primaryConnectionId: authenticatedPrimaryConnectionId,
            secondaryConnectionId: authenticatedSecondaryConnectionId,
            action: 'confirm'
        });
    });

    // Cancel and close button handlers
    const closeModal = () => modalBridge.close();
    cancelButton?.addEventListener('click', closeModal);
    closeButton?.addEventListener('click', closeModal);

    // Listen for messages from main process
    if (modalBridge?.onMessage) {
        modalBridge.onMessage((payload) => {
            if (!payload || typeof payload !== 'object') return;
            
            if (payload.channel === CHANNELS.connectReady) {
                // Connection authentication completed
                if (payload.data?.success && payload.data?.connectionId && payload.data?.listType) {
                    // Mark this connection as authenticated
                    if (payload.data.listType === 'primary') {
                        authenticatedPrimaryConnectionId = payload.data.connectionId;
                    } else if (payload.data.listType === 'secondary') {
                        authenticatedSecondaryConnectionId = payload.data.connectionId;
                    }
                    // Re-render to show authenticated state
                    renderConnections(connections);
                } else if (payload.data?.success === false) {
                    // Authentication failed - restore the connect button
                    const button = document.querySelector(\`.connect-button[data-connection-id="\${payload.data.connectionId}"][data-list="\${payload.data.listType}"]\`);
                    if (button) {
                        button.disabled = false;
                        button.textContent = 'Connect';
                    }
                    // Optionally show an error message
                    console.error('Authentication failed:', payload.data.error);
                }
            }
            
            if (payload.channel === CHANNELS.populateConnections) {
                renderConnections(payload.data?.connections || []);
            }
        });
    } else {
        console.warn("modalBridge.onMessage is not available");
    }

    // Request connections list from main process
    modalBridge.send(CHANNELS.populateConnections, {});
})();
</script>`;
}
