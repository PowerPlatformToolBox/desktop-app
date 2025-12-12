export interface SelectMultiConnectionModalChannelIds {
    selectConnections: string;
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
    const connectButton = document.getElementById("connect-multi-connection-btn");
    const cancelButton = document.getElementById("cancel-select-multi-connection-btn");
    const closeButton = document.getElementById("close-select-multi-connection-modal");
    
    let selectedPrimaryConnectionId = null;
    let selectedSecondaryConnectionId = null;
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

        const connectionHtml = (conn, idPrefix, isDisabled = false) => \`
            <div class="connection-item \${conn.isActive ? 'active' : ''} \${isDisabled ? 'disabled' : ''}" 
                 data-connection-id="\${conn.id}" 
                 data-list="\${idPrefix}">
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
        \`;

        // Render primary connections
        if (primaryConnectionsListContainer) {
            primaryConnectionsListContainer.innerHTML = connections
                .map(conn => connectionHtml(conn, 'primary', conn.id === selectedSecondaryConnectionId))
                .join('');
        }

        // Render secondary connections
        if (secondaryConnectionsListContainer) {
            secondaryConnectionsListContainer.innerHTML = connections
                .map(conn => connectionHtml(conn, 'secondary', conn.id === selectedPrimaryConnectionId))
                .join('');
        }

        // Add click handlers to all connection items
        document.querySelectorAll('.connection-item:not(.disabled)').forEach(item => {
            item.addEventListener('click', () => {
                const connectionId = item.getAttribute('data-connection-id');
                const listType = item.getAttribute('data-list');
                if (listType === 'primary') {
                    selectPrimaryConnection(connectionId);
                } else {
                    selectSecondaryConnection(connectionId);
                }
            });
        });

        // Auto-select active connection as primary if no selection
        if (!selectedPrimaryConnectionId) {
            const activeConnection = connections.find(conn => conn.isActive);
            if (activeConnection) {
                selectPrimaryConnection(activeConnection.id);
            }
        }
    };

    const selectPrimaryConnection = (connectionId) => {
        selectedPrimaryConnectionId = connectionId;
        
        // Update UI to show selected state
        primaryConnectionsListContainer?.querySelectorAll('.connection-item').forEach(item => {
            if (item.getAttribute('data-connection-id') === connectionId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Re-render to disable this connection in secondary list
        renderConnectionsWithDisabled();

        // Enable connect button if both connections selected
        updateConnectButtonState();
    };

    const selectSecondaryConnection = (connectionId) => {
        selectedSecondaryConnectionId = connectionId;
        
        // Update UI to show selected state
        secondaryConnectionsListContainer?.querySelectorAll('.connection-item').forEach(item => {
            if (item.getAttribute('data-connection-id') === connectionId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Re-render to disable this connection in primary list
        renderConnectionsWithDisabled();

        // Enable connect button if both connections selected
        updateConnectButtonState();
    };

    const renderConnectionsWithDisabled = () => {
        const connectionHtml = (conn, idPrefix, isDisabled = false) => \`
            <div class="connection-item \${conn.isActive ? 'active' : ''} \${isDisabled ? 'disabled' : ''} \${
                (idPrefix === 'primary' && conn.id === selectedPrimaryConnectionId) ||
                (idPrefix === 'secondary' && conn.id === selectedSecondaryConnectionId) ? 'selected' : ''
            }" 
                 data-connection-id="\${conn.id}" 
                 data-list="\${idPrefix}">
                <div class="connection-header">
                    <div class="connection-name">\${conn.name}</div>
                    <span class="connection-env-badge env-\${conn.environment.toLowerCase()}">\${conn.environment}</span>
                </div>
                <div class="connection-url">\${conn.url}</div>
                <div class="connection-meta">
                    <div class="connection-meta-item">
                        <span class="auth-type-badge">\${formatAuthType(conn.authenticationType)}</span>
                    </div>
                </div>
            </div>
        \`;

        // Render primary connections (disable secondary selection)
        if (primaryConnectionsListContainer) {
            primaryConnectionsListContainer.innerHTML = connections
                .map(conn => connectionHtml(conn, 'primary', conn.id === selectedSecondaryConnectionId))
                .join('');
        }

        // Render secondary connections (disable primary selection)
        if (secondaryConnectionsListContainer) {
            secondaryConnectionsListContainer.innerHTML = connections
                .map(conn => connectionHtml(conn, 'secondary', conn.id === selectedPrimaryConnectionId))
                .join('');
        }

        // Re-add click handlers
        document.querySelectorAll('.connection-item:not(.disabled)').forEach(item => {
            item.addEventListener('click', () => {
                const connectionId = item.getAttribute('data-connection-id');
                const listType = item.getAttribute('data-list');
                if (listType === 'primary') {
                    selectPrimaryConnection(connectionId);
                } else {
                    selectSecondaryConnection(connectionId);
                }
            });
        });
    };

    const updateConnectButtonState = () => {
        if (connectButton) {
            connectButton.disabled = !(selectedPrimaryConnectionId && selectedSecondaryConnectionId);
        }
    };

    const setButtonState = (button, isLoading, loadingLabel, defaultLabel) => {
        if (!(button instanceof HTMLButtonElement)) return;
        if (isLoading) {
            button.dataset.defaultLabel = defaultLabel;
            button.disabled = true;
            button.textContent = loadingLabel;
        } else {
            button.disabled = !(selectedPrimaryConnectionId && selectedSecondaryConnectionId);
            button.textContent = button.dataset.defaultLabel || defaultLabel;
        }
    };

    // Connect button handler
    connectButton?.addEventListener('click', () => {
        if (!selectedPrimaryConnectionId || !selectedSecondaryConnectionId) return;
        
        setButtonState(connectButton, true, "Connecting...", "Connect");
        modalBridge.send(CHANNELS.selectConnections, { 
            primaryConnectionId: selectedPrimaryConnectionId,
            secondaryConnectionId: selectedSecondaryConnectionId
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
