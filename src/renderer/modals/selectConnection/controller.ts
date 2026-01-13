import { UIConnectionData } from "../../../common/types/connection";

export interface SelectConnectionModalChannelIds {
    selectConnection: string;
    connectReady: string;
    populateConnections: string;
}

export interface ConnectionListData {
    connections: UIConnectionData[];
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
    const searchInput = document.getElementById("select-connection-search");
    const envFilter = document.getElementById("select-connection-env-filter");
    const authFilter = document.getElementById("select-connection-auth-filter");
    const sortSelect = document.getElementById("select-connection-sort");
    const filterButton = document.getElementById("select-connection-filter-btn");
    const filterDropdown = document.getElementById("select-connection-filter-dropdown");
    
    let selectedConnectionId = null;
    let allConnections = [];

    const formatAuthType = (authType) => {
        const labels = {
            interactive: "Microsoft Login",
            clientSecret: "Client Secret",
            usernamePassword: "Username/Password"
        };
        return labels[authType] || authType;
    };

    const ENVIRONMENT_SORT_ORDER = { Dev: 1, Test: 2, UAT: 3, Production: 4 };

    const sortConnections = (a, b, sortOption) => {
        const nameA = (a.name || "");
        const nameB = (b.name || "");

        switch (sortOption) {
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
        const selectedSort = sortSelect?.value || "name-asc";

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

    const renderConnections = (connectionsData) => {
        if (!connectionsListContainer) return;
        
        allConnections = connectionsData || [];
        const connections = getFilteredConnections();
        
        if (allConnections.length === 0) {
            connectionsListContainer.innerHTML = \`
                <div class="empty-state">
                    <p>No connections configured yet.</p>
                    <p>Please add a connection first from the Connections page.</p>
                </div>
            \`;
            return;
        }

        if (connections.length === 0) {
            connectionsListContainer.innerHTML = \`
                <div class="empty-state">
                    <p>No matching connections</p>
                    <p>Try adjusting your search or filters.</p>
                </div>
            \`;
            return;
        }

        connectionsListContainer.innerHTML = connections.map(conn => \`
            <div class="connection-item \${conn.isActive ? 'active' : ''}" data-connection-id="\${conn.id}">
                <div class="connection-header">
                    <div class="connection-name">\${conn.name}</div>
                </div>
                <div class="connection-url">\${conn.url}</div>
                <div class="connection-item-footer">
                    <div class="connection-item-meta-left">
                        <span class="connection-env-badge env-\${conn.environment.toLowerCase()}">\${conn.environment}</span>
                        <span class="auth-type-badge">\${formatAuthType(conn.authenticationType)}</span>
                        \${conn.isActive ? '<span style="color: #107c10; font-size: 11px;">✓ Active</span>' : ''}
                    </div>
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

        // Auto-select active connection if it exists and is in filtered results
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
    sortSelect?.addEventListener('change', () => renderConnections(allConnections));

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
