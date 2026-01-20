import { UIConnectionData } from "../../../common/types/connection";

export interface SelectMultiConnectionModalChannelIds {
    selectConnections: string;
    connectReady: string;
    populateConnections: string;
}

export interface ConnectionListData {
    connections: UIConnectionData[];
    sortOption?: "last-used" | "name-asc" | "name-desc" | "environment";
}

/**
 * Returns the controller script that wires up DOM events for the select multi-connection modal.
 * @param channels - Channel IDs for IPC communication
 * @param isSecondaryRequired - Whether the secondary connection is required (true) or optional (false)
 */
export function getSelectMultiConnectionModalControllerScript(channels: SelectMultiConnectionModalChannelIds, isSecondaryRequired: boolean = true): string {
    const serializedChannels = JSON.stringify(channels);
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const IS_SECONDARY_REQUIRED = ${isSecondaryRequired};
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
    const searchInput = document.getElementById("multi-connection-search");
    const envFilter = document.getElementById("multi-connection-env-filter");
    const authFilter = document.getElementById("multi-connection-auth-filter");
    const sortSelect = document.getElementById("multi-connection-sort");
    const filterButton = document.getElementById("multi-connection-filter-btn");
    const filterDropdown = document.getElementById("multi-connection-filter-dropdown");
    
    let authenticatedPrimaryConnectionId = null;
    let authenticatedSecondaryConnectionId = null;
    let allConnections = [];
    const DEFAULT_SORT_OPTION = "last-used";
    const SORT_OPTIONS = new Set(["last-used", "name-asc", "name-desc", "environment"]);
    const sanitizeSortOption = (value) => (value && SORT_OPTIONS.has(value) ? value : DEFAULT_SORT_OPTION);
    let injectedSortOption = DEFAULT_SORT_OPTION;
    if (sortSelect) {
        injectedSortOption = sanitizeSortOption(sortSelect.value);
    }

    const formatAuthType = (authType) => {
        const labels = {
            interactive: "Microsoft Login",
            clientSecret: "Client Secret",
            usernamePassword: "Username/Password"
        };
        return labels[authType] || authType;
    };

    const getLastUsedTimestamp = (conn) => {
        if (!conn) {
            return 0;
        }

        if (conn.lastUsedAt) {
            const parsedLastUsed = Date.parse(conn.lastUsedAt);
            if (!Number.isNaN(parsedLastUsed)) {
                return parsedLastUsed;
            }
        }

        if (conn.createdAt) {
            const parsedCreated = Date.parse(conn.createdAt);
            if (!Number.isNaN(parsedCreated)) {
                return parsedCreated;
            }
        }

        return 0;
    };

    const ENVIRONMENT_SORT_ORDER = { Dev: 1, Test: 2, UAT: 3, Production: 4 };

    const sortConnections = (a, b, sortOption) => {
        const resolvedSort = sanitizeSortOption(sortOption);
        const nameA = (a.name || "");
        const nameB = (b.name || "");

        switch (resolvedSort) {
            case "last-used": {
                const diff = getLastUsedTimestamp(b) - getLastUsedTimestamp(a);
                if (diff !== 0) {
                    return diff;
                }
                return nameA.localeCompare(nameB);
            }
            case "name-desc":
                return nameB.localeCompare(nameA);
            case "environment": {
                const aOrder = ENVIRONMENT_SORT_ORDER[a.environment] || 999;
                const bOrder = ENVIRONMENT_SORT_ORDER[b.environment] || 999;
                if (aOrder !== bOrder) {
                    return aOrder - bOrder;
                }
                return nameA.localeCompare(nameB);
            }
            case "name-asc":
            default:
                return nameA.localeCompare(nameB);
        }
    };

    const getFilteredConnections = () => {
        const searchTerm = searchInput?.value?.toLowerCase() || "";
        const selectedEnv = envFilter?.value || "";
        const selectedAuth = authFilter?.value || "";
        const selectedSort = sanitizeSortOption(sortSelect?.value || injectedSortOption);

        let filtered = allConnections.filter(conn => {
            // Search filter
            if (searchTerm) {
                const haystacks = [conn.name || "", conn.url || ""];
                if (!haystacks.some(h => h.toLowerCase().includes(searchTerm))) {
                    return false;
                }
            }

            // Environment filter
            if (selectedEnv && conn.environment !== selectedEnv) {
                return false;
            }

            // Auth type filter
            if (selectedAuth && conn.authenticationType !== selectedAuth) {
                return false;
            }

            return true;
        });

        filtered = filtered.sort((a, b) => sortConnections(a, b, selectedSort));

        return filtered;
    };

    const renderConnections = (connectionsData, options = {}) => {
        if (Array.isArray(connectionsData)) {
            allConnections = connectionsData;
        }

        if (options.sortOption) {
            injectedSortOption = sanitizeSortOption(options.sortOption);
            if (sortSelect) {
                sortSelect.value = injectedSortOption;
            }
        }

        const connections = getFilteredConnections();
        
        if (allConnections.length === 0) {
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

        if (connections.length === 0) {
            const emptyState = \`
                <div class="empty-state">
                    <p>No matching connections</p>
                    <p>Try adjusting your search or filters.</p>
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
                    <div class="connection-name">\${conn.name}</div>
                    <div class="connection-actions">
                        \${isAuthenticated 
                            ? '<div class="connected-badge">&#x2705&nbsp;Connected</div>' 
                            : '<button class="connect-button" data-connection-id="' + conn.id + '" data-list="' + idPrefix + '">Connect</button>'
                        }
                    </div>
                </div>
                <div class="connection-url">\${conn.url}</div>
                <div class="connection-item-footer">
                    <div class="connection-item-meta-left">
                        <span class="connection-env-badge env-\${conn.environment.toLowerCase()}">\${conn.environment}</span>
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
            captureException('Error connecting:', error);
            button.disabled = false;
            button.textContent = originalText;
        }
    };

    const updateConfirmButtonState = () => {
        if (confirmButton) {
            // If secondary is required, both must be selected
            // If secondary is optional, only primary is required
            if (IS_SECONDARY_REQUIRED) {
                confirmButton.disabled = !(authenticatedPrimaryConnectionId && authenticatedSecondaryConnectionId);
            } else {
                confirmButton.disabled = !authenticatedPrimaryConnectionId;
            }
        }
    };

    // Confirm button handler - just close modal as authentication is already done
    confirmButton?.addEventListener('click', () => {
        // Primary is always required
        if (!authenticatedPrimaryConnectionId) return;
        // Secondary is only required if IS_SECONDARY_REQUIRED is true
        if (IS_SECONDARY_REQUIRED && !authenticatedSecondaryConnectionId) return;
        
        // Send the authenticated connection IDs to main process (secondary can be null if optional)
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

    const closeFilterDropdown = () => {
        if (filterDropdown) {
            filterDropdown.style.display = "none";
        }
        if (filterButton) {
            filterButton.classList.remove("active");
            filterButton.setAttribute("aria-expanded", "false");
        }
    };

    const openFilterDropdown = () => {
        if (filterDropdown) {
            filterDropdown.style.display = "block";
        }
        if (filterButton) {
            filterButton.classList.add("active");
            filterButton.setAttribute("aria-expanded", "true");
        }
    };

    if (filterButton && filterDropdown) {
        filterButton.addEventListener("click", (event) => {
            event.stopPropagation();
            const isVisible = filterDropdown.style.display === "block";
            if (isVisible) {
                closeFilterDropdown();
            } else {
                openFilterDropdown();
            }
        });

        filterDropdown.addEventListener("click", (event) => {
            event.stopPropagation();
        });

        document.addEventListener("click", (event) => {
            if (!filterDropdown.contains(event.target) && !filterButton.contains(event.target)) {
                closeFilterDropdown();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeFilterDropdown();
            }
        });
    }

    // Setup filter event listeners
    searchInput?.addEventListener('input', () => renderConnections(allConnections));
    envFilter?.addEventListener('change', () => renderConnections(allConnections));
    authFilter?.addEventListener('change', () => renderConnections(allConnections));
    sortSelect?.addEventListener('change', () => {
        injectedSortOption = sanitizeSortOption(sortSelect.value);
        renderConnections(allConnections);
    });

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
                    renderConnections(allConnections);
                } else if (payload.data?.success === false) {
                    // Authentication failed - restore the connect button
                    const button = document.querySelector(\`.connect-button[data-connection-id="\${payload.data.connectionId}"][data-list="\${payload.data.listType}"]\`);
                    if (button) {
                        button.disabled = false;
                        button.textContent = 'Connect';
                    }
                    // Optionally show an error message
                    captureException('Authentication failed:', payload.data.error);
                }
            }
            
            if (payload.channel === CHANNELS.populateConnections) {
                renderConnections(payload.data?.connections || [], { sortOption: payload.data?.sortOption });
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
