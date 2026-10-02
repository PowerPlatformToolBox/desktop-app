import { UIConnectionData } from "../../../common/types/connection";
import { chromeIconUrl, edgeIconUrl } from "../../utils/browserIcons";
import { getConnectionSortingUtilitiesScript } from "../../utils/connectionSorting";
import type { SelectMultiConnectionModalOptions } from "./view";

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
 * @param enabledForPowerPlatformAPI - Whether to show Power Platform API guidance/tag context
 * @param enableDoubleClickConnect - Whether double-clicking a connection triggers Connect
 */
export function getSelectMultiConnectionModalControllerScript(
    channels: SelectMultiConnectionModalChannelIds,
    optionsOrIsSecondaryRequired: boolean | SelectMultiConnectionModalOptions = true,
    enabledForPowerPlatformAPI: boolean = false,
    enableDoubleClickConnect: boolean = false,
    impersonationIconUrl?: string,
): string {
    if (typeof optionsOrIsSecondaryRequired === "object") {
        return getConnectionSlotsModalControllerScript(channels, optionsOrIsSecondaryRequired, enabledForPowerPlatformAPI, enableDoubleClickConnect, impersonationIconUrl);
    }

    const isSecondaryRequired = optionsOrIsSecondaryRequired;
    const serializedChannels = JSON.stringify(channels);
    const sortingUtilities = getConnectionSortingUtilitiesScript();
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const IS_SECONDARY_REQUIRED = ${isSecondaryRequired};
    const ENABLED_FOR_POWER_PLATFORM_API = ${enabledForPowerPlatformAPI};
    const ENABLE_DOUBLE_CLICK_CONNECT = ${enableDoubleClickConnect};
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
    const searchClearButton = document.getElementById("multi-connection-search-clear");
    const envFilter = document.getElementById("multi-connection-env-filter");
    const authFilter = document.getElementById("multi-connection-auth-filter");
    const categoryFilter = document.getElementById("multi-connection-category-filter");
    const sortSelect = document.getElementById("multi-connection-sort");
    const filterButton = document.getElementById("multi-connection-filter-btn");
    const filterDropdown = document.getElementById("multi-connection-filter-dropdown");
    
    let authenticatedPrimaryConnectionId = null;
    let authenticatedSecondaryConnectionId = null;
    let allConnections = [];
    const impersonateConnectionKeys = new Set();
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

    const escapeHtml = (value) => {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    const getBrowserBadgeMarkup = (conn) => {
        const browserType = conn.browserType;
        if (!browserType || browserType === "default") return "";
        const profileName = conn.browserProfileName || conn.browserProfile;
        if (!profileName) return "";
        const browserLabels = { chrome: "Chrome", edge: "Edge" };
        const browserLabel = browserLabels[browserType] || "Browser";
        const iconPaths = { chrome: ${JSON.stringify(chromeIconUrl)}, edge: ${JSON.stringify(edgeIconUrl)} };
        const iconPath = iconPaths[browserType];
        const safeProfile = escapeHtml(profileName);
        const safeTitle = escapeHtml(browserLabel + " \xb7 " + profileName);
        const iconMarkup = iconPath
            ? \`<img src="\${iconPath}" alt="\${browserLabel} icon" class="browser-profile-icon" />\`
            : \`<span class="browser-profile-icon browser-profile-icon-fallback">\${browserLabel.charAt(0).toUpperCase()}</span>\`;
        return \`<span class="browser-profile-badge" title="\${safeTitle}">\${iconMarkup}<span class="browser-profile-label">\${safeProfile}</span></span>\`;
    };
${sortingUtilities}
    const getFilteredConnections = () => {
        const searchTerm = searchInput?.value?.toLowerCase() || "";
        const selectedEnv = envFilter?.value || "";
        const selectedAuth = authFilter?.value || "";
        const selectedCategory = categoryFilter?.value || "";
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

            // Category filter
            if (selectedCategory) {
                if (selectedCategory === "__default__") {
                    if (conn.category) return false;
                } else if (conn.category !== selectedCategory) {
                    return false;
                }
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

        // Populate category filter dropdown from actual connection data
        if (categoryFilter && Array.isArray(connectionsData)) {
            const allCategories = new Set();
            allConnections.forEach(conn => { if (conn.category) allCategories.add(conn.category); });
            const currentCategoryValue = categoryFilter.value;
            const hasDefault = allConnections.some(conn => !conn.category);
            let optionsHtml = '<option value="">All Categories</option>';
            if (hasDefault) optionsHtml += '<option value="__default__">Default (No Category)</option>';
            [...allCategories].sort().forEach(cat => {
                optionsHtml += \`<option value="\${escapeHtml(String(cat))}">\${escapeHtml(String(cat))}</option>\`;
            });
            categoryFilter.innerHTML = optionsHtml;
            if (currentCategoryValue) categoryFilter.value = currentCategoryValue;
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
            const browserBadge = getBrowserBadgeMarkup(conn);
            const safeId = escapeHtml(conn.id);
            const envColor = conn.environmentColor && /^#[0-9A-Fa-f]{6}$/.test(conn.environmentColor) ? conn.environmentColor : null;
            const envBadgeStyle = envColor ? \` style="background-color:\${envColor}1a;color:\${envColor};border:1px solid \${envColor}4d"\` : '';
            const envBadgeClass = envColor ? 'connection-env-badge' : \`connection-env-badge env-\${escapeHtml(conn.environment.toLowerCase())}\`;
            const catColor = conn.categoryColor && /^#[0-9A-Fa-f]{6}$/.test(conn.categoryColor) ? conn.categoryColor : null;
            const catBadgeMarkup = conn.category ? \`<span class="category-badge" \${catColor ? \`style="background-color:\${catColor}1a;color:\${catColor};border:1px solid \${catColor}4d"\` : ''}>\${escapeHtml(conn.category)}</span>\` : '';
            const ppApiBadgeMarkup = conn.enabledForPowerPlatformAPI === true ? '<span class="power-platform-api-badge">PP API</span>' : '';
            
            return \`
            <div class="connection-item \${isAuthenticated ? 'authenticated' : ''} \${isDisabled ? 'disabled' : ''}" 
                 data-connection-id="\${safeId}" 
                 data-list="\${idPrefix}">
                <div class="connection-header">
                    <div class="connection-name">\${escapeHtml(conn.name)}</div>
                    <div class="connection-actions">
                        \${isAuthenticated 
                            ? '<div class="connected-badge">&#x2705&nbsp;Connected</div>' 
                            : '<button class="connect-button" data-connection-id="' + safeId + '" data-list="' + idPrefix + '">Connect</button>'
                        }
                    </div>
                </div>
                <div class="connection-url">\${escapeHtml(conn.url)}</div>
                <div class="connection-item-footer">
                    <div class="connection-item-meta-left">
                        <span class="\${envBadgeClass}"\${envBadgeStyle}>\${escapeHtml(conn.environment)}</span>
                        <span class="auth-type-badge">\${formatAuthType(conn.authenticationType)}</span>
                        \${ppApiBadgeMarkup}
                        \${catBadgeMarkup}
                    </div>
                    \${browserBadge ? \`<div class="connection-item-meta-right">\${browserBadge}</div>\` : ''}
                </div>
                <label class="impersonate-checkbox-row" onclick="event.stopPropagation()">
                    <input type="checkbox" class="impersonate-checkbox" data-connection-id="\${safeId}" data-list="\${idPrefix}" \${impersonateConnectionKeys.has(idPrefix + ':' + conn.id) ? 'checked' : ''} />
                    Impersonate as another user
                </label>
            </div>
        \`;
        };

        // Group connections by category
        const groupMap = new Map();
        connections.forEach(conn => {
            const key = conn.category || "";
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key).push(conn);
        });
        const groupKeys = [...groupMap.keys()].sort((a, b) => {
            if (a === "") return -1;
            if (b === "") return 1;
            return a.localeCompare(b);
        });
        const useGroups = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== "");

        const renderGroupedList = (container, idPrefix, disabledConnectionId) => {
            if (!container) return;
            if (useGroups) {
                container.innerHTML = groupKeys.map(groupKey => {
                    const groupConns = groupMap.get(groupKey);
                    const displayKey = groupKey === "" ? "Default" : groupKey;
                    const escapedKey = escapeHtml(displayKey);
                    const items = groupConns.map(conn => connectionHtml(conn, idPrefix, conn.id === disabledConnectionId)).join('');
                    return \`
                    <div class="connection-group" data-category="\${escapedKey}">
                        <div class="connection-group-header" data-category="\${escapedKey}" role="button" tabindex="0" aria-expanded="true">
                            <span class="connection-group-title">\${escapedKey}</span>
                            <span class="connection-group-count">\${groupConns.length}</span>
                            <span class="connection-group-toggle">▼</span>
                        </div>
                        <div class="connection-group-items" data-category="\${escapedKey}">
                            \${items}
                        </div>
                    </div>\`;
                }).join('');

                // Add group toggle handlers
                container.querySelectorAll('.connection-group-header').forEach(header => {
                    const toggleGroup = () => {
                        const group = header.closest('.connection-group');
                        const items = group?.querySelector('.connection-group-items');
                        if (!items) return;
                        const isCollapsed = items.classList.contains('collapsed');
                        items.classList.toggle('collapsed', !isCollapsed);
                        const toggle = header.querySelector('.connection-group-toggle');
                        if (toggle) toggle.textContent = isCollapsed ? '▼' : '▶';
                        header.setAttribute('aria-expanded', String(isCollapsed));
                    };
                    header.addEventListener('click', toggleGroup);
                    header.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleGroup();
                        }
                    });
                });
            } else {
                container.innerHTML = connections.map(conn => connectionHtml(conn, idPrefix, conn.id === disabledConnectionId)).join('');
            }
        };

        // Render primary connections (disable if selected as secondary)
        renderGroupedList(primaryConnectionsListContainer, 'primary', authenticatedSecondaryConnectionId);

        // Render secondary connections (disable if selected as primary)
        renderGroupedList(secondaryConnectionsListContainer, 'secondary', authenticatedPrimaryConnectionId);

        // Add click handlers to all connect buttons
        document.querySelectorAll('.connect-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation();
                const connectionId = button.getAttribute('data-connection-id');
                const listType = button.getAttribute('data-list');
                await handleConnectClick(connectionId, listType);
            });
        });

        if (ENABLE_DOUBLE_CLICK_CONNECT) {
            document.querySelectorAll('.connection-item').forEach(item => {
                item.addEventListener('dblclick', async (event) => {
                    if (event.target instanceof Element && event.target.closest('.connect-button')) return;
                    if (item.classList.contains('disabled') || item.classList.contains('authenticated')) return;

                    const connectionId = item.getAttribute('data-connection-id');
                    const listType = item.getAttribute('data-list');
                    if (!connectionId || !listType) return;

                    await handleConnectClick(connectionId, listType);
                });
            });
        }

        // Track the "Impersonate as another user" checkbox per connection card
        document.querySelectorAll('.impersonate-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const key = checkbox.getAttribute('data-list') + ':' + checkbox.getAttribute('data-connection-id');
                if (checkbox.checked) {
                    impersonateConnectionKeys.add(key);
                } else {
                    impersonateConnectionKeys.delete(key);
                }
            });
        });

        // Update confirm button state
        updateConfirmButtonState();
    };

    const handleConnectClick = async (connectionId, listType) => {
        const button = document.querySelector(\`.connect-button[data-connection-id="\${connectionId}"][data-list="\${listType}"]\`);
        if (!button) return;

        // Disable button and show loading state
        const originalText = button.textContent;
        try {
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
            primaryWantsImpersonation: impersonateConnectionKeys.has('primary:' + authenticatedPrimaryConnectionId),
            secondaryWantsImpersonation: authenticatedSecondaryConnectionId ? impersonateConnectionKeys.has('secondary:' + authenticatedSecondaryConnectionId) : false,
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

    const handleSearchClearButtonClick = (inputElement) => {
        if (!(inputElement instanceof HTMLInputElement)) {
            return;
        }

        if (!inputElement.value) {
            inputElement.focus();
            return;
        }

        inputElement.value = '';
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.focus();
    };

    searchClearButton?.addEventListener('click', () => {
        handleSearchClearButtonClick(searchInput);
    });

    // Setup filter event listeners
    searchInput?.addEventListener('input', () => renderConnections(allConnections));
    envFilter?.addEventListener('change', () => renderConnections(allConnections));
    authFilter?.addEventListener('change', () => renderConnections(allConnections));
    categoryFilter?.addEventListener('change', () => renderConnections(allConnections));
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
                    console.error('Authentication failed:', payload.data.error);
                }
            }
            
            if (payload.channel === CHANNELS.populateConnections) {
                renderConnections(payload.data?.connections || [], { sortOption: payload.data?.sortOption });
            }
        });
    } else {
        console.warn("modalBridge.onMessage is not available");
    }

    // Show Power Platform API info message if required
    if (ENABLED_FOR_POWER_PLATFORM_API === true) {
        const ppApiInfo = document.getElementById("power-platform-api-info-multi");
        if (ppApiInfo) {
            ppApiInfo.style.display = "block";
        }
    }

    // Request connections list from main process
    modalBridge.send(CHANNELS.populateConnections, {});
})();
</script>`;
}

function getConnectionSlotsModalControllerScript(
    channels: SelectMultiConnectionModalChannelIds,
    options: SelectMultiConnectionModalOptions,
    enabledForPowerPlatformAPI: boolean,
    enableDoubleClickConnect: boolean,
    impersonationIconUrl?: string,
): string {
    const serializedChannels = JSON.stringify(channels);
    const sortingUtilities = getConnectionSortingUtilitiesScript();
    const initialConnectionIds = JSON.stringify(options.initialConnectionIds ?? []);
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const MIN_CONNECTIONS = ${options.minConnections};
    const MAX_CONNECTIONS = ${options.maxConnections};
    const INITIAL_CONNECTION_IDS = ${initialConnectionIds};
    const ENABLED_FOR_POWER_PLATFORM_API = ${enabledForPowerPlatformAPI};
    const ENABLE_DOUBLE_CLICK_CONNECT = ${enableDoubleClickConnect};
    const IMPERSONATION_ICON_URL = ${JSON.stringify(impersonationIconUrl ?? "icons/light/impersonate.svg")};
    const modalBridge = window.modalBridge;
    if (!modalBridge) return;

    const rail = document.getElementById("connection-slot-rail");
    const list = document.getElementById("slot-connection-list");
    const activeLabel = document.getElementById("active-connection-slot-label");
    const confirmButton = document.getElementById("confirm-multi-connection-btn");
    const addButton = document.getElementById("add-connection-slot-btn");
    const duplicateWarning = document.getElementById("slot-duplicate-warning");
    const searchInput = document.getElementById("multi-connection-search");
    const searchClearButton = document.getElementById("multi-connection-search-clear");
    const envFilter = document.getElementById("multi-connection-env-filter");
    const authFilter = document.getElementById("multi-connection-auth-filter");
    const categoryFilter = document.getElementById("multi-connection-category-filter");
    const sortSelect = document.getElementById("multi-connection-sort");
    const filterButton = document.getElementById("multi-connection-filter-btn");
    const filterDropdown = document.getElementById("multi-connection-filter-dropdown");
    let slotIds = [...INITIAL_CONNECTION_IDS];
    while (slotIds.length > MIN_CONNECTIONS && !slotIds[slotIds.length - 1]) slotIds.pop();
    while (slotIds.length < MIN_CONNECTIONS) slotIds.push(null);
    slotIds.length = Math.min(slotIds.length, MAX_CONNECTIONS);
    const connectedSlots = new Set(slotIds.flatMap((connectionId, index) => connectionId ? [index] : []));
    let activeSlot = 0;
    let allConnections = [];
    const impersonateSlots = new Set();
    const DEFAULT_SORT_OPTION = "last-used";
    const SORT_OPTIONS = new Set(["last-used", "name-asc", "name-desc", "environment"]);
    const sanitizeSortOption = (value) => value && SORT_OPTIONS.has(value) ? value : DEFAULT_SORT_OPTION;
    const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    const formatAuthType = (authType) => ({ interactive: "Microsoft Login", clientSecret: "Client Secret", usernamePassword: "Username/Password" }[authType] || authType);
${sortingUtilities}

    const renderRail = () => {
        if (!rail) return;
        const rows = slotIds.map((connectionId, index) => {
            const required = index < MIN_CONNECTIONS;
            const connection = allConnections.find((item) => item.id === connectionId);
            const label = connection ? connection.name : "Not selected";
            const slotIndicators = '<span class="connection-slot-indicators">' +
                (connectedSlots.has(index) ? '<span class="connection-slot-connected-check" role="img" aria-label="Connected" title="Connected">&#10003;</span>' : '') +
                (impersonateSlots.has(index) ? '<img class="connection-slot-impersonation-icon" src="' + escapeHtml(IMPERSONATION_ICON_URL) + '" alt="" title="Dataverse impersonation enabled" aria-label="Dataverse impersonation enabled" />' : '') +
                '</span>';
            return '<div class="connection-slot-row" data-slot-row="' + index + '">' +
                '<button type="button" class="connection-slot-button" data-slot-index="' + index + '" aria-pressed="' + (activeSlot === index) + '">' +
                '<span class="connection-slot-number">' + (index + 1) + '</span><span class="connection-slot-copy"><strong>Connection ' + (index + 1) + '</strong><small>' + escapeHtml(label) + '</small></span>' +
                slotIndicators + '<span class="connection-badge ' + (required ? "required" : "optional") + '">' + (required ? "Required" : "Optional") + '</span></button>' +
                (required ? "" : '<button type="button" class="connection-slot-clear" data-clear-slot="' + index + '" aria-label="Clear connection ' + (index + 1) + '" title="Clear slot">&times;</button>') + '</div>';
        }).join("");
        const existingAdd = document.getElementById("add-connection-slot-btn");
        rail.innerHTML = rows + '<button id="add-connection-slot-btn" class="connection-slot-add" type="button" ' + (slotIds.length >= MAX_CONNECTIONS ? "disabled" : "") + '>+ Add connection</button>';
        rail.querySelectorAll("[data-slot-index]").forEach((button) => button.addEventListener("click", () => {
            activeSlot = Number(button.getAttribute("data-slot-index"));
            updateState();
            renderRail();
            renderConnections();
        }));
        rail.querySelectorAll("[data-clear-slot]").forEach((button) => button.addEventListener("click", () => {
            const index = Number(button.getAttribute("data-clear-slot"));
            slotIds[index] = null;
            connectedSlots.delete(index);
            impersonateSlots.delete(index);
            activeSlot = index;
            updateState();
            renderRail();
            renderConnections();
        }));
        const newAddButton = document.getElementById("add-connection-slot-btn");
        newAddButton?.addEventListener("click", () => {
            const reusableIndex = slotIds.findIndex((connectionId, index) => index >= MIN_CONNECTIONS && !connectionId);
            if (reusableIndex >= 0) {
                activeSlot = reusableIndex;
            } else if (slotIds.length < MAX_CONNECTIONS) {
                activeSlot = slotIds.length;
                slotIds.push(null);
            }
            updateState();
            renderRail();
            renderConnections();
        });
        if (existingAdd && slotIds.length >= MAX_CONNECTIONS) existingAdd.disabled = true;
    };

    const getFilteredConnections = () => {
        const query = searchInput?.value?.toLowerCase() || "";
        const env = envFilter?.value || "";
        const auth = authFilter?.value || "";
        const category = categoryFilter?.value || "";
        const sortOption = sanitizeSortOption(sortSelect?.value);
        return allConnections.filter((connection) => {
            if (query && ![connection.name || "", connection.url || ""].some((value) => value.toLowerCase().includes(query))) return false;
            if (env && connection.environment !== env) return false;
            if (auth && connection.authenticationType !== auth) return false;
            if (category === "__default__" && connection.category) return false;
            if (category && category !== "__default__" && connection.category !== category) return false;
            return true;
        }).sort((first, second) => sortConnections(first, second, sortOption));
    };

    const renderConnections = () => {
        if (!list) return;
        const connections = getFilteredConnections();
        if (!connections.length) {
            list.innerHTML = '<div class="empty-state"><p>' + (allConnections.length ? "No matching connections" : "No connections configured yet. Add connections from the Connections page.") + '</p></div>';
            return;
        }
        list.innerHTML = connections.map((connection) => {
            const selected = slotIds[activeSlot] === connection.id;
            const duplicate = slotIds.some((id, index) => index !== activeSlot && id === connection.id);
            const envClass = "connection-env-badge env-" + escapeHtml(String(connection.environment).toLowerCase());
            const category = connection.category ? '<span class="category-badge">' + escapeHtml(connection.category) + '</span>' : "";
            const ppApi = connection.enabledForPowerPlatformAPI ? '<span class="power-platform-api-badge">PP API</span>' : "";
            const selectionControl = selected
                ? '<span class="connection-selected-indicator" role="status" aria-label="Selected for Connection ' + (activeSlot + 1) + '" title="Selected for Connection ' + (activeSlot + 1) + '"><span class="connection-selected-check" aria-hidden="true">&#10003;</span><span>Selected</span></span>'
                : '<button class="connect-button" data-connection-id="' + escapeHtml(connection.id) + '" type="button">Connect</button>';
            return '<div class="connection-item ' + (selected ? "authenticated" : "") + '" data-connection-id="' + escapeHtml(connection.id) + '">' +
                '<div class="connection-header"><div class="connection-name">' + escapeHtml(connection.name) + '</div><div class="connection-actions">' + selectionControl + '</div></div>' +
                '<div class="connection-url">' + escapeHtml(connection.url) + '</div><div class="connection-item-footer"><div class="connection-item-meta-left"><span class="' + envClass + '">' + escapeHtml(connection.environment) + '</span><span class="auth-type-badge">' + escapeHtml(formatAuthType(connection.authenticationType)) + '</span>' + ppApi + category + '</div></div>' +
                '<label class="impersonate-checkbox-row"><input type="checkbox" class="slot-impersonate-checkbox" data-connection-id="' + escapeHtml(connection.id) + '" ' + (impersonateSlots.has(activeSlot) ? "checked" : "") + ' />Impersonate as another user</label>' +
                (duplicate ? '<small class="slot-duplicate-card-note"><span aria-hidden="true">&#9888;</span><span>Also assigned to another slot</span></small>' : "") + '</div>';
        }).join("");
        list.querySelectorAll(".connect-button").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                const connectionId = button.getAttribute("data-connection-id");
                if (connectionId) modalBridge.send(CHANNELS.selectConnections, { action: "authenticate", connectionId, listType: "slot-" + activeSlot });
            });
        });
        if (ENABLE_DOUBLE_CLICK_CONNECT) list.querySelectorAll(".connection-item").forEach((item) => item.addEventListener("dblclick", () => {
            const connectionId = item.getAttribute("data-connection-id");
            if (connectionId) modalBridge.send(CHANNELS.selectConnections, { action: "authenticate", connectionId, listType: "slot-" + activeSlot });
        }));
        list.querySelectorAll(".slot-impersonate-checkbox").forEach((checkbox) => checkbox.addEventListener("change", () => {
            if (checkbox.checked) impersonateSlots.add(activeSlot);
            else impersonateSlots.delete(activeSlot);
            renderRail();
        }));
    };

    const updateState = () => {
        if (activeLabel) activeLabel.textContent = "Connection " + (activeSlot + 1);
        if (duplicateWarning) {
            const assignedId = slotIds[activeSlot];
            duplicateWarning.hidden = !assignedId || !slotIds.some((id, index) => index !== activeSlot && id === assignedId);
        }
        if (confirmButton) confirmButton.disabled = slotIds.slice(0, MIN_CONNECTIONS).filter(Boolean).length < MIN_CONNECTIONS;
    };

    const confirm = () => {
        if (slotIds.slice(0, MIN_CONNECTIONS).filter(Boolean).length < MIN_CONNECTIONS) return;
        modalBridge.send(CHANNELS.selectConnections, { action: "confirm", connectionIds: slotIds, impersonateSlots: [...impersonateSlots] });
    };
    confirmButton?.addEventListener("click", confirm);
    document.getElementById("cancel-select-multi-connection-btn")?.addEventListener("click", () => modalBridge.close());
    document.getElementById("close-select-multi-connection-modal")?.addEventListener("click", () => modalBridge.close());
    searchInput?.addEventListener("input", renderConnections);
    envFilter?.addEventListener("change", renderConnections);
    authFilter?.addEventListener("change", renderConnections);
    categoryFilter?.addEventListener("change", renderConnections);
    sortSelect?.addEventListener("change", renderConnections);
    searchClearButton?.addEventListener("click", () => { if (searchInput) { searchInput.value = ""; renderConnections(); searchInput.focus(); } });
    filterButton?.addEventListener("click", () => {
        if (!filterDropdown) return;
        const open = filterDropdown.style.display === "block";
        filterDropdown.style.display = open ? "none" : "block";
        filterButton.setAttribute("aria-expanded", String(!open));
    });
    modalBridge.onMessage?.((payload) => {
        if (payload?.channel === CHANNELS.populateConnections) {
            allConnections = payload.data?.connections || [];
            if (categoryFilter) {
                const categories = [...new Set(allConnections.map((connection) => connection.category).filter(Boolean))].sort();
                categoryFilter.innerHTML = '<option value="">All Categories</option>' + (allConnections.some((connection) => !connection.category) ? '<option value="__default__">Default (No Category)</option>' : "") + categories.map((category) => '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>').join("");
            }
            renderRail();
            renderConnections();
            updateState();
        }
        if (payload?.channel === CHANNELS.connectReady && payload.data?.success && payload.data?.connectionId) {
            const match = /^slot-(\\d+)$/.exec(payload.data.listType || "");
            if (!match) return;
            const slotIndex = Number(match[1]);
            slotIds[slotIndex] = payload.data.connectionId;
            connectedSlots.add(slotIndex);
            activeSlot = slotIndex;
            renderRail();
            renderConnections();
            updateState();
        }
        if (payload?.channel === CHANNELS.connectReady && payload.data?.success === false) {
            const button = list?.querySelector('.connect-button[data-connection-id="' + payload.data.connectionId + '"]');
            if (button) button.textContent = "Connect";
        }
    });
    if (ENABLED_FOR_POWER_PLATFORM_API) {
        const warning = document.getElementById("power-platform-api-info-multi");
        if (warning) warning.style.display = "block";
    }
    renderRail();
    renderConnections();
    updateState();
    modalBridge.send(CHANNELS.populateConnections, {});
})();
</script>`;
}
