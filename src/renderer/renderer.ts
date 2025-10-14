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
                <p class="empty-state-hint">Install tools via npm to get started.</p>
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

async function installTool() {
    const packageNameInput = document.getElementById('tool-package-name') as HTMLInputElement;
    const packageName = packageNameInput.value.trim();

    if (!packageName) {
        await window.toolboxAPI.showNotification({
            title: 'Invalid Package Name',
            body: 'Please enter a valid npm package name.',
            type: 'error'
        });
        return;
    }

    try {
        await window.toolboxAPI.showNotification({
            title: 'Installing Tool',
            body: `Installing ${packageName}...`,
            type: 'info'
        });

        await window.toolboxAPI.installTool(packageName);

        await window.toolboxAPI.showNotification({
            title: 'Tool Installed',
            body: `${packageName} has been installed successfully.`,
            type: 'success'
        });

        packageNameInput.value = '';
        closeModal('install-tool-modal');
        await loadTools();
    } catch (error) {
        await window.toolboxAPI.showNotification({
            title: 'Installation Failed',
            body: `Failed to install ${packageName}: ${(error as Error).message}`,
            type: 'error'
        });
    }
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
        return;
    }

    connectionsList.innerHTML = connections.map(conn => `
        <div class="connection-card">
            <div class="connection-header">
                <div class="connection-name">${conn.name}</div>
                <div class="connection-actions">
                    <button class="btn btn-primary" onclick="testConnection('${conn.id}')">Test</button>
                    <button class="btn btn-danger" onclick="deleteConnection('${conn.id}')">Delete</button>
                </div>
            </div>
            <div class="connection-url">${conn.url}</div>
            <div class="connection-meta">Created: ${new Date(conn.createdAt).toLocaleDateString()}</div>
        </div>
    `).join('');
}

async function addConnection() {
    const nameInput = document.getElementById('connection-name') as HTMLInputElement;
    const urlInput = document.getElementById('connection-url') as HTMLInputElement;
    const clientIdInput = document.getElementById('connection-client-id') as HTMLInputElement;
    const tenantIdInput = document.getElementById('connection-tenant-id') as HTMLInputElement;

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
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
        clientId: clientId || undefined,
        tenantId: tenantId || undefined,
        createdAt: new Date().toISOString()
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function testConnection(id: string) {
    window.toolboxAPI.showNotification({
        title: 'Testing Connection',
        body: `Testing connection ${id}...`,
        type: 'info'
    });
    // Connection test implementation would go here
}

// Settings Management
async function loadSettings() {
    const settings = await window.toolboxAPI.getUserSettings();

    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const autoUpdateCheck = document.getElementById('auto-update-check') as HTMLInputElement;

    if (themeSelect) themeSelect.value = settings.theme;
    if (autoUpdateCheck) autoUpdateCheck.checked = settings.autoUpdate;
}

async function saveSettings() {
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const autoUpdateCheck = document.getElementById('auto-update-check') as HTMLInputElement;

    const settings = {
        theme: themeSelect.value,
        autoUpdate: autoUpdateCheck.checked
    };

    await window.toolboxAPI.updateUserSettings(settings);

    await window.toolboxAPI.showNotification({
        title: 'Settings Saved',
        body: 'Your settings have been saved.',
        type: 'success'
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
        installToolBtn.addEventListener('click', () => openModal('install-tool-modal'));
    }

    const closeInstallModal = document.getElementById('close-install-modal');
    if (closeInstallModal) {
        closeInstallModal.addEventListener('click', () => closeModal('install-tool-modal'));
    }

    const cancelInstallBtn = document.getElementById('cancel-install-btn');
    if (cancelInstallBtn) {
        cancelInstallBtn.addEventListener('click', () => closeModal('install-tool-modal'));
    }

    const confirmInstallBtn = document.getElementById('confirm-install-btn');
    if (confirmInstallBtn) {
        confirmInstallBtn.addEventListener('click', installTool);
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

    // Settings change handlers
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', saveSettings);
    }

    const autoUpdateCheck = document.getElementById('auto-update-check');
    if (autoUpdateCheck) {
        autoUpdateCheck.addEventListener('change', saveSettings);
    }

    // Load initial data
    await loadTools();

    // Listen for toolbox events
    window.toolboxAPI.onToolboxEvent((event: any, payload: any) => {
        console.log('ToolBox Event:', payload);
    });
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
