/**
 * Example: Listening to ToolBox Events in Tools
 * 
 * This example demonstrates how tools can listen to events emitted by the ToolBox application.
 * Tools run in isolated webview contexts and can subscribe to events using the toolboxAPI.
 */

// Wait for the toolboxAPI to be available
if (typeof window.toolboxAPI !== 'undefined') {
    console.log('ToolBox API loaded successfully');

    // Subscribe to all events
    window.toolboxAPI.events.on((event, payload) => {
        console.log('Event received:', payload.event, payload.data);

        // Handle specific events
        switch (payload.event) {
            // Connection Events
            case 'connection:created':
                console.log('New connection created:', payload.data);
                // Tool can update its UI to show the new connection
                break;

            case 'connection:updated':
                console.log('Connection updated:', payload.data);
                // Tool can refresh its connection-dependent data
                // Check if it's a token refresh: payload.data.tokenRefreshed === true
                // Check if connection was disconnected: payload.data.disconnected === true
                if (payload.data.disconnected) {
                    console.log('Connection disconnected');
                    // Tool should handle loss of active connection
                    // Clear any cached data that depends on the connection
                    // Update UI to show disconnected state
                }
                break;

            case 'connection:deleted':
                console.log('Connection deleted:', payload.data);
                // Tool can clear connection-dependent state
                break;

            // Settings Events
            case 'settings:updated':
                console.log('Settings updated:', payload.data);
                // General settings were updated
                // Tools can check if theme changed: payload.data.theme
                // Tools typically don't need to handle this unless they care about global settings
                if (payload.data.theme) {
                    console.log('Theme changed to:', payload.data.theme);
                    updateToolTheme(payload.data.theme);
                }
                break;

            // Tool Events (only for this tool)
            case 'tool:loaded':
                console.log('Tool loaded:', payload.data);
                // Another tool was loaded (tools only receive events about themselves)
                break;

            case 'tool:unloaded':
                console.log('Tool unloaded:', payload.data);
                // Another tool was unloaded (tools only receive events about themselves)
                break;

            // Terminal Events (only for this tool's terminals)
            case 'terminal:created':
                console.log('Terminal created:', payload.data);
                // A new terminal was created for this tool
                break;

            case 'terminal:closed':
                console.log('Terminal closed:', payload.data);
                // A terminal belonging to this tool was closed
                break;

            case 'terminal:output':
                console.log('Terminal output:', payload.data);
                // Output from a terminal belonging to this tool
                break;

            case 'terminal:command:completed':
                console.log('Terminal command completed:', payload.data);
                // A command in this tool's terminal completed
                break;

            case 'terminal:error':
                console.log('Terminal error:', payload.data);
                // An error occurred in a terminal belonging to this tool
                break;

            // Notification Events
            case 'notification:shown':
                console.log('Notification shown:', payload.data);
                // A notification was displayed to the user
                break;

            default:
                console.log('Unknown event:', payload.event);
        }
    });

    // Example: Get event history
    window.toolboxAPI.events.getHistory(10).then(events => {
        console.log('Last 10 events:', events);
    });
}

/**
 * Example function to update tool's theme
 */
function updateToolTheme(theme) {
    // Resolve 'system' theme to actual theme
    let actualTheme = theme;
    if (theme === 'system') {
        actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // Apply theme to tool's UI
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${actualTheme}-theme`);
    
    console.log(`Tool theme updated to: ${actualTheme}`);
}

/**
 * Example: Handle connection state changes
 */
async function checkConnectionState() {
    try {
        const connection = await window.toolboxAPI.connections.getActiveConnection();
        
        if (connection) {
            console.log('Active connection:', connection.name);
            // Tool can proceed with connection-dependent operations
        } else {
            console.log('No active connection');
            // Tool should disable connection-dependent features
        }
    } catch (error) {
        console.error('Failed to get active connection:', error);
    }
}

// Initialize
checkConnectionState();
