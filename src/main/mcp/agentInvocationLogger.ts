import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import pino from "pino";

const LOG_FILE_NAME = "agent-invocation.log";
const MAX_LOG_SIZE_MB = 5;
const MAX_LOG_SIZE_BYTES = MAX_LOG_SIZE_MB * 1024 * 1024;
const MAX_BACKUP_COUNT = 3;

/**
 * Outcome of an agent tool invocation
 */
export type InvocationOutcome = "completed" | "no-result" | "rejected";

/**
 * Structure of an agent invocation log entry
 */
export interface AgentInvocationLogEntry {
    timestamp: string;
    toolId: string;
    toolName: string;
    connectionId: string | null;
    prefillSummary: string;
    outcome: InvocationOutcome;
    invocationMode?: "one-way" | "two-way";
    correlationId?: string;
    error?: string;
}

/**
 * Get the log file path in userData directory
 */
export function getLogFilePath(): string {
    return path.join(getUserDataPath(), LOG_FILE_NAME);
}

/**
 * Get the userData path for the application
 */
function getUserDataPath(): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require("electron");
        return app.getPath("userData");
    } catch {
        return path.join(os.tmpdir(), "powerplatform-toolbox-logs");
    }
}

/**
 * Rotate log file if it exceeds the maximum size
 */
function rotateLogIfNeeded(): void {
    const logPath = getLogFilePath();

    try {
        if (!fs.existsSync(logPath)) {
            return;
        }

        const stats = fs.statSync(logPath);
        if (stats.size >= MAX_LOG_SIZE_BYTES) {
            for (let i = MAX_BACKUP_COUNT - 1; i >= 0; i--) {
                const oldPath = `${logPath}.${i === 0 ? "" : `.` + i}`;
                const newPath = `${logPath}.${i + 1}`;
                if (fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                }
            }
            fs.renameSync(logPath, `${logPath}.1`);
        }
    } catch (error) {
        console.error("Failed to rotate log file:", error instanceof Error ? error.message : String(error));
    }
}

/**
 * Read all log entries from the log file
 */
export function readLogEntries(): AgentInvocationLogEntry[] {
    const logPath = getLogFilePath();

    try {
        if (!fs.existsSync(logPath)) {
            return [];
        }

        const content = fs.readFileSync(logPath, { encoding: "utf-8" });
        const lines = content.split("\n").filter((line) => line.trim().length > 0);

        return lines
            .map((line) => {
                try {
                    return JSON.parse(line) as AgentInvocationLogEntry;
                } catch {
                    return null;
                }
            })
            .filter((entry): entry is AgentInvocationLogEntry => entry !== null)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
        console.error("Failed to read log entries:", error instanceof Error ? error.message : String(error));
        return [];
    }
}

/**
 * Clear all log entries (for testing/maintenance)
 */
export function clearLogEntries(): void {
    const logPath = getLogFilePath();

    try {
        if (fs.existsSync(logPath)) {
            fs.unlinkSync(logPath);
        }
        // Clear rotated logs
        for (let i = 1; i <= MAX_BACKUP_COUNT; i++) {
            const rotatedPath = `${logPath}.${i}`;
            if (fs.existsSync(rotatedPath)) {
                fs.unlinkSync(rotatedPath);
            }
        }
    } catch (error) {
        console.error("Failed to clear log entries:", error instanceof Error ? error.message : String(error));
    }
}

/**
 * Pino logger instance for agent invocations
 */
let logger: pino.Logger | null = null;

/**
 * Get or create the pino logger instance
 */
function getLogger(): pino.Logger {
    if (logger) {
        return logger;
    }

    const logPath = getLogFilePath();
    const dir = path.dirname(logPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const destination = pino.destination({
        dest: logPath,
        sync: true,
    });

    logger = pino(
        {
            level: "info",
            timestamp: pino.stdTimeFunctions.isoTime,
        },
        destination,
    );

    return logger;
}

/**
 * Get summary of prefill data (first 200 chars of stringified JSON)
 */
function getPrefillSummary(prefillData: Record<string, unknown> | undefined): string {
    if (!prefillData || Object.keys(prefillData).length === 0) {
        return "{}";
    }
    try {
        const str = JSON.stringify(prefillData);
        return str.length > 200 ? str.slice(0, 200) + "..." : str;
    } catch {
        return "[unserializable]";
    }
}

/**
 * Log an agent tool invocation using pino
 */
export function logInvocation(params: {
    toolId: string;
    toolName: string;
    connectionId: string | null;
    prefillData?: Record<string, unknown>;
    outcome: InvocationOutcome;
    invocationMode?: "one-way" | "two-way";
    correlationId?: string;
    error?: string;
}): void {
    rotateLogIfNeeded();

    const logEntry: AgentInvocationLogEntry = {
        timestamp: new Date().toISOString(),
        toolId: params.toolId,
        toolName: params.toolName,
        connectionId: params.connectionId,
        prefillSummary: getPrefillSummary(params.prefillData),
        outcome: params.outcome,
        ...(params.invocationMode ? { invocationMode: params.invocationMode } : {}),
        ...(params.correlationId ? { correlationId: params.correlationId } : {}),
        ...(params.error ? { error: params.error } : {}),
    };

    const activeLogger = getLogger();
    activeLogger.info(logEntry, "agent-invocation");
}
