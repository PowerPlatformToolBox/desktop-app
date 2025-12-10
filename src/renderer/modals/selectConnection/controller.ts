export interface SelectConnectionModalChannelIds {
    selectConnection: string;
    connectReady: string;
    populateConnections: string;
}

export interface ConnectionListData {
    connections: Array<{
        id: string;
        name: string;
        url: string;
        environment: string;
        authenticationType: string;
        isActive: boolean;
    }>;
}

/**
 * Returns the controller script that wires up DOM events for the select connection modal.
 */
export function getSelectConnectionModalControllerScript(channels: SelectConnectionModalChannelIds): string {
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

    const connectionsListContainer = document.getElementById("connections-list-container");
    const connectButton = document.getElementById("connect-selected-connection-btn");
    const cancelButton = document.getElementById("cancel-select-connection-btn");
    const closeButton = document.getElementById("close-select-connection-modal");
    
    let selectedConnectionId = null;
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
        if (!connectionsListContainer) return;
        
        connections = connectionsData || [];
        
        if (connections.length === 0) {
            connectionsListContainer.innerHTML = \`
                <div class="empty-state">
                    <p>No connections configured yet.</p>
                    <p>Please add a connection first from the Connections page.</p>
                </div>
            \`;
            return;
        }

        connectionsListContainer.innerHTML = connections.map(conn => \`
            <div class="connection-item \${conn.isActive ? 'active' : ''}" data-connection-id="\${conn.id}">
                <div class="connection-header">
                    <div class="connection-name">\${conn.name}</div>
                    <span class="connection-env-badge env-\${conn.environment.toLowerCase()}">\${conn.environment}</span>
                </div>
                <div class="connection-url">\${conn.url}</div>
                <div class="connection-meta">
                    <div class="connection-meta-item">
                        <span class="auth-type-badge">\${formatAuthType(conn.authenticationType)}</span>
                    </div>
                    \${conn.isActive ? '<div class="connection-meta-item">✓ Currently Active</div>' : ''}
                </div>
            </div>
        \`).join('');

        // Add click handlers to connection items
        const connectionItems = connectionsListContainer.querySelectorAll('.connection-item');
        connectionItems.forEach(item => {
            item.addEventListener('click', () => {
                const connectionId = item.getAttribute('data-connection-id');
                selectConnection(connectionId);
            });
        });

        // Auto-select active connection if it exists
        const activeConnection = connections.find(conn => conn.isActive);
        if (activeConnection) {
            selectConnection(activeConnection.id);
        }
    };

    const selectConnection = (connectionId) => {
        selectedConnectionId = connectionId;
        
        // Update UI to show selected state
        const connectionItems = connectionsListContainer?.querySelectorAll('.connection-item');
        connectionItems?.forEach(item => {
            if (item.getAttribute('data-connection-id') === connectionId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Enable connect button
        if (connectButton) {
            connectButton.disabled = false;
        }
    };

    const setButtonState = (button, isLoading, loadingLabel, defaultLabel) => {
        if (!(button instanceof HTMLButtonElement)) return;
        if (isLoading) {
            button.dataset.defaultLabel = defaultLabel;
            button.disabled = true;
            button.textContent = loadingLabel;
        } else {
            button.disabled = false;
            button.textContent = button.dataset.defaultLabel || defaultLabel;
        }
    };

    // Connect button handler
    connectButton?.addEventListener('click', () => {
        if (!selectedConnectionId) return;
        
        setButtonState(connectButton, true, "Connecting...", "Connect");
        modalBridge.send(CHANNELS.selectConnection, { connectionId: selectedConnectionId });
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
                setButtonState(connectButton, false, "", "Connect");
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
