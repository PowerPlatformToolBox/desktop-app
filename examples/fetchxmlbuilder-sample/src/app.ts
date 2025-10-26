/// <reference types="@pptb/types" />

/**
 * FetchXML Builder Sample Tool
 * Demonstrates porting an XrmToolBox tool to Power Platform Tool Box
 */

// Type definitions
interface EntityMetadata {
    LogicalName: string;
    DisplayName?: { UserLocalizedLabel?: { Label: string } };
    Attributes?: AttributeMetadata[];
}

interface AttributeMetadata {
    LogicalName: string;
    DisplayName?: { UserLocalizedLabel?: { Label: string } };
    AttributeType?: string;
}

interface FilterCondition {
    attribute: string;
    operator: string;
    value: string;
}

// Application state
let currentConnection: any = null;
let availableEntities: EntityMetadata[] = [];
let selectedEntity: string | null = null;
let selectedAttributes: Set<string> = new Set();
let filters: FilterCondition[] = [];
let currentFetchXml: string = '';

// DOM elements
const connectionInfo = document.getElementById('connection-info')!;
const entitySelect = document.getElementById('entity-select') as HTMLSelectElement;
const loadEntitiesBtn = document.getElementById('load-entities-btn')!;
const attributesContainer = document.getElementById('attributes-container')!;
const filtersContainer = document.getElementById('filters-container')!;
const addFilterBtn = document.getElementById('add-filter-btn')!;
const topCountInput = document.getElementById('top-count') as HTMLInputElement;
const generateFetchXmlBtn = document.getElementById('generate-fetchxml-btn')!;
const executeQueryBtn = document.getElementById('execute-query-btn')!;
const clearQueryBtn = document.getElementById('clear-query-btn')!;
const fetchXmlDisplay = document.getElementById('fetchxml-display') as HTMLTextAreaElement;
const copyFetchXmlBtn = document.getElementById('copy-fetchxml-btn')!;
const resultsContainer = document.getElementById('results-container')!;
const resultCount = document.getElementById('result-count')!;

/**
 * Initialize the tool
 */
async function init(): Promise<void> {
    try {
        // Check connection
        currentConnection = await window.toolboxAPI.connections.getActiveConnection();
        
        if (!currentConnection) {
            connectionInfo.innerHTML = `
                <div class="error-message">
                    <strong>⚠️ No Connection</strong><br>
                    Please connect to a Dataverse environment first.
                </div>
            `;
            return;
        }

        // Display connection info
        displayConnectionInfo();

        // Setup event listeners
        setupEventListeners();

        await window.toolboxAPI.utils.showNotification({
            title: 'FetchXML Builder Ready',
            body: 'Click "Load Entities" to start building your query',
            type: 'info'
        });

    } catch (error) {
        console.error('Initialization error:', error);
        connectionInfo.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong> ${(error as Error).message}
            </div>
        `;
    }
}

/**
 * Display connection information
 */
function displayConnectionInfo(): void {
    const url = currentConnection.url || 'Unknown';
    const name = currentConnection.name || 'Unnamed Connection';
    
    connectionInfo.innerHTML = `
        <div class="status-connected">✓ Connected</div>
        <div class="info-item">
            <strong>Name:</strong> ${escapeHtml(name)}
        </div>
        <div class="info-item">
            <strong>URL:</strong> ${escapeHtml(url)}
        </div>
    `;
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
    loadEntitiesBtn.addEventListener('click', loadEntities);
    entitySelect.addEventListener('change', onEntitySelected);
    addFilterBtn.addEventListener('click', addFilter);
    generateFetchXmlBtn.addEventListener('click', generateFetchXml);
    executeQueryBtn.addEventListener('click', executeQuery);
    clearQueryBtn.addEventListener('click', clearQuery);
    copyFetchXmlBtn.addEventListener('click', copyFetchXml);
}

/**
 * Load entities from Dataverse
 */
async function loadEntities(): Promise<void> {
    try {
        loadEntitiesBtn.textContent = 'Loading...';
        loadEntitiesBtn.setAttribute('disabled', 'true');

        // Get all entities using getAllEntitiesMetadata
        const response = await window.dataverseAPI.getAllEntitiesMetadata();

        // Filter to only valid entities
        availableEntities = response.value.filter(entity => 
            entity.LogicalName && 
            // Basic filtering - you may want to add more criteria
            !entity.LogicalName.startsWith('msdyn_')
        ) as unknown as EntityMetadata[];
        
        // Populate entity dropdown
        entitySelect.innerHTML = '<option value="">-- Select an entity --</option>';
        availableEntities.forEach(entity => {
            const option = document.createElement('option');
            option.value = entity.LogicalName;
            const displayName = entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName;
            option.textContent = `${displayName} (${entity.LogicalName})`;
            entitySelect.appendChild(option);
        });

        await window.toolboxAPI.utils.showNotification({
            title: 'Success',
            body: `Loaded ${availableEntities.length} entities`,
            type: 'success'
        });

    } catch (error) {
        console.error('Error loading entities:', error);
        await window.toolboxAPI.utils.showNotification({
            title: 'Error',
            body: `Failed to load entities: ${(error as Error).message}`,
            type: 'error'
        });
    } finally {
        loadEntitiesBtn.textContent = 'Load Entities';
        loadEntitiesBtn.removeAttribute('disabled');
    }
}

/**
 * Handle entity selection
 */
async function onEntitySelected(): Promise<void> {
    selectedEntity = entitySelect.value;
    selectedAttributes.clear();
    filters = [];
    
    if (!selectedEntity) {
        attributesContainer.innerHTML = '<p class="text-muted">Select an entity first</p>';
        addFilterBtn.setAttribute('disabled', 'true');
        generateFetchXmlBtn.setAttribute('disabled', 'true');
        return;
    }

    try {
        // Load attributes for selected entity
        const metadata = await window.dataverseAPI.getEntityMetadata(selectedEntity);
        
        // Display attributes as checkboxes
        attributesContainer.innerHTML = '';
        if (metadata.Attributes && metadata.Attributes.length > 0) {
            (metadata.Attributes as AttributeMetadata[]).forEach(attr => {
                const displayName = attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName;
                const div = document.createElement('div');
                div.className = 'attribute-item';
                div.innerHTML = `
                    <input type="checkbox" id="attr-${attr.LogicalName}" value="${attr.LogicalName}">
                    <label for="attr-${attr.LogicalName}">${displayName} (${attr.LogicalName})</label>
                `;
                
                const checkbox = div.querySelector('input') as HTMLInputElement;
                checkbox.addEventListener('change', (e) => {
                    if ((e.target as HTMLInputElement).checked) {
                        selectedAttributes.add(attr.LogicalName);
                    } else {
                        selectedAttributes.delete(attr.LogicalName);
                    }
                    updateGenerateButton();
                });
                
                attributesContainer.appendChild(div);
            });
        } else {
            attributesContainer.innerHTML = '<p class="text-muted">No attributes available</p>';
        }

        addFilterBtn.removeAttribute('disabled');
        updateFiltersDisplay();
        updateGenerateButton();

    } catch (error) {
        console.error('Error loading attributes:', error);
        attributesContainer.innerHTML = `<div class="error-message">Error: ${escapeHtml((error as Error).message)}</div>`;
    }
}

/**
 * Add a new filter condition
 */
function addFilter(): void {
    if (!selectedEntity) return;
    
    filters.push({
        attribute: '',
        operator: 'eq',
        value: ''
    });
    
    updateFiltersDisplay();
}

/**
 * Update filters display
 */
function updateFiltersDisplay(): void {
    if (filters.length === 0) {
        filtersContainer.innerHTML = '<p class="text-muted">No filters added</p>';
        return;
    }

    filtersContainer.innerHTML = '';
    filters.forEach((filter, index) => {
        const div = document.createElement('div');
        div.className = 'filter-item';
        div.innerHTML = `
            <select class="form-control" data-index="${index}" data-field="attribute">
                <option value="">-- Attribute --</option>
                ${Array.from(selectedAttributes).map(attr => 
                    `<option value="${attr}" ${filter.attribute === attr ? 'selected' : ''}>${attr}</option>`
                ).join('')}
            </select>
            <select class="form-control" data-index="${index}" data-field="operator">
                <option value="eq" ${filter.operator === 'eq' ? 'selected' : ''}>Equals</option>
                <option value="ne" ${filter.operator === 'ne' ? 'selected' : ''}>Not Equals</option>
                <option value="gt" ${filter.operator === 'gt' ? 'selected' : ''}>Greater Than</option>
                <option value="lt" ${filter.operator === 'lt' ? 'selected' : ''}>Less Than</option>
                <option value="like" ${filter.operator === 'like' ? 'selected' : ''}>Contains</option>
                <option value="not-null" ${filter.operator === 'not-null' ? 'selected' : ''}>Not Null</option>
                <option value="null" ${filter.operator === 'null' ? 'selected' : ''}>Null</option>
            </select>
            <input type="text" class="form-control" placeholder="Value" 
                   data-index="${index}" data-field="value" value="${filter.value}"
                   ${filter.operator === 'null' || filter.operator === 'not-null' ? 'disabled' : ''}>
            <button class="btn btn-danger btn-sm" data-index="${index}">Remove</button>
        `;

        // Add event listeners
        div.querySelectorAll('select, input').forEach(element => {
            element.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement | HTMLInputElement;
                const idx = parseInt(target.dataset.index || '0');
                const field = target.dataset.field as keyof FilterCondition;
                (filters[idx][field] as string) = target.value;
                
                // Update value input state based on operator
                if (field === 'operator') {
                    const valueInput = div.querySelector('input[data-field="value"]') as HTMLInputElement;
                    if (target.value === 'null' || target.value === 'not-null') {
                        valueInput.disabled = true;
                        valueInput.value = '';
                        filters[idx].value = '';
                    } else {
                        valueInput.disabled = false;
                    }
                }
            });
        });

        div.querySelector('button')!.addEventListener('click', (e) => {
            const idx = parseInt((e.target as HTMLButtonElement).dataset.index || '0');
            filters.splice(idx, 1);
            updateFiltersDisplay();
        });

        filtersContainer.appendChild(div);
    });
}

/**
 * Update generate button state
 */
function updateGenerateButton(): void {
    if (selectedEntity && selectedAttributes.size > 0) {
        generateFetchXmlBtn.removeAttribute('disabled');
    } else {
        generateFetchXmlBtn.setAttribute('disabled', 'true');
        executeQueryBtn.setAttribute('disabled', 'true');
    }
}

/**
 * Generate FetchXML from current state
 */
function generateFetchXml(): void {
    if (!selectedEntity || selectedAttributes.size === 0) return;

    const topCount = parseInt(topCountInput.value) || 10;
    
    // Build FetchXML
    let xml = `<fetch top="${topCount}">\n`;
    xml += `  <entity name="${selectedEntity}">\n`;
    
    // Add attributes
    selectedAttributes.forEach(attr => {
        xml += `    <attribute name="${attr}" />\n`;
    });
    
    // Add filters
    if (filters.length > 0 && filters.some(f => f.attribute)) {
        xml += `    <filter type="and">\n`;
        filters.forEach(filter => {
            if (filter.attribute) {
                if (filter.operator === 'null' || filter.operator === 'not-null') {
                    xml += `      <condition attribute="${filter.attribute}" operator="${filter.operator}" />\n`;
                } else if (filter.value) {
                    xml += `      <condition attribute="${filter.attribute}" operator="${filter.operator}" value="${escapeXml(filter.value)}" />\n`;
                }
            }
        });
        xml += `    </filter>\n`;
    }
    
    xml += `  </entity>\n`;
    xml += `</fetch>`;
    
    currentFetchXml = xml;
    fetchXmlDisplay.value = xml;
    copyFetchXmlBtn.removeAttribute('disabled');
    executeQueryBtn.removeAttribute('disabled');
}

/**
 * Execute the FetchXML query
 */
async function executeQuery(): Promise<void> {
    if (!currentFetchXml) return;

    try {
        executeQueryBtn.textContent = 'Executing...';
        executeQueryBtn.setAttribute('disabled', 'true');

        const response = await window.dataverseAPI.fetchXmlQuery(currentFetchXml);
        const records = response.value;

        // Display results
        displayResults(records);

        await window.toolboxAPI.utils.showNotification({
            title: 'Query Executed',
            body: `Retrieved ${records.length} record(s)`,
            type: 'success'
        });

    } catch (error) {
        console.error('Query execution error:', error);
        resultsContainer.innerHTML = `
            <div class="error-message">
                <strong>Query Error:</strong> ${escapeHtml((error as Error).message)}
            </div>
        `;
        await window.toolboxAPI.utils.showNotification({
            title: 'Query Failed',
            body: (error as Error).message,
            type: 'error'
        });
    } finally {
        executeQueryBtn.textContent = 'Execute Query';
        executeQueryBtn.removeAttribute('disabled');
    }
}

/**
 * Display query results in a table
 */
function displayResults(records: any[]): void {
    if (records.length === 0) {
        resultsContainer.innerHTML = '<p class="text-muted text-center">No records found</p>';
        resultCount.textContent = '(0 records)';
        return;
    }

    resultCount.textContent = `(${records.length} record${records.length !== 1 ? 's' : ''})`;

    // Get all unique keys from records
    const allKeys = new Set<string>();
    records.forEach(record => {
        Object.keys(record).forEach(key => {
            if (!key.startsWith('@') && !key.startsWith('_') && key !== 'id') {
                allKeys.add(key);
            }
        });
    });
    const columns = Array.from(allKeys);

    // Build table
    let html = '<table class="results-table"><thead><tr>';
    columns.forEach(col => {
        html += `<th>${escapeHtml(col)}</th>`;
    });
    html += '</tr></thead><tbody>';

    records.forEach(record => {
        html += '<tr>';
        columns.forEach(col => {
            const value = record[col];
            const displayValue = value != null ? String(value) : '';
            html += `<td>${escapeHtml(displayValue)}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    resultsContainer.innerHTML = html;
}

/**
 * Copy FetchXML to clipboard
 */
async function copyFetchXml(): Promise<void> {
    try {
        await window.toolboxAPI.utils.copyToClipboard(currentFetchXml);
        await window.toolboxAPI.utils.showNotification({
            title: 'Copied',
            body: 'FetchXML copied to clipboard',
            type: 'success'
        });
    } catch (error) {
        console.error('Copy error:', error);
    }
}

/**
 * Clear the query builder
 */
function clearQuery(): void {
    selectedEntity = null;
    selectedAttributes.clear();
    filters = [];
    currentFetchXml = '';
    
    entitySelect.value = '';
    attributesContainer.innerHTML = '<p class="text-muted">Select an entity first</p>';
    filtersContainer.innerHTML = '<p class="text-muted">No filters added</p>';
    fetchXmlDisplay.value = '';
    resultsContainer.innerHTML = '<p class="text-muted">Execute a query to see results</p>';
    resultCount.textContent = '';
    
    addFilterBtn.setAttribute('disabled', 'true');
    generateFetchXmlBtn.setAttribute('disabled', 'true');
    executeQueryBtn.setAttribute('disabled', 'true');
    copyFetchXmlBtn.setAttribute('disabled', 'true');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Initialize the tool when the page loads
init();
