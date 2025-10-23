<template>
    <div class="card">
        <h2>🛠️ ToolBox API Examples</h2>

        <div class="example-group">
            <h3>Notifications</h3>
            <div class="button-group">
                <button @click="showNotification('Success!', 'Operation completed successfully', 'success')" class="btn btn-success">
                    Show Success
                </button>
                <button @click="showNotification('Information', 'This is an informational message', 'info')" class="btn btn-info">
                    Show Info
                </button>
                <button @click="showNotification('Warning', 'Please review this warning', 'warning')" class="btn btn-warning">
                    Show Warning
                </button>
                <button @click="showNotification('Error', 'An error has occurred', 'error')" class="btn btn-error">Show Error</button>
            </div>
        </div>

        <div class="example-group">
            <h3>Utilities</h3>
            <div class="button-group">
                <button @click="copyToClipboard" class="btn">Copy to Clipboard</button>
                <button @click="showCurrentTheme" class="btn">Get Theme</button>
                <button @click="saveDataToFile" class="btn">Save File</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
    log: [message: string, type?: 'info' | 'success' | 'warning' | 'error'];
}>();

const showNotification = async (title: string, body: string, type: 'success' | 'info' | 'warning' | 'error') => {
    try {
        await window.toolboxAPI.utils.showNotification({
            title,
            body,
            type,
            duration: 3000,
        });
        emit('log', `Notification shown: ${title} - ${body}`, type);
    } catch (error) {
        emit('log', `Error showing notification: ${(error as Error).message}`, 'error');
    }
};

const copyToClipboard = async () => {
    try {
        const data = {
            timestamp: new Date().toISOString(),
            message: 'This data was copied from the Vue Sample Tool',
        };

        await window.toolboxAPI.utils.copyToClipboard(JSON.stringify(data, null, 2));
        await showNotification('Copied!', 'Data copied to clipboard', 'success');
    } catch (error) {
        emit('log', `Error copying to clipboard: ${(error as Error).message}`, 'error');
    }
};

const showCurrentTheme = async () => {
    try {
        const theme = await window.toolboxAPI.utils.getCurrentTheme();
        await showNotification('Current Theme', `The current theme is: ${theme}`, 'info');
        emit('log', `Current theme: ${theme}`, 'info');
    } catch (error) {
        emit('log', `Error getting theme: ${(error as Error).message}`, 'error');
    }
};

const saveDataToFile = async () => {
    try {
        const data = {
            timestamp: new Date().toISOString(),
            message: 'Export from Vue Sample Tool',
        };

        const filePath = await window.toolboxAPI.utils.saveFile('vue-export.json', JSON.stringify(data, null, 2));

        if (filePath) {
            await showNotification('File Saved', `File saved to: ${filePath}`, 'success');
            emit('log', `File saved to: ${filePath}`, 'success');
        } else {
            emit('log', 'File save cancelled', 'info');
        }
    } catch (error) {
        emit('log', `Error saving file: ${(error as Error).message}`, 'error');
    }
};
</script>
