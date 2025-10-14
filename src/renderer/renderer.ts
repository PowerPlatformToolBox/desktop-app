/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./types.d.ts" />
/* eslint-enable @typescript-eslint/triple-slash-reference */

// Navigation
function switchView(viewName: string) {
    const views = document.querySelectorAll('.view');
    const navItems = document.querySelectorAll('.nav-item');

    views.forEach(view => {
        view.classList.remove('active');
    });

    navItems.forEach(item => {
        item.classList.remove('active');
    });

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.add('active');
    }

    const targetNav = document.querySelector(`[data-view="${viewName}"]`);
    if (targetNav) {
        targetNav.classList.add('active');
    }
}

// Tools Management
async function loadTools() {
    const toolsGrid = document.getElementById('tools-grid');
    if (!toolsGrid) return;

    const tools = await window.toolboxAPI.getAllTools();

    if (tools.length === 0) {
        toolsGrid.innerHTML = `
            <div class="empty-state">
                <p>No tools installed yet.</p>
                <p class="empty-state-hint">Install tools from the tool library to get started.</p>
            </div>
        `;
        return;
    }

    toolsGrid.innerHTML = tools.map(tool => `
        <div class="tool-card">
            <div class="tool-card-header">
                <span class="tool-icon">${tool.icon || '🔧'}</span>
                <div>
                    <div class="tool-name">${tool.name}</div>
                </div>
            </div>
            <div class="tool-description">${tool.description}</div>
            <div class="tool-meta">
                <span>v${tool.version}</span>
                <span>${tool.author}</span>
            </div>
            <div class="tool-actions">
                <button class="btn btn-primary" onclick="launchTool('${tool.id}')">Launch</button>
                <button class="btn btn-secondary" onclick="toolSettings('${tool.id}')">Settings</button>
                <button class="btn btn-danger" onclick="uninstallTool('${tool.id}')">Uninstall</button>
            </div>
        </div>
    `).join('');
}

// Tool library with predefined tools
const toolLibrary = [
    {
        id: '@powerplatform/entity-editor',
        name: 'Entity Editor',
        description: 'Edit Dataverse entities and records',
        author: 'PowerPlatform ToolBox',
        category: 'Data Management'
    },
    {
        id: '@powerplatform/solution-manager',
        name: 'Solution Manager',
        description: 'Manage and deploy solutions',
        author: 'PowerPlatform ToolBox',
        category: 'Solutions'
    },
    {
        id: '@powerplatform/plugin-tracer',
        name: 'Plugin Trace Viewer',
        description: 'View and analyze plugin traces',
        author: 'PowerPlatform ToolBox',
        category: 'Development'
    },
    {
        id: '@powerplatform/bulk-data-tools',
        name: 'Bulk Data Tools',
        description: 'Import and export data in bulk',
        author: 'PowerPlatform ToolBox',
        category: 'Data Management'
    },
    {
        id: '@powerplatform/security-analyzer',
        name: 'Security Analyzer',
        description: 'Analyze security roles and permissions',
        author: 'PowerPlatform ToolBox',
        category: 'Security'
    }
];

function loadToolLibrary() {
    const libraryList = document.getElementById('tool-library-list');
    if (!libraryList) return;

    libraryList.innerHTML = toolLibrary.map(tool => `
        <div class="tool-library-item">
            <div class="tool-library-info">
                <div class="tool-library-name">${tool.name}</div>
                <div class="tool-library-desc">${tool.description}</div>
                <div class="tool-library-desc">Category: ${tool.category}</div>
            </div>
            <button class="btn btn-primary" onclick="installToolFromLibrary('${tool.id}', '${tool.name}')">Install</button>
        </div>
    `).join('');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function installToolFromLibrary(packageName: string, toolName: string) {
    if (!packageName) {
        await window.toolboxAPI.showNotification({
            title: 'Invalid Package',
            body: 'Please select a valid tool to install.',
            type: 'error'
        });
        return;
    }

    try {
        await window.toolboxAPI.showNotification({
            title: 'Installing Tool',
            body: `Installing ${toolName}...`,
            type: 'info'
        });

        await window.toolboxAPI.installTool(packageName);

        await window.toolboxAPI.showNotification({
            title: 'Tool Installed',
            body: `${toolName} has been installed successfully.`,
            type: 'success'
        });

        closeModal('install-tool-modal');
        await loadTools();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: 'Installation Failed',
            body: `Failed to install ${toolName}: ${(error as Error).message}`,
            type: 'error'
        });
    }
}

async function installTool() {
    // Legacy function - now opens tool library
    loadToolLibrary();
}

// These functions are called from HTML onclick handlers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function uninstallTool(toolId: string) {
    if (!confirm('Are you sure you want to uninstall this tool?')) {
        return;
    }

    try {
        const tool = await window.toolboxAPI.getTool(toolId);
        await window.toolboxAPI.uninstallTool(tool.id, toolId);

        await window.toolboxAPI.showNotification({
            title: 'Tool Uninstalled',
            body: `${tool.name} has been uninstalled.`,
            type: 'success'
        });

        await loadTools();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: 'Uninstall Failed',
            body: `Failed to uninstall tool: ${(error as Error).message}`,
            type: 'error'
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function launchTool(toolId: string) {
    window.toolboxAPI.showNotification({
        title: 'Tool Launch',
        body: `Launching tool ${toolId}...`,
        type: 'info'
    });
    // Tool launch implementation would go here
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toolSettings(toolId: string) {
    window.toolboxAPI.showNotification({
        title: 'Tool Settings',
        body: `Opening settings for ${toolId}...`,
        type: 'info'
    });
    // Tool settings implementation would go here
}

// Connections Management
async function loadConnections() {
    const connectionsList = document.getElementById('connections-list');
    if (!connectionsList) return;

    const connections = await window.toolboxAPI.getConnections();

    if (connections.length === 0) {
        connectionsList.innerHTML = `
            <div class="empty-state">
                <p>No connections configured yet.</p>
                <p class="empty-state-hint">Add a connection to your Dataverse environment.</p>
            </div>
        `;
        updateFooterConnectionStatus(null);
        return;
    }

    connectionsList.innerHTML = connections.map((conn: any) => `
        <div class="connection-card ${conn.isActive ? 'active-connection' : ''}">
            <div class="connection-header">
                <div>
                    <div class="connection-name">${conn.name}</div>
                    <span class="connection-env-badge env-${conn.environment.toLowerCase()}">${conn.environment}</span>
                </div>
                <div class="connection-actions">
                    ${conn.isActive 
                        ? '<button class="btn btn-secondary" onclick="disconnectConnection()">Disconnect</button>'
                        : '<button class="btn btn-primary" onclick="connectToConnection(\'' + conn.id + '\')">Connect</button>'
                    }
                    <button class="btn btn-danger" onclick="deleteConnection('${conn.id}')">Delete</button>
                </div>
            </div>
            <div class="connection-url">${conn.url}</div>
            <div class="connection-meta">Created: ${new Date(conn.createdAt).toLocaleDateString()}</div>
        </div>
    `).join('');

    // Update footer
    const activeConn = connections.find((c: any) => c.isActive);
    updateFooterConnectionStatus(activeConn || null);
}

function updateFooterConnectionStatus(connection: any | null) {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;

    if (connection) {
        statusElement.textContent = `Connected to: ${connection.name} (${connection.environment})`;
        statusElement.className = 'connection-status connected';
    } else {
        statusElement.textContent = 'No active connection';
        statusElement.className = 'connection-status';
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function connectToConnection(id: string) {
    try {
        await window.toolboxAPI.setActiveConnection(id);
        await window.toolboxAPI.showNotification({
            title: 'Connected',
            body: 'Successfully connected to Dataverse environment.',
            type: 'success'
        });
        await loadConnections();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: 'Connection Failed',
            body: (error as Error).message,
            type: 'error'
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function disconnectConnection() {
    try {
        await window.toolboxAPI.disconnectConnection();
        await window.toolboxAPI.showNotification({
            title: 'Disconnected',
            body: 'Disconnected from Dataverse environment.',
            type: 'info'
        });
        await loadConnections();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: 'Disconnect Failed',
            body: (error as Error).message,
            type: 'error'
        });
    }
}

async function addConnection() {
    const nameInput = document.getElementById('connection-name') as HTMLInputElement;
    const urlInput = document.getElementById('connection-url') as HTMLInputElement;
    const environmentSelect = document.getElementById('connection-environment') as HTMLSelectElement;
    const clientIdInput = document.getElementById('connection-client-id') as HTMLInputElement;
    const tenantIdInput = document.getElementById('connection-tenant-id') as HTMLInputElement;

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const environment = environmentSelect.value as 'Dev' | 'Test' | 'UAT' | 'Production';
    const clientId = clientIdInput.value.trim();
    const tenantId = tenantIdInput.value.trim();

    if (!name || !url) {
        await window.toolboxAPI.showNotification({
            title: 'Invalid Input',
            body: 'Please provide both connection name and URL.',
            type: 'error'
        });
        return;
    }

    const connection = {
        id: Date.now().toString(),
        name,
        url,
        environment,
        clientId: clientId || undefined,
        tenantId: tenantId || undefined,
        createdAt: new Date().toISOString(),
        isActive: false
    };

    try {
        await window.toolboxAPI.addConnection(connection);

        await window.toolboxAPI.showNotification({
            title: 'Connection Added',
            body: `Connection "${name}" has been added.`,
            type: 'success'
        });

        nameInput.value = '';
        urlInput.value = '';
        environmentSelect.value = 'Dev';
        clientIdInput.value = '';
        tenantIdInput.value = '';
        closeModal('add-connection-modal');
        await loadConnections();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: 'Failed to Add Connection',
            body: (error as Error).message,
            type: 'error'
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deleteConnection(id: string) {
    if (!confirm('Are you sure you want to delete this connection?')) {
        return;
    }

    try {
        await window.toolboxAPI.deleteConnection(id);

        await window.toolboxAPI.showNotification({
            title: 'Connection Deleted',
            body: 'The connection has been deleted.',
            type: 'success'
        });

        await loadConnections();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: 'Failed to Delete Connection',
            body: (error as Error).message,
            type: 'error'
        });
    }
}

// Settings Management
async function loadSettings() {
    const settings = await window.toolboxAPI.getUserSettings();

    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const autoUpdateCheck = document.getElementById('auto-update-check') as HTMLInputElement;

    if (themeSelect) themeSelect.value = settings.theme;
    if (autoUpdateCheck) autoUpdateCheck.checked = settings.autoUpdate;

    // Load app version
    const version = await window.toolboxAPI.getAppVersion();
    const versionElement = document.getElementById('app-version');
    if (versionElement) {
        versionElement.textContent = version;
    }

    // Apply current theme
    applyTheme(settings.theme);
}

function applyTheme(theme: string) {
    const body = document.body;
    
    if (theme === 'system') {
        // Check system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        body.classList.toggle('dark-theme', prefersDark);
        body.classList.toggle('light-theme', !prefersDark);
    } else if (theme === 'dark') {
        body.classList.add('dark-theme');
        body.classList.remove('light-theme');
    } else {
        body.classList.add('light-theme');
        body.classList.remove('dark-theme');
    }
}

async function saveSettings() {
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const autoUpdateCheck = document.getElementById('auto-update-check') as HTMLInputElement;

    const settings = {
        theme: themeSelect.value,
        autoUpdate: autoUpdateCheck.checked
    };

    await window.toolboxAPI.updateUserSettings(settings);

    // Apply theme immediately
    applyTheme(settings.theme);

    await window.toolboxAPI.showNotification({
        title: 'Settings Saved',
        body: 'Your settings have been saved.',
        type: 'success'
    });
}

// Auto-Update Management
function showUpdateStatus(message: string, type: 'info' | 'success' | 'error') {
    const statusElement = document.getElementById('update-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `update-status ${type}`;
    }
}

function hideUpdateStatus() {
    const statusElement = document.getElementById('update-status');
    if (statusElement) {
        statusElement.style.display = 'none';
    }
}

function showUpdateProgress() {
    const progressElement = document.getElementById('update-progress');
    if (progressElement) {
        progressElement.style.display = 'block';
    }
}

function hideUpdateProgress() {
    const progressElement = document.getElementById('update-progress');
    if (progressElement) {
        progressElement.style.display = 'none';
    }
}

function updateProgress(percent: number) {
    const fillElement = document.getElementById('progress-bar-fill');
    const textElement = document.getElementById('progress-text');
    if (fillElement) {
        fillElement.style.width = `${percent}%`;
    }
    if (textElement) {
        textElement.textContent = `${percent}%`;
    }
}

async function checkForUpdates() {
    hideUpdateStatus();
    hideUpdateProgress();
    showUpdateStatus('Checking for updates...', 'info');
    
    try {
        await window.toolboxAPI.checkForUpdates();
    } catch (error) {
        showUpdateStatus(`Error: ${(error as Error).message}`, 'error');
    }
}

// Set up auto-update event listeners
function setupAutoUpdateListeners() {
    window.toolboxAPI.onUpdateChecking(() => {
        showUpdateStatus('Checking for updates...', 'info');
    });

    window.toolboxAPI.onUpdateAvailable((info: any) => {
        showUpdateStatus(`Update available: Version ${info.version}`, 'success');
    });

    window.toolboxAPI.onUpdateNotAvailable(() => {
        showUpdateStatus('You are running the latest version', 'success');
    });

    window.toolboxAPI.onUpdateDownloadProgress((progress: any) => {
        showUpdateProgress();
        updateProgress(progress.percent);
        showUpdateStatus(`Downloading update: ${progress.percent}%`, 'info');
    });

    window.toolboxAPI.onUpdateDownloaded((info: any) => {
        hideUpdateProgress();
        showUpdateStatus(`Update downloaded: Version ${info.version}. Restart to install.`, 'success');
    });

    window.toolboxAPI.onUpdateError((error: string) => {
        hideUpdateProgress();
        showUpdateStatus(`Update error: ${error}`, 'error');
    });
}

// Modal Management
function openModal(modalId: string) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal(modalId: string) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Initialize the application
async function init() {
    // Set up navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            if (view) {
                switchView(view);
                if (view === 'tools') loadTools();
                if (view === 'connections') loadConnections();
                if (view === 'settings') loadSettings();
            }
        });
    });

    // Install tool modal
    const installToolBtn = document.getElementById('install-tool-btn');
    if (installToolBtn) {
        installToolBtn.addEventListener('click', () => {
            openModal('install-tool-modal');
            loadToolLibrary();
        });
    }

    const closeInstallModal = document.getElementById('close-install-modal');
    if (closeInstallModal) {
        closeInstallModal.addEventListener('click', () => closeModal('install-tool-modal'));
    }

    const cancelInstallBtn = document.getElementById('cancel-install-btn');
    if (cancelInstallBtn) {
        cancelInstallBtn.addEventListener('click', () => closeModal('install-tool-modal'));
    }

    // Add connection modal
    const addConnectionBtn = document.getElementById('add-connection-btn');
    if (addConnectionBtn) {
        addConnectionBtn.addEventListener('click', () => openModal('add-connection-modal'));
    }

    const closeConnectionModal = document.getElementById('close-connection-modal');
    if (closeConnectionModal) {
        closeConnectionModal.addEventListener('click', () => closeModal('add-connection-modal'));
    }

    const cancelConnectionBtn = document.getElementById('cancel-connection-btn');
    if (cancelConnectionBtn) {
        cancelConnectionBtn.addEventListener('click', () => closeModal('add-connection-modal'));
    }

    const confirmConnectionBtn = document.getElementById('confirm-connection-btn');
    if (confirmConnectionBtn) {
        confirmConnectionBtn.addEventListener('click', addConnection);
    }

    // Settings save button
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    // Auto-update button handler
    const checkUpdatesBtn = document.getElementById('check-updates-btn');
    if (checkUpdatesBtn) {
        checkUpdatesBtn.addEventListener('click', checkForUpdates);
    }

    // Set up auto-update listeners
    setupAutoUpdateListeners();

    // Load initial data
    await loadTools();

    // Listen for toolbox events
    window.toolboxAPI.onToolboxEvent((event: any, payload: any) => {
        console.log('ToolBox Event:', payload);
    });
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
