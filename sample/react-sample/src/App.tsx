import { useCallback } from 'react';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ToolboxAPIDemo } from './components/ToolboxAPIDemo';
import { DataverseAPIDemo } from './components/DataverseAPIDemo';
import { EventLog } from './components/EventLog';
import { useConnection, useToolboxEvents, useEventLog } from './hooks/useToolboxAPI';

function App() {
    const { connection, isLoading, refreshConnection } = useConnection();
    const { logs, addLog, clearLogs } = useEventLog();

    // Handle platform events
    const handleEvent = useCallback(
        (event: string, _data: any) => {
            addLog(`Event: ${event}`, 'info');

            switch (event) {
                case 'connection:updated':
                case 'connection:created':
                    refreshConnection();
                    break;

                case 'connection:deleted':
                    refreshConnection();
                    break;

                case 'terminal:output':
                case 'terminal:command:completed':
                case 'terminal:error':
                    // Terminal events handled by dedicated components
                    break;
            }
        },
        [addLog, refreshConnection]
    );

    useToolboxEvents(handleEvent);

    // Add initial log
    useCallback(() => {
        addLog('React Sample Tool initialized', 'success');
    }, [addLog])();

    return (
        <>
            <header className="header">
                <h1>⚛️ React Sample Tool</h1>
                <p className="subtitle">A complete example of building Power Platform Tool Box tools with React & TypeScript</p>
            </header>

            <ConnectionStatus connection={connection} isLoading={isLoading} />

            <ToolboxAPIDemo onLog={addLog} />

            <DataverseAPIDemo connection={connection} onLog={addLog} />

            <EventLog logs={logs} onClear={clearLogs} />
        </>
    );
}

export default App;
