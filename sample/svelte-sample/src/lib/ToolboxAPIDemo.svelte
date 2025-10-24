<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher<{
        log: { message: string; type?: 'info' | 'success' | 'warning' | 'error' };
    }>();

    async function showNotification(title: string, body: string, type: 'success' | 'info' | 'warning' | 'error') {
        try {
            await window.toolboxAPI.utils.showNotification({ title, body, type, duration: 3000 });
            dispatch('log', { message: `Notification shown: ${title} - ${body}`, type });
        } catch (error) {
            dispatch('log', { message: `Error showing notification: ${(error as Error).message}`, type: 'error' });
        }
    }

    async function copyToClipboard() {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                message: 'This data was copied from the Svelte Sample Tool',
            };

            await window.toolboxAPI.utils.copyToClipboard(JSON.stringify(data, null, 2));
            await showNotification('Copied!', 'Data copied to clipboard', 'success');
        } catch (error) {
            dispatch('log', { message: `Error copying to clipboard: ${(error as Error).message}`, type: 'error' });
        }
    }

    async function showCurrentTheme() {
        try {
            const theme = await window.toolboxAPI.utils.getCurrentTheme();
            await showNotification('Current Theme', `The current theme is: ${theme}`, 'info');
            dispatch('log', { message: `Current theme: ${theme}`, type: 'info' });
        } catch (error) {
            dispatch('log', { message: `Error getting theme: ${(error as Error).message}`, type: 'error' });
        }
    }

    async function saveDataToFile() {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                message: 'Export from Svelte Sample Tool',
            };

            const filePath = await window.toolboxAPI.utils.saveFile('svelte-export.json', JSON.stringify(data, null, 2));

            if (filePath) {
                await showNotification('File Saved', `File saved to: ${filePath}`, 'success');
                dispatch('log', { message: `File saved to: ${filePath}`, type: 'success' });
            } else {
                dispatch('log', { message: 'File save cancelled', type: 'info' });
            }
        } catch (error) {
            dispatch('log', { message: `Error saving file: ${(error as Error).message}`, type: 'error' });
        }
    }
</script>

<div class="card">
    <h2>🛠️ ToolBox API Examples</h2>

    <div class="example-group">
        <h3>Notifications</h3>
        <div class="button-group">
            <button class="btn btn-success" on:click={() => showNotification('Success!', 'Operation completed successfully', 'success')}>Show Success</button>
            <button class="btn btn-info" on:click={() => showNotification('Information', 'This is an informational message', 'info')}>Show Info</button>
            <button class="btn btn-warning" on:click={() => showNotification('Warning', 'Please review this warning', 'warning')}>Show Warning</button>
            <button class="btn btn-error" on:click={() => showNotification('Error', 'An error has occurred', 'error')}>Show Error</button>
        </div>
    </div>

    <div class="example-group">
        <h3>Utilities</h3>
        <div class="button-group">
            <button class="btn" on:click={copyToClipboard}>Copy to Clipboard</button>
            <button class="btn" on:click={showCurrentTheme}>Get Theme</button>
            <button class="btn" on:click={saveDataToFile}>Save File</button>
        </div>
    </div>
</div>
