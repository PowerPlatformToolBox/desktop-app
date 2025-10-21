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

(function() {
    'use strict';

    // Generate unique IDs for IPC messages
    let messageIdCounter = 0;
    function generateMessageId() {
        return 'toolbox-api-' + Date.now() + '-' + messageIdCounter++;
    }

    // Store pending promises for IPC calls
    const pendingCalls = new Map();

    // Listen for responses from parent window
    window.addEventListener('message', function(event) {
        const data = event.data;
        if (data.type === 'TOOLBOX_API_RESPONSE') {
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
    });

    // Call a toolboxAPI method in the parent window via postMessage
    function callParentAPI(method) {
        var args = Array.prototype.slice.call(arguments, 1);
        return new Promise(function(resolve, reject) {
            const messageId = generateMessageId();
            
            // Store the promise callbacks
            pendingCalls.set(messageId, { resolve: resolve, reject: reject });
            
            // Send message to parent window
            window.parent.postMessage({
                type: 'TOOLBOX_API_CALL',
                messageId: messageId,
                method: method,
                args: args
            }, '*');
            
            // Set a timeout to reject if no response
            setTimeout(function() {
                if (pendingCalls.has(messageId)) {
                    pendingCalls.delete(messageId);
                    reject(new Error('API call timeout: ' + method));
                }
            }, 30000); // 30 second timeout
        });
    }

    // Create the toolboxAPI proxy object with organized structure
    window.toolboxAPI = {
        // Connection namespace - only getActiveConnection exposed
        connections: {
            getActiveConnection: function() { return callParentAPI('connections.getActiveConnection'); }
        },

        // Utils namespace - utility functions
        utils: {
            showNotification: function(options) { return callParentAPI('utils.showNotification', options); },
            copyToClipboard: function(text) { return callParentAPI('utils.copyToClipboard', text); },
            saveFile: function(defaultPath, content) { return callParentAPI('utils.saveFile', defaultPath, content); },
            getCurrentTheme: function() { return callParentAPI('utils.getCurrentTheme'); }
        },

        // Context API - get tool's own context (context-aware)
        getToolContext: function() { 
            // Return the stored context that was injected via postMessage
            // Note: accessToken is no longer included here (stored securely)
            return Promise.resolve(window.TOOLBOX_CONTEXT || { toolId: null, connectionUrl: null });
        },

        // Terminal operations - context-aware (tool ID determined automatically)
        terminal: {
            create: function(options) { return callParentAPI('terminal.create', options); },
            execute: function(terminalId, command) { return callParentAPI('terminal.execute', terminalId, command); },
            close: function(terminalId) { return callParentAPI('terminal.close', terminalId); },
            get: function(terminalId) { return callParentAPI('terminal.get', terminalId); },
            list: function() { return callParentAPI('terminal.list'); }, // Returns terminals for this tool only
            setVisibility: function(terminalId, visible) { return callParentAPI('terminal.setVisibility', terminalId, visible); }
        },

        // Events - tool-specific
        events: {
            getHistory: function(limit) { return callParentAPI('events.getHistory', limit); }, // Tool-specific history
            on: function(callback) {
                window.addEventListener('message', function(event) {
                    if (event.data.type === 'TOOLBOX_EVENT') {
                        // Filter out settings:updated events
                        if (event.data.payload && event.data.payload.event !== 'settings:updated') {
                            callback(event, event.data.payload);
                        }
                    }
                });
            },
            off: function(callback) {
                // Cleanup would go here
            }
        }
    };

    // Create Dataverse API (similar to Dataverse Service Client)
    window.dataverseAPI = {
        // CRUD operations
        create: function(entityLogicalName, record) {
            return callParentAPI('dataverse.create', entityLogicalName, record);
        },
        retrieve: function(entityLogicalName, id, columns) {
            return callParentAPI('dataverse.retrieve', entityLogicalName, id, columns);
        },
        update: function(entityLogicalName, id, record) {
            return callParentAPI('dataverse.update', entityLogicalName, id, record);
        },
        delete: function(entityLogicalName, id) {
            return callParentAPI('dataverse.delete', entityLogicalName, id);
        },

        // Retrieve multiple with FetchXML
        retrieveMultiple: function(fetchXml) {
            return callParentAPI('dataverse.retrieveMultiple', fetchXml);
        },

        // Execute message
        execute: function(request) {
            return callParentAPI('dataverse.execute', request);
        },

        // Helper: Retrieve by FetchXML
        fetchXmlQuery: function(fetchXml) {
            return callParentAPI('dataverse.fetchXmlQuery', fetchXml);
        },

        // Get metadata
        getEntityMetadata: function(entityLogicalName) {
            return callParentAPI('dataverse.getEntityMetadata', entityLogicalName);
        },

        // Get all entities metadata
        getAllEntitiesMetadata: function() {
            return callParentAPI('dataverse.getAllEntitiesMetadata');
        }
    };

    console.log('ToolBox API bridge loaded in webview - Organized & Secured');
    console.log('Available APIs: toolboxAPI, dataverseAPI');
})();
