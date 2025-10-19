/**
 * ToolBox API Bridge for Iframes
 * 
 * This script runs in tool iframes and exposes window.toolboxAPI
 * by proxying all calls to the parent window using postMessage.
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

    // Create the toolboxAPI proxy object
    window.toolboxAPI = {
        // Settings
        getUserSettings: function() { return callParentAPI('getUserSettings'); },
        updateUserSettings: function(settings) { return callParentAPI('updateUserSettings', settings); },
        getSetting: function(key) { return callParentAPI('getSetting', key); },
        setSetting: function(key, value) { return callParentAPI('setSetting', key, value); },

        // Connections
        addConnection: function(connection) { return callParentAPI('addConnection', connection); },
        updateConnection: function(id, updates) { return callParentAPI('updateConnection', id, updates); },
        deleteConnection: function(id) { return callParentAPI('deleteConnection', id); },
        getConnections: function() { return callParentAPI('getConnections'); },
        setActiveConnection: function(id) { return callParentAPI('setActiveConnection', id); },
        getActiveConnection: function() { return callParentAPI('getActiveConnection'); },
        disconnectConnection: function() { return callParentAPI('disconnectConnection'); },

        // Tools
        getAllTools: function() { return callParentAPI('getAllTools'); },
        getTool: function(toolId) { return callParentAPI('getTool', toolId); },
        loadTool: function(packageName) { return callParentAPI('loadTool', packageName); },
        unloadTool: function(toolId) { return callParentAPI('unloadTool', toolId); },
        installTool: function(packageName) { return callParentAPI('installTool', packageName); },
        uninstallTool: function(packageName, toolId) { return callParentAPI('uninstallTool', packageName, toolId); },
        getToolWebviewHtml: function(packageName, connectionUrl, accessToken) { 
            return callParentAPI('getToolWebviewHtml', packageName, connectionUrl, accessToken); 
        },
        getToolContext: function() { 
            // Return the stored context that was injected via postMessage
            return Promise.resolve(window.TOOLBOX_CONTEXT || { toolId: null, connectionUrl: null, accessToken: null });
        },

        // Tool Settings
        getToolSettings: function(toolId) { return callParentAPI('getToolSettings', toolId); },
        updateToolSettings: function(toolId, settings) { return callParentAPI('updateToolSettings', toolId, settings); },

        // Notifications
        showNotification: function(options) { return callParentAPI('showNotification', options); },

        // Clipboard
        copyToClipboard: function(text) { return callParentAPI('copyToClipboard', text); },

        // File operations
        saveFile: function(defaultPath, content) { return callParentAPI('saveFile', defaultPath, content); },

        // Terminal operations
        createTerminal: function(toolId, options) { return callParentAPI('createTerminal', toolId, options); },
        executeTerminalCommand: function(terminalId, command) { return callParentAPI('executeTerminalCommand', terminalId, command); },
        closeTerminal: function(terminalId) { return callParentAPI('closeTerminal', terminalId); },
        getTerminal: function(terminalId) { return callParentAPI('getTerminal', terminalId); },
        getToolTerminals: function(toolId) { return callParentAPI('getToolTerminals', toolId); },
        getAllTerminals: function() { return callParentAPI('getAllTerminals'); },
        setTerminalVisibility: function(terminalId, visible) { return callParentAPI('setTerminalVisibility', terminalId, visible); },

        // Events
        getEventHistory: function(limit) { return callParentAPI('getEventHistory', limit); },
        onToolboxEvent: function(callback) {
            window.addEventListener('message', function(event) {
                if (event.data.type === 'TOOLBOX_EVENT') {
                    callback(event, event.data.payload);
                }
            });
        },
        removeToolboxEventListener: function(callback) {
            // Cleanup would go here
        },

        // Auto-update
        checkForUpdates: function() { return callParentAPI('checkForUpdates'); },
        downloadUpdate: function() { return callParentAPI('downloadUpdate'); },
        quitAndInstall: function() { return callParentAPI('quitAndInstall'); },
        getAppVersion: function() { return callParentAPI('getAppVersion'); },
        onUpdateChecking: function(callback) {
            window.addEventListener('message', function(event) {
                if (event.data.type === 'UPDATE_CHECKING') callback();
            });
        },
        onUpdateAvailable: function(callback) {
            window.addEventListener('message', function(event) {
                if (event.data.type === 'UPDATE_AVAILABLE') callback(event.data.info);
            });
        },
        onUpdateNotAvailable: function(callback) {
            window.addEventListener('message', function(event) {
                if (event.data.type === 'UPDATE_NOT_AVAILABLE') callback();
            });
        },
        onUpdateDownloadProgress: function(callback) {
            window.addEventListener('message', function(event) {
                if (event.data.type === 'UPDATE_DOWNLOAD_PROGRESS') callback(event.data.progress);
            });
        },
        onUpdateDownloaded: function(callback) {
            window.addEventListener('message', function(event) {
                if (event.data.type === 'UPDATE_DOWNLOADED') callback(event.data.info);
            });
        },
        onUpdateError: function(callback) {
            window.addEventListener('message', function(event) {
                if (event.data.type === 'UPDATE_ERROR') callback(event.data.error);
            });
        }
    };

    console.log('ToolBox API bridge loaded in webview');
})();
