/// <reference types="@pptb/types" />

/**
 * HTML Sample Tool for Power Platform Tool Box
 * 
 * This sample demonstrates:
 * - ToolBox API usage (connections, utils, terminal, events)
 * - Dataverse API usage (CRUD, queries, metadata)
 * - Event-driven architecture
 * - Error handling
 * - TypeScript with type safety
 */

// Global API references
const toolbox = window.toolboxAPI;
const dataverse = window.dataverseAPI;

// Application state
let currentConnection: ToolBoxAPI.DataverseConnection | null = null;
let currentTerminal: ToolBoxAPI.Terminal | null = null;
let createdAccountId: string | null = null;

/**
 * Initialize the application
 */
async function initialize() {
    log('Initializing HTML Sample Tool...', 'info');

    try {
        // Check connection
        await refreshConnection();

        // Subscribe to events
        subscribeToEvents();

        // Setup UI event handlers
        setupEventHandlers();

        // Apply theme
        await applyTheme();

        log('Tool initialized successfully', 'success');
    } catch (error) {
        log(`Initialization error: ${(error as Error).message}`, 'error');
    }
}

/**
 * Refresh connection information
 */
async function refreshConnection() {
    try {
        currentConnection = await toolbox.connections.getActiveConnection();

        const connectionInfo = document.getElementById('connection-info');
        if (!connectionInfo) return;

        if (currentConnection) {
            const envClass = currentConnection.environment.toLowerCase();
            connectionInfo.className = 'info-box success';
            connectionInfo.innerHTML = `
                <div class="connection-details">
                    <div class="connection-item">
                        <strong>Name:</strong>
                        <span>${currentConnection.name}</span>
                    </div>
                    <div class="connection-item">
                        <strong>URL:</strong>
                        <span>${currentConnection.url}</span>
                    </div>
                    <div class="connection-item">
                        <strong>Environment:</strong>
                        <span class="env-badge ${envClass}">${currentConnection.environment}</span>
                    </div>
                    <div class="connection-item">
                        <strong>ID:</strong>
                        <span>${currentConnection.id}</span>
                    </div>
                </div>
            `;
            log(`Connected to: ${currentConnection.name}`, 'success');
        } else {
            connectionInfo.className = 'info-box warning';
            connectionInfo.innerHTML = '<p><strong>⚠️ No active connection</strong><br>Please connect to a Dataverse environment to use this tool.</p>';
            log('No active connection found', 'warning');
        }
    } catch (error) {
        log(`Error refreshing connection: ${(error as Error).message}`, 'error');
    }
}

/**
 * Subscribe to platform events
 */
function subscribeToEvents() {
    toolbox.events.on((event, payload) => {
        log(`Event: ${payload.event}`, 'info');

        switch (payload.event) {
            case 'connection:updated':
            case 'connection:created':
                refreshConnection();
                break;

            case 'connection:deleted':
                currentConnection = null;
                refreshConnection();
                break;

            case 'terminal:output':
                handleTerminalOutput(payload.data);
                break;

            case 'terminal:command:completed':
                handleCommandCompleted(payload.data);
                break;

            case 'terminal:error':
                log(`Terminal error: ${(payload.data as any).error}`, 'error');
                break;
        }
    });
}

/**
 * Setup UI event handlers
 */
function setupEventHandlers() {
    // Notification buttons
    document.getElementById('show-success-btn')?.addEventListener('click', () => 
        showNotification('Success!', 'Operation completed successfully', 'success'));
    
    document.getElementById('show-info-btn')?.addEventListener('click', () => 
        showNotification('Information', 'This is an informational message', 'info'));
    
    document.getElementById('show-warning-btn')?.addEventListener('click', () => 
        showNotification('Warning', 'Please review this warning', 'warning'));
    
    document.getElementById('show-error-btn')?.addEventListener('click', () => 
        showNotification('Error', 'An error has occurred', 'error'));

    // Utility buttons
    document.getElementById('copy-clipboard-btn')?.addEventListener('click', copyToClipboard);
    document.getElementById('get-theme-btn')?.addEventListener('click', showCurrentTheme);
    document.getElementById('save-file-btn')?.addEventListener('click', saveDataToFile);

    // Terminal buttons
    document.getElementById('create-terminal-btn')?.addEventListener('click', createTerminal);
    document.getElementById('execute-command-btn')?.addEventListener('click', executeTerminalCommand);
    document.getElementById('close-terminal-btn')?.addEventListener('click', closeTerminal);

    // Dataverse query button
    document.getElementById('query-accounts-btn')?.addEventListener('click', queryAccounts);

    // CRUD buttons
    document.getElementById('create-account-btn')?.addEventListener('click', createAccount);
    document.getElementById('update-account-btn')?.addEventListener('click', updateAccount);
    document.getElementById('delete-account-btn')?.addEventListener('click', deleteAccount);

    // Metadata button
    document.getElementById('get-metadata-btn')?.addEventListener('click', getAccountMetadata);

    // Clear log button
    document.getElementById('clear-log-btn')?.addEventListener('click', clearLog);
}

/**
 * Show notification
 */
async function showNotification(title: string, body: string, type: 'success' | 'info' | 'warning' | 'error') {
    try {
        await toolbox.utils.showNotification({
            title,
            body,
            type,
            duration: 3000
        });
        log(`Notification shown: ${title} - ${body}`, type);
    } catch (error) {
        log(`Error showing notification: ${(error as Error).message}`, 'error');
    }
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard() {
    try {
        const data = {
            timestamp: new Date().toISOString(),
            connection: currentConnection?.name || 'No connection',
            message: 'This data was copied from the HTML Sample Tool'
        };

        await toolbox.utils.copyToClipboard(JSON.stringify(data, null, 2));
        await showNotification('Copied!', 'Data copied to clipboard', 'success');
    } catch (error) {
        log(`Error copying to clipboard: ${(error as Error).message}`, 'error');
    }
}

/**
 * Show current theme
 */
async function showCurrentTheme() {
    try {
        const theme = await toolbox.utils.getCurrentTheme();
        await showNotification('Current Theme', `The current theme is: ${theme}`, 'info');
        log(`Current theme: ${theme}`, 'info');
    } catch (error) {
        log(`Error getting theme: ${(error as Error).message}`, 'error');
    }
}

/**
 * Save data to file
 */
async function saveDataToFile() {
    try {
        const data = {
            timestamp: new Date().toISOString(),
            connection: currentConnection ? {
                name: currentConnection.name,
                url: currentConnection.url,
                environment: currentConnection.environment
            } : null,
            message: 'Export from HTML Sample Tool'
        };

        const filePath = await toolbox.utils.saveFile(
            'sample-export.json',
            JSON.stringify(data, null, 2)
        );

        if (filePath) {
            await showNotification('File Saved', `File saved to: ${filePath}`, 'success');
            log(`File saved to: ${filePath}`, 'success');
        } else {
            log('File save cancelled', 'info');
        }
    } catch (error) {
        log(`Error saving file: ${(error as Error).message}`, 'error');
    }
}

/**
 * Create a terminal
 */
async function createTerminal() {
    try {
        currentTerminal = await toolbox.terminal.create({
            name: 'HTML Sample Terminal'
        });

        log(`Terminal created: ${currentTerminal.name} (${currentTerminal.id})`, 'success');
        
        // Enable command buttons
        const executeBtn = document.getElementById('execute-command-btn') as HTMLButtonElement;
        const closeBtn = document.getElementById('close-terminal-btn') as HTMLButtonElement;
        
        if (executeBtn) executeBtn.disabled = false;
        if (closeBtn) closeBtn.disabled = false;

        await showNotification('Terminal Created', `Terminal ${currentTerminal.name} is ready`, 'success');
    } catch (error) {
        log(`Error creating terminal: ${(error as Error).message}`, 'error');
    }
}

/**
 * Execute terminal command
 */
async function executeTerminalCommand() {
    if (!currentTerminal) {
        await showNotification('No Terminal', 'Please create a terminal first', 'warning');
        return;
    }

    try {
        const isWindows = navigator.platform.toLowerCase().includes('win');
        const command = isWindows ? 'dir' : 'ls -la';

        const output = document.getElementById('terminal-output');
        if (output) {
            output.textContent = `> ${command}\n`;
        }

        log(`Executing command: ${command}`, 'info');
        await toolbox.terminal.execute(currentTerminal.id, command);
    } catch (error) {
        log(`Error executing command: ${(error as Error).message}`, 'error');
    }
}

/**
 * Close terminal
 */
async function closeTerminal() {
    if (!currentTerminal) return;

    try {
        await toolbox.terminal.close(currentTerminal.id);
        log('Terminal closed', 'info');
        currentTerminal = null;

        // Disable command buttons
        const executeBtn = document.getElementById('execute-command-btn') as HTMLButtonElement;
        const closeBtn = document.getElementById('close-terminal-btn') as HTMLButtonElement;
        
        if (executeBtn) executeBtn.disabled = true;
        if (closeBtn) closeBtn.disabled = true;

        const output = document.getElementById('terminal-output');
        if (output) output.textContent = '';
    } catch (error) {
        log(`Error closing terminal: ${(error as Error).message}`, 'error');
    }
}

/**
 * Handle terminal output events
 */
function handleTerminalOutput(data: any) {
    if (!currentTerminal || data.terminalId !== currentTerminal.id) return;

    const output = document.getElementById('terminal-output');
    if (output) {
        output.textContent += data.data;
        output.scrollTop = output.scrollHeight;
    }
}

/**
 * Handle command completed events
 */
function handleCommandCompleted(data: any) {
    if (!currentTerminal || data.terminalId !== currentTerminal.id) return;

    const output = document.getElementById('terminal-output');
    if (output) {
        output.textContent += `\n[Command completed with exit code: ${data.exitCode}]\n`;
        output.scrollTop = output.scrollHeight;
    }
}

/**
 * Query accounts from Dataverse
 */
async function queryAccounts() {
    if (!currentConnection) {
        await showNotification('No Connection', 'Please connect to a Dataverse environment', 'warning');
        return;
    }

    try {
        const output = document.getElementById('query-output');
        if (output) output.textContent = 'Querying accounts...\n';

        const fetchXml = `
<fetch top="10">
  <entity name="account">
    <attribute name="name" />
    <attribute name="accountid" />
    <attribute name="emailaddress1" />
    <attribute name="telephone1" />
    <order attribute="name" />
  </entity>
</fetch>
        `.trim();

        const result = await dataverse.fetchXmlQuery(fetchXml);

        if (output) {
            output.textContent = `Found ${result.value.length} account(s):\n\n`;
            result.value.forEach((account: any, index: number) => {
                output.textContent += `${index + 1}. ${account.name}\n`;
                output.textContent += `   ID: ${account.accountid}\n`;
                if (account.emailaddress1) output.textContent += `   Email: ${account.emailaddress1}\n`;
                if (account.telephone1) output.textContent += `   Phone: ${account.telephone1}\n`;
                output.textContent += '\n';
            });
        }

        log(`Queried ${result.value.length} accounts`, 'success');
    } catch (error) {
        const output = document.getElementById('query-output');
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error querying accounts: ${(error as Error).message}`, 'error');
    }
}

/**
 * Create a new account
 */
async function createAccount() {
    if (!currentConnection) {
        await showNotification('No Connection', 'Please connect to a Dataverse environment', 'warning');
        return;
    }

    try {
        const nameInput = document.getElementById('account-name') as HTMLInputElement;
        const name = nameInput?.value || 'Sample Account';

        const output = document.getElementById('crud-output');
        if (output) output.textContent = 'Creating account...\n';

        const result = await dataverse.create('account', {
            name: name,
            emailaddress1: 'sample@example.com',
            telephone1: '555-0100',
            description: 'Created by HTML Sample Tool'
        });

        createdAccountId = result.id;

        if (output) {
            output.textContent = `Account created successfully!\n\n`;
            output.textContent += `ID: ${result.id}\n`;
            output.textContent += `Name: ${name}\n`;
        }

        // Enable update and delete buttons
        const updateBtn = document.getElementById('update-account-btn') as HTMLButtonElement;
        const deleteBtn = document.getElementById('delete-account-btn') as HTMLButtonElement;
        if (updateBtn) updateBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;

        await showNotification('Account Created', `Account "${name}" created successfully`, 'success');
        log(`Account created: ${result.id}`, 'success');
    } catch (error) {
        const output = document.getElementById('crud-output');
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error creating account: ${(error as Error).message}`, 'error');
    }
}

/**
 * Update the created account
 */
async function updateAccount() {
    if (!createdAccountId) {
        await showNotification('No Account', 'Please create an account first', 'warning');
        return;
    }

    try {
        const output = document.getElementById('crud-output');
        if (output) output.textContent = 'Updating account...\n';

        await dataverse.update('account', createdAccountId, {
            description: 'Updated by HTML Sample Tool at ' + new Date().toISOString(),
            telephone1: '555-0200'
        });

        if (output) {
            output.textContent = `Account updated successfully!\n\n`;
            output.textContent += `ID: ${createdAccountId}\n`;
            output.textContent += `Updated fields: description, telephone1\n`;
        }

        await showNotification('Account Updated', 'Account updated successfully', 'success');
        log(`Account updated: ${createdAccountId}`, 'success');
    } catch (error) {
        const output = document.getElementById('crud-output');
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error updating account: ${(error as Error).message}`, 'error');
    }
}

/**
 * Delete the created account
 */
async function deleteAccount() {
    if (!createdAccountId) {
        await showNotification('No Account', 'Please create an account first', 'warning');
        return;
    }

    try {
        const output = document.getElementById('crud-output');
        if (output) output.textContent = 'Deleting account...\n';

        await dataverse.delete('account', createdAccountId);

        if (output) {
            output.textContent = `Account deleted successfully!\n\n`;
            output.textContent += `ID: ${createdAccountId}\n`;
        }

        // Disable update and delete buttons
        const updateBtn = document.getElementById('update-account-btn') as HTMLButtonElement;
        const deleteBtn = document.getElementById('delete-account-btn') as HTMLButtonElement;
        if (updateBtn) updateBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;

        await showNotification('Account Deleted', 'Account deleted successfully', 'success');
        log(`Account deleted: ${createdAccountId}`, 'success');
        createdAccountId = null;
    } catch (error) {
        const output = document.getElementById('crud-output');
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error deleting account: ${(error as Error).message}`, 'error');
    }
}

/**
 * Get account metadata
 */
async function getAccountMetadata() {
    if (!currentConnection) {
        await showNotification('No Connection', 'Please connect to a Dataverse environment', 'warning');
        return;
    }

    try {
        const output = document.getElementById('metadata-output');
        if (output) output.textContent = 'Retrieving metadata...\n';

        const metadata = await dataverse.getEntityMetadata('account');

        if (output) {
            output.textContent = 'Account Entity Metadata:\n\n';
            output.textContent += `Logical Name: ${metadata.LogicalName}\n`;
            output.textContent += `Metadata ID: ${metadata.MetadataId}\n`;
            output.textContent += `Display Name: ${metadata.DisplayName?.LocalizedLabels?.[0]?.Label || 'N/A'}\n`;
            output.textContent += `Attributes: ${metadata.Attributes?.length || 0}\n`;
            
            if (metadata.Attributes && metadata.Attributes.length > 0) {
                output.textContent += '\nSample Attributes:\n';
                metadata.Attributes.slice(0, 5).forEach((attr: any) => {
                    output.textContent += `  - ${attr.LogicalName} (${attr.AttributeType})\n`;
                });
            }
        }

        log('Account metadata retrieved', 'success');
    } catch (error) {
        const output = document.getElementById('metadata-output');
        if (output) output.textContent = `Error: ${(error as Error).message}`;
        log(`Error getting metadata: ${(error as Error).message}`, 'error');
    }
}

/**
 * Apply current theme
 */
async function applyTheme() {
    try {
        const theme = await toolbox.utils.getCurrentTheme();
        document.body.setAttribute('data-theme', theme);
    } catch (error) {
        log(`Error applying theme: ${(error as Error).message}`, 'error');
    }
}

/**
 * Log message to event log
 */
function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const logDiv = document.getElementById('event-log');
    if (!logDiv) return;

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span>${message}</span>
    `;

    logDiv.insertBefore(logEntry, logDiv.firstChild);
    
    // Keep only last 50 entries
    while (logDiv.children.length > 50) {
        logDiv.removeChild(logDiv.lastChild!);
    }

    console.log(`[${type.toUpperCase()}] ${message}`);
}

/**
 * Clear event log
 */
function clearLog() {
    const logDiv = document.getElementById('event-log');
    if (logDiv) {
        logDiv.innerHTML = '';
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
