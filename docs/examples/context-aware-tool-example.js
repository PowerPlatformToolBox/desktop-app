/**
 * Example Tool Using Context-Aware & Secure APIs
 * 
 * This example demonstrates how to use the new context-aware APIs
 * that automatically detect tool ID and provide tool-specific resources.
 */

// ============================================
// 1. Getting Tool Context
// ============================================

async function initializeTool() {
    // Get tool context - tool ID is auto-detected from parent message
    const context = await toolboxAPI.getToolContext();
    
    console.log('Tool ID:', context.toolId);           // Auto-detected
    console.log('Connection URL:', context.connectionUrl);
    // NOTE: accessToken is NO LONGER available for security
    
    return context;
}

// ============================================
// 2. Using Terminals (Context-Aware)
// ============================================

async function createToolTerminal() {
    // Create terminal - no need to specify tool ID or terminal name
    // Name automatically defaults to tool name (e.g., "Power Platform Explorer")
    const terminal = await toolboxAPI.terminal.create({
        shell: '/bin/bash',
        cwd: '/home/user/projects'
        // 'name' is optional - defaults to tool name
        // 'toolId' is auto-injected - no need to specify
    });
    
    console.log('Created terminal:', terminal.id);
    return terminal;
}

async function executeCommand(terminalId, command) {
    // Execute a command in the terminal
    const result = await toolboxAPI.terminal.execute(terminalId, command);
    console.log('Command output:', result.output);
    return result;
}

async function listToolTerminals() {
    // Get all terminals for THIS TOOL ONLY
    // No need to filter by tool ID - already done automatically
    const terminals = await toolboxAPI.terminal.list();
    
    console.log(`This tool has ${terminals.length} terminal(s)`);
    terminals.forEach(t => {
        console.log(`  - ${t.name} (${t.id})`);
    });
    
    return terminals;
}

async function closeTerminal(terminalId) {
    await toolboxAPI.terminal.close(terminalId);
    console.log('Terminal closed');
}

// ============================================
// 3. Using Events (Tool-Specific)
// ============================================

function setupEventListeners() {
    // Listen to events - automatically filtered to this tool
    toolboxAPI.events.on((event, payload) => {
        console.log('Tool-specific event received:', payload.event);
        
        switch (payload.event) {
            case 'terminal:created':
                // Only terminals created by THIS TOOL
                console.log('Terminal created:', payload.data);
                break;
                
            case 'terminal:output':
                // Only output from THIS TOOL's terminals
                console.log('Terminal output:', payload.data);
                break;
                
            case 'terminal:closed':
                // Only when THIS TOOL's terminals are closed
                console.log('Terminal closed:', payload.data);
                break;
                
            case 'connection:updated':
                // Global event - all tools receive this
                console.log('Connection updated');
                break;
                
            case 'notification:shown':
                // Global event - all tools receive this
                console.log('Notification shown');
                break;
        }
    });
}

async function getToolEventHistory() {
    // Get event history filtered to this tool
    const events = await toolboxAPI.events.getHistory(20); // Last 20 events
    
    console.log('Recent events for this tool:');
    events.forEach(e => {
        console.log(`  ${e.timestamp}: ${e.event}`);
    });
    
    return events;
}

// ============================================
// 4. Using Tool Settings (Context-Aware)
// ============================================

async function saveToolSettings() {
    // Save individual settings
    await toolboxAPI.settings.setSetting('theme', 'dark');
    await toolboxAPI.settings.setSetting('autoRefresh', true);
    await toolboxAPI.settings.setSetting('refreshInterval', 5000);
    await toolboxAPI.settings.setSetting('userPreferences', {
        showWelcome: false,
        defaultView: 'grid'
    });
    
    console.log('Settings saved');
}

async function loadToolSettings() {
    // Get all settings for this tool
    const allSettings = await toolboxAPI.settings.getSettings();
    console.log('All settings:', allSettings);
    
    // Get individual settings
    const theme = await toolboxAPI.settings.getSetting('theme');
    const autoRefresh = await toolboxAPI.settings.getSetting('autoRefresh');
    const refreshInterval = await toolboxAPI.settings.getSetting('refreshInterval');
    
    console.log('Theme:', theme); // 'dark'
    console.log('Auto-refresh:', autoRefresh); // true
    console.log('Refresh interval:', refreshInterval); // 5000
    
    return allSettings;
}

async function updateBulkSettings() {
    // Update multiple settings at once
    await toolboxAPI.settings.setSettings({
        theme: 'light',
        autoRefresh: false,
        refreshInterval: 10000,
        lastSync: new Date().toISOString()
    });
    
    console.log('Bulk settings updated');
}

async function checkSettingExists() {
    // Check if a setting exists
    const value = await toolboxAPI.settings.getSetting('nonExistentKey');
    if (value === undefined) {
        console.log('Setting does not exist');
    }
}

// ============================================
// 5. Using Dataverse API (Secure)
// ============================================

async function queryDataverse() {
    // Use dataverseAPI instead of raw access tokens
    // The API handles authentication securely in the background
    
    try {
        // Retrieve a single record
        const account = await dataverseAPI.retrieve(
            'account',
            'accountId-here',
            ['name', 'accountnumber', 'createdon']
        );
        console.log('Account:', account);
        
        // Query with FetchXML
        const fetchXml = `
            <fetch top="10">
                <entity name="account">
                    <attribute name="name" />
                    <attribute name="accountnumber" />
                    <order attribute="name" />
                </entity>
            </fetch>
        `;
        const results = await dataverseAPI.fetchXmlQuery(fetchXml);
        console.log('Query results:', results);
        
        // Create a new record
        const newContact = await dataverseAPI.create('contact', {
            firstname: 'John',
            lastname: 'Doe',
            emailaddress1: 'john.doe@example.com'
        });
        console.log('Created contact:', newContact);
        
        // Update a record
        await dataverseAPI.update('contact', newContact.id, {
            jobtitle: 'Developer'
        });
        console.log('Updated contact');
        
    } catch (error) {
        console.error('Dataverse API error:', error);
    }
}

// ============================================
// 6. Complete Tool Example
// ============================================

async function main() {
    console.log('Starting tool...');
    
    // 1. Initialize and get context
    const context = await initializeTool();
    
    // 2. Set up event listeners
    setupEventListeners();
    
    // 3. Load saved settings
    const settings = await loadToolSettings();
    if (!settings.theme) {
        // First time running - save default settings
        await saveToolSettings();
    }
    
    // 4. Check if connected to Dataverse
    if (!context.connectionUrl) {
        console.warn('No active connection. Please connect to Dataverse.');
        // Show UI to prompt user to connect
        await toolboxAPI.utils.showNotification({
            title: 'No Connection',
            body: 'Please connect to a Dataverse environment',
            type: 'warning'
        });
        return;
    }
    
    // 5. Create a terminal for this tool
    const terminal = await createToolTerminal();
    
    // 6. Execute some commands
    await executeCommand(terminal.id, 'echo "Hello from tool!"');
    await executeCommand(terminal.id, 'pwd');
    
    // 7. List all terminals for this tool
    await listToolTerminals();
    
    // 8. Query Dataverse
    await queryDataverse();
    
    // 9. Get event history
    await getToolEventHistory();
    
    console.log('Tool initialized successfully!');
}

// ============================================
// 7. Utility Functions
// ============================================

async function showNotification(title, message, type = 'info') {
    await toolboxAPI.utils.showNotification({
        title: title,
        body: message,
        type: type // 'info', 'success', 'warning', 'error'
    });
}

async function copyToClipboard(text) {
    await toolboxAPI.utils.copyToClipboard(text);
    await showNotification('Copied', 'Text copied to clipboard', 'success');
}

async function saveFile(filename, content) {
    const filePath = await toolboxAPI.utils.saveFile(filename, content);
    if (filePath) {
        await showNotification('Saved', `File saved to ${filePath}`, 'success');
    }
}

async function getActiveConnection() {
    // Get active connection info (without sensitive data)
    const connection = await toolboxAPI.connections.getActiveConnection();
    if (connection) {
        console.log('Connected to:', connection.name);
        console.log('Environment:', connection.environment);
        console.log('URL:', connection.url);
    } else {
        console.log('No active connection');
    }
    return connection;
}

// ============================================
// Start the tool
// ============================================

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    main().catch(error => {
        console.error('Tool initialization failed:', error);
    });
});

// ============================================
// Key Takeaways
// ============================================

/*
 * 1. Tool ID is AUTO-DETECTED - no need to pass it manually
 * 
 * 2. Terminal names DEFAULT to tool name - no need to specify
 * 
 * 3. Terminal.list() returns ONLY this tool's terminals
 * 
 * 4. Events are AUTOMATICALLY FILTERED to this tool
 * 
 * 5. Settings are AUTOMATICALLY SCOPED to this tool - each tool has its own isolated settings
 * 
 * 6. AccessToken is NOT available - use dataverseAPI instead
 * 
 * 7. All sensitive data is encrypted automatically
 * 
 * 8. Simpler, cleaner code with better security
 */
