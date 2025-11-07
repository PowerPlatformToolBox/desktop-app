/**
 * ToolBox API Bridge for Iframes
 *
 * This script runs in tool iframes and exposes window.toolboxAPI
 * by proxying all calls to the parent window using postMessage.
 *
 * SECURITY NOTE: Tools have LIMITED access to PPTB functionality
 * - No direct access to settings
 * - No direct access to connection management (except getActiveConnection)
 * - No access to auto-update functionality
 * - Context-aware APIs (tool ID determined automatically)
 */

(function () {
    "use strict";

    // Generate unique IDs for IPC messages
    let messageIdCounter = 0;
    function generateMessageId() {
        return "toolbox-api-" + Date.now() + "-" + messageIdCounter++;
    }

    // Store pending promises for IPC calls
    const pendingCalls = new Map();

    // Store the current tool ID (auto-detected from context message)
    let currentToolId = null;

    // Listen for responses from parent window and context messages
    window.addEventListener("message", function (event) {
        const data = event.data;

        // Handle API responses
        if (data.type === "TOOLBOX_API_RESPONSE") {
            const pending = pendingCalls.get(data.messageId);
            if (pending) {
                if (data.error) {
                    pending.reject(new Error(data.error));
                } else {
                    pending.resolve(data.result);
                }
                pendingCalls.delete(data.messageId);
            }
        }

        // Handle context initialization - auto-detect and store tool ID
        if (data.type === "TOOLBOX_CONTEXT") {
            window.TOOLBOX_CONTEXT = data.data;
            // Auto-detect and store tool ID for context-aware API calls
            if (data.data && data.data.toolId) {
                currentToolId = data.data.toolId;
                console.log("ToolBox: Auto-detected tool ID:", currentToolId);
            }
        }
    });

    // Call a toolboxAPI method in the parent window via postMessage
    function callParentAPI(method) {
        var args = Array.prototype.slice.call(arguments, 1);
        return new Promise(function (resolve, reject) {
            const messageId = generateMessageId();

            // Store the promise callbacks
            pendingCalls.set(messageId, { resolve: resolve, reject: reject });

            // Send message to parent window
            window.parent.postMessage(
                {
                    type: "TOOLBOX_API_CALL",
                    messageId: messageId,
                    method: method,
                    args: args,
                },
                "*",
            );

            // Set a timeout to reject if no response
            setTimeout(function () {
                if (pendingCalls.has(messageId)) {
                    pendingCalls.delete(messageId);
                    reject(new Error("API call timeout: " + method));
                }
            }, 30000); // 30 second timeout
        });
    }

    // Create the toolboxAPI proxy object with organized structure
    window.toolboxAPI = {
        // Connection namespace - only getActiveConnection exposed
        connections: {
            getActiveConnection: function () {
                return callParentAPI("connections.getActiveConnection");
            },
        },

        // Utils namespace - utility functions
        utils: {
            showNotification: function (options) {
                return callParentAPI("utils.showNotification", options);
            },
            copyToClipboard: function (text) {
                return callParentAPI("utils.copyToClipboard", text);
            },
            saveFile: function (defaultPath, content) {
                return callParentAPI("utils.saveFile", defaultPath, content);
            },
            getCurrentTheme: function () {
                return callParentAPI("utils.getCurrentTheme");
            },
            executeParallel: function (operations) {
                return callParentAPI("utils.executeParallel", operations);
            },
            showLoading: function (message) {
                return callParentAPI("utils.showLoading", message);
            },
            hideLoading: function () {
                return callParentAPI("utils.hideLoading");
            },
        },

        // Context API - get tool's own context (context-aware)
        getToolContext: function () {
            // Return the stored context that was injected via postMessage
            // NOTE: accessToken is NOT included for security reasons
            // Tools must use secure backend APIs (dataverseAPI) instead of direct token access
            return Promise.resolve(window.TOOLBOX_CONTEXT || { toolId: null, connectionUrl: null });
        },

        // Settings namespace - context-aware tool settings (automatically uses current tool ID)
        settings: {
            // Get all settings for this tool
            getSettings: function () {
                return callParentAPI("settings.getSettings", currentToolId);
            },
            // Get a specific setting by key
            getSetting: function (key) {
                return callParentAPI("settings.getSetting", currentToolId, key);
            },
            // Set a specific setting by key
            setSetting: function (key, value) {
                return callParentAPI("settings.setSetting", currentToolId, key, value);
            },
            // Set all settings (replaces entire settings object)
            setSettings: function (settings) {
                return callParentAPI("settings.setSettings", currentToolId, settings);
            },
        },

        // Terminal operations - context-aware (tool ID determined automatically)
        terminal: {
            // Create terminal - auto-detects tool ID and uses tool name if no name provided
            create: function (options) {
                // Auto-inject tool ID for context-aware operation
                const optionsWithToolId = {
                    ...options,
                    _toolId: currentToolId,
                };
                return callParentAPI("terminal.create", optionsWithToolId);
            },
            execute: function (terminalId, command) {
                return callParentAPI("terminal.execute", terminalId, command);
            },
            close: function (terminalId) {
                return callParentAPI("terminal.close", terminalId);
            },
            get: function (terminalId) {
                return callParentAPI("terminal.get", terminalId);
            },
            // List terminals - returns only terminals for this tool (context-aware)
            list: function () {
                return callParentAPI("terminal.list", currentToolId);
            },
            setVisibility: function (terminalId, visible) {
                return callParentAPI("terminal.setVisibility", terminalId, visible);
            },
        },

        // Events - tool-specific (filtered to current tool)
        events: {
            // Get event history - returns only events for this tool (context-aware)
            getHistory: function (limit) {
                return callParentAPI("events.getHistory", currentToolId, limit);
            },
            // Listen to events - automatically filtered to this tool's events
            on: function (callback) {
                window.addEventListener("message", function (event) {
                    if (event.data.type === "TOOLBOX_EVENT") {
                        const payload = event.data.payload;

                        // Filter events to only those relevant to this tool
                        if (payload && payload.event !== "settings:updated") {
                            // Check if event is tool-specific and matches current tool
                            if (isEventRelevantToTool(payload, currentToolId)) {
                                callback(event, payload);
                            }
                        }
                    }
                });
            },
            off: function (callback) {
                // Cleanup would go here
            },
        },
    };

    /**
     * Check if an event is relevant to the current tool
     * Terminal and tool-specific events should only go to the relevant tool
     */
    function isEventRelevantToTool(payload, toolId) {
        if (!toolId) return true; // If no tool ID yet, allow all events

        const event = payload.event;
        const data = payload.data;

        // Terminal events - only show if terminal belongs to this tool
        if (event.startsWith("terminal:")) {
            return data && data.toolId === toolId;
        }

        // Tool events - only show if about this tool
        if (event === "tool:loaded" || event === "tool:unloaded") {
            return data && data.id === toolId;
        }

        // Connection and notification events are global - show to all tools
        return true;
    }

    // Create Dataverse API (similar to Dataverse Service Client)
    window.dataverseAPI = {
        // CRUD operations
        create: function (entityLogicalName, record) {
            return callParentAPI("dataverse.create", entityLogicalName, record);
        },
        retrieve: function (entityLogicalName, id, columns) {
            return callParentAPI("dataverse.retrieve", entityLogicalName, id, columns);
        },
        update: function (entityLogicalName, id, record) {
            return callParentAPI("dataverse.update", entityLogicalName, id, record);
        },
        delete: function (entityLogicalName, id) {
            return callParentAPI("dataverse.delete", entityLogicalName, id);
        },

        // Retrieve multiple with FetchXML
        retrieveMultiple: function (fetchXml) {
            return callParentAPI("dataverse.retrieveMultiple", fetchXml);
        },

        // Execute message
        execute: function (request) {
            return callParentAPI("dataverse.execute", request);
        },

        // Helper: Retrieve by FetchXML
        fetchXmlQuery: function (fetchXml) {
            return callParentAPI("dataverse.fetchXmlQuery", fetchXml);
        },

        // Get metadata
        getEntityMetadata: function (entityLogicalName, searchByLogicalName, selectColumns) {
            return callParentAPI("dataverse.getEntityMetadata", entityLogicalName, searchByLogicalName, selectColumns);
        },

        // Get all entities metadata
        getAllEntitiesMetadata: function () {
            return callParentAPI("dataverse.getAllEntitiesMetadata");
        },

        // Get entity related metadata
        getEntityRelatedMetadata: function (entityLogicalName, relatedPath, selectColumns) {
            return callParentAPI("dataverse.getEntityRelatedMetadata", entityLogicalName, relatedPath, selectColumns);
        },

        // Get solutions
        getSolutions: function (selectColumns) {
            return callParentAPI("dataverse.getSolutions", selectColumns);
        },

        // Query data with OData
        queryData: function (odataQuery) {
            return callParentAPI("dataverse.queryData", odataQuery);
        },
    };

    console.log("ToolBox API bridge loaded in webview - Organized & Secured");
    console.log("Available APIs: toolboxAPI, dataverseAPI");
})();
