import React from 'react';
import type { LogEntry } from '../hooks/useToolboxAPI';

interface EventLogProps {
    logs: LogEntry[];
    onClear: () => void;
}

export const EventLog: React.FC<EventLogProps> = ({ logs, onClear }) => {
    return (
        <div className="card">
            <h2>📋 Event Log</h2>
            <button onClick={onClear} className="btn btn-secondary">
                Clear Log
            </button>
            <div className="log">
                {logs.length === 0 ? (
                    <div style={{ color: '#666', fontStyle: 'italic' }}>No logs yet...</div>
                ) : (
                    logs.map((log, index) => (
                        <div key={index} className={`log-entry ${log.type}`}>
                            <span className="log-timestamp">[{log.timestamp.toLocaleTimeString()}]</span>
                            <span>{log.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
