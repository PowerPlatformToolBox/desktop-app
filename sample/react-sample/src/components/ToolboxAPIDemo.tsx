import React, { useCallback } from 'react';

interface ToolboxAPIDemoProps {
    onLog: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const ToolboxAPIDemo: React.FC<ToolboxAPIDemoProps> = ({ onLog }) => {
    const showNotification = useCallback(
        async (title: string, body: string, type: 'success' | 'info' | 'warning' | 'error') => {
            try {
                await window.toolboxAPI.utils.showNotification({
                    title,
                    body,
                    type,
                    duration: 3000,
                });
                onLog(`Notification shown: ${title} - ${body}`, type);
            } catch (error) {
                onLog(`Error showing notification: ${(error as Error).message}`, 'error');
            }
        },
        [onLog]
    );

    const copyToClipboard = useCallback(async () => {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                message: 'This data was copied from the React Sample Tool',
            };

            await window.toolboxAPI.utils.copyToClipboard(JSON.stringify(data, null, 2));
            await showNotification('Copied!', 'Data copied to clipboard', 'success');
        } catch (error) {
            onLog(`Error copying to clipboard: ${(error as Error).message}`, 'error');
        }
    }, [onLog, showNotification]);

    const showCurrentTheme = useCallback(async () => {
        try {
            const theme = await window.toolboxAPI.utils.getCurrentTheme();
            await showNotification('Current Theme', `The current theme is: ${theme}`, 'info');
            onLog(`Current theme: ${theme}`, 'info');
        } catch (error) {
            onLog(`Error getting theme: ${(error as Error).message}`, 'error');
        }
    }, [onLog, showNotification]);

    const saveDataToFile = useCallback(async () => {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                message: 'Export from React Sample Tool',
            };

            const filePath = await window.toolboxAPI.utils.saveFile('react-export.json', JSON.stringify(data, null, 2));

            if (filePath) {
                await showNotification('File Saved', `File saved to: ${filePath}`, 'success');
                onLog(`File saved to: ${filePath}`, 'success');
            } else {
                onLog('File save cancelled', 'info');
            }
        } catch (error) {
            onLog(`Error saving file: ${(error as Error).message}`, 'error');
        }
    }, [onLog, showNotification]);

    return (
        <div className="card">
            <h2>🛠️ ToolBox API Examples</h2>

            <div className="example-group">
                <h3>Notifications</h3>
                <div className="button-group">
                    <button onClick={() => showNotification('Success!', 'Operation completed successfully', 'success')} className="btn btn-success">
                        Show Success
                    </button>
                    <button onClick={() => showNotification('Information', 'This is an informational message', 'info')} className="btn btn-info">
                        Show Info
                    </button>
                    <button onClick={() => showNotification('Warning', 'Please review this warning', 'warning')} className="btn btn-warning">
                        Show Warning
                    </button>
                    <button onClick={() => showNotification('Error', 'An error has occurred', 'error')} className="btn btn-error">
                        Show Error
                    </button>
                </div>
            </div>

            <div className="example-group">
                <h3>Utilities</h3>
                <div className="button-group">
                    <button onClick={copyToClipboard} className="btn">
                        Copy to Clipboard
                    </button>
                    <button onClick={showCurrentTheme} className="btn">
                        Get Theme
                    </button>
                    <button onClick={saveDataToFile} className="btn">
                        Save File
                    </button>
                </div>
            </div>
        </div>
    );
};
