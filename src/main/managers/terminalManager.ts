import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { Terminal, TerminalCommandResult, TerminalOptions } from "../../common/types";
import { logInfo, logWarn } from "../../common/logger";

const ALLOWED_TERMINAL_EXECUTABLES = new Set(["pac", "npm", "npx", "pnpm"]);
const BLOCKED_TERMINAL_ENV_KEYS = new Set(["PATH", "PATHEXT", "COMSPEC", "SHELL", "NODE_OPTIONS", "BASH_ENV", "ENV", "PROMPT_COMMAND", "ZDOTDIR"]);

interface ParsedTerminalCommand {
    executable: string;
    args: string[];
}

function sanitizeTerminalEnv(env?: Record<string, string>): Record<string, string> | undefined {
    if (!env) {
        return undefined;
    }

    const sanitizedEnv = Object.entries(env).reduce<Record<string, string>>((result, [key, value]) => {
        if (!BLOCKED_TERMINAL_ENV_KEYS.has(key.toUpperCase())) {
            result[key] = value;
        }

        return result;
    }, {});

    return Object.keys(sanitizedEnv).length > 0 ? sanitizedEnv : undefined;
}

function tokenizeTerminalCommand(command: string): string[] {
    const tokens: string[] = [];
    let currentToken = "";
    let activeQuote: '"' | "'" | null = null;
    let isEscaped = false;

    for (let index = 0; index < command.length; index += 1) {
        const char = command[index];

        if (isEscaped) {
            currentToken += char;
            isEscaped = false;
            continue;
        }

        if (char === "\\" && activeQuote !== "'") {
            const nextChar = command[index + 1];
            if (nextChar === '"' || nextChar === "'" || nextChar === "\\" || (nextChar && /\s/.test(nextChar))) {
                isEscaped = true;
                continue;
            }
        }

        if (activeQuote) {
            if (char === activeQuote) {
                activeQuote = null;
            } else {
                currentToken += char;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            activeQuote = char;
            continue;
        }

        if (/\s/.test(char)) {
            if (currentToken) {
                tokens.push(currentToken);
                currentToken = "";
            }
            continue;
        }

        currentToken += char;
    }

    if (activeQuote) {
        throw new Error("Terminal command contains an unterminated quote.");
    }

    if (isEscaped) {
        currentToken += "\\";
    }

    if (currentToken) {
        tokens.push(currentToken);
    }

    return tokens;
}

function parseTerminalCommand(command: string): ParsedTerminalCommand {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
        throw new Error("Terminal command cannot be empty.");
    }

    if (/[\r\n]/.test(trimmedCommand)) {
        throw new Error("Multi-line terminal commands are not allowed.");
    }

    const tokens = tokenizeTerminalCommand(trimmedCommand);
    if (tokens.length === 0) {
        throw new Error("Terminal command cannot be empty.");
    }

    const executable = tokens[0].toLowerCase();
    if (!ALLOWED_TERMINAL_EXECUTABLES.has(executable)) {
        throw new Error(`Blocked unsafe terminal command "${tokens[0]}". Allowed commands: ${Array.from(ALLOWED_TERMINAL_EXECUTABLES).join(", ")}.`);
    }

    return {
        executable,
        args: tokens.slice(1),
    };
}

/**
 * Manages terminal instances for tools
 * Each tool can create its own terminal and execute commands
 */
export class TerminalManager extends EventEmitter {
    private terminals: Map<string, TerminalInstance> = new Map();
    private defaultShell: string;

    constructor() {
        super();
        this.defaultShell = this.getDefaultShell();
    }

    /**
     * Get the default shell for the current platform
     */
    private getDefaultShell(): string {
        if (process.platform === "win32") {
            return process.env.COMSPEC || "cmd.exe";
        } else {
            return process.env.SHELL || "/bin/bash";
        }
    }

    /**
     * Create a new terminal for a tool
     */
    async createTerminal(toolId: string, toolInstanceId: string | null, options: TerminalOptions): Promise<Terminal> {
        const terminalId = randomUUID();
        const shell = this.defaultShell;

        if (options.shell && options.shell !== this.defaultShell) {
            logWarn(`Ignoring custom shell ${options.shell} for terminal ${terminalId}; using secure default shell ${this.defaultShell}`);
        }

        const cwd = options.cwd || process.cwd();

        // Default to visible unless explicitly set to false
        const isVisible = options.visible !== undefined ? options.visible : true;

        const terminal: Terminal = {
            id: terminalId,
            name: options.name,
            toolId,
            toolInstanceId: toolInstanceId ?? null,
            shell,
            cwd,
            isVisible,
            createdAt: new Date().toISOString(),
        };

        const sanitizedEnv = sanitizeTerminalEnv(options.env);
        const strippedEnvKeys = Object.keys(options.env ?? {}).filter((key) => !Object.prototype.hasOwnProperty.call(sanitizedEnv ?? {}, key));
        if (strippedEnvKeys.length > 0) {
            logWarn(`Ignoring restricted terminal environment variables for terminal ${terminalId}: ${strippedEnvKeys.join(", ")}`);
        }

        const instance = new TerminalInstance(terminal, sanitizedEnv);
        this.terminals.set(terminalId, instance);

        // Forward terminal events with toolId for proper filtering
        instance.on("output", (data) => {
            this.emit("terminal:output", { terminalId, toolId, data });
        });

        instance.on("error", (error) => {
            this.emit("terminal:error", { terminalId, toolId, error });
        });

        instance.on("command:completed", (result) => {
            // Add toolId to result if not already present
            const resultWithToolId = { ...result, toolId };
            this.emit("terminal:command:completed", resultWithToolId);
        });

        this.emit("terminal:created", terminal);
        return terminal;
    }

    /**
     * Execute a command in a terminal
     */
    async executeCommand(terminalId: string, command: string): Promise<TerminalCommandResult> {
        const instance = this.terminals.get(terminalId);
        if (!instance) {
            throw new Error(`Terminal ${terminalId} not found`);
        }

        let parsedCommand: ParsedTerminalCommand;
        try {
            parsedCommand = parseTerminalCommand(command);
        } catch (error) {
            const blockedResult: TerminalCommandResult = {
                terminalId,
                commandId: randomUUID(),
                exitCode: 1,
                error: error instanceof Error ? error.message : "Blocked unsafe terminal command.",
            };

            this.emit("terminal:error", { terminalId, toolId: instance.terminal.toolId, error: blockedResult.error });
            this.emit("terminal:command:completed", { ...blockedResult, toolId: instance.terminal.toolId });
            return blockedResult;
        }

        return instance.executeCommand(parsedCommand);
    }

    /**
     * Close a terminal
     */
    closeTerminal(terminalId: string): void {
        const instance = this.terminals.get(terminalId);
        if (instance) {
            const toolId = instance.terminal.toolId;
            instance.close();
            this.terminals.delete(terminalId);
            this.emit("terminal:closed", { terminalId, toolId });
        }
    }

    /**
     * Get a terminal by ID
     */
    getTerminal(terminalId: string): Terminal | undefined {
        const instance = this.terminals.get(terminalId);
        return instance?.terminal;
    }

    /**
     * Get all terminals for a specific tool
     */
    getToolTerminals(toolId: string, toolInstanceId?: string | null): Terminal[] {
        const terminals: Terminal[] = [];
        this.terminals.forEach((instance) => {
            if (instance.terminal.toolId === toolId && (!toolInstanceId || instance.terminal.toolInstanceId === toolInstanceId)) {
                terminals.push(instance.terminal);
            }
        });
        return terminals;
    }

    /**
     * Get all terminals
     */
    getAllTerminals(): Terminal[] {
        const terminals: Terminal[] = [];
        this.terminals.forEach((instance) => {
            terminals.push(instance.terminal);
        });
        return terminals;
    }

    /**
     * Set terminal visibility
     */
    setTerminalVisibility(terminalId: string, visible: boolean): void {
        const instance = this.terminals.get(terminalId);
        if (instance) {
            instance.terminal.isVisible = visible;
            this.emit("terminal:visibility:changed", { terminalId, visible });
        }
    }

    /**
     * Close all terminals for a tool
     */
    closeToolTerminals(toolId: string): void {
        const terminalIds: string[] = [];
        this.terminals.forEach((instance, id) => {
            if (instance.terminal.toolId === toolId) {
                terminalIds.push(id);
            }
        });
        terminalIds.forEach((id) => this.closeTerminal(id));
    }

    /**
     * Close all terminals belonging to a specific tool instance
     */
    closeToolInstanceTerminals(toolInstanceId: string): void {
        const terminalIds: string[] = [];
        this.terminals.forEach((instance, id) => {
            if (instance.terminal.toolInstanceId === toolInstanceId) {
                terminalIds.push(id);
            }
        });
        terminalIds.forEach((id) => this.closeTerminal(id));
    }

    /**
     * Close all terminals
     */
    closeAllTerminals(): void {
        const terminalIds = Array.from(this.terminals.keys());
        terminalIds.forEach((id) => this.closeTerminal(id));
    }
}

/**
 * Internal terminal instance that manages secured command execution
 */
class TerminalInstance extends EventEmitter {
    public terminal: Terminal;
    private process: ChildProcessWithoutNullStreams | null = null;
    private env?: Record<string, string>;
    private commandQueue: Array<{ parsedCommand: ParsedTerminalCommand; commandId: string; resolve: (result: TerminalCommandResult) => void }> = [];
    private isProcessing = false;

    constructor(terminal: Terminal, env?: Record<string, string>) {
        super();
        this.terminal = terminal;
        this.env = env;
    }

    /**
     * Execute a command in the terminal
     */
    async executeCommand(parsedCommand: ParsedTerminalCommand): Promise<TerminalCommandResult> {
        const commandId = randomUUID();

        return new Promise<TerminalCommandResult>((resolve) => {
            this.commandQueue.push({ parsedCommand, commandId, resolve });
            this.processQueue();
        });
    }

    /**
     * Process the command queue
     */
    private processQueue(): void {
        if (this.isProcessing || this.commandQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const queueItem = this.commandQueue.shift()!;
        let output = "";
        let isCompleted = false;
        const processEnv = {
            ...process.env,
            ...this.env,
            TERM: process.env.TERM || "xterm-256color",
            COLORTERM: process.env.COLORTERM || "truecolor",
        };

        logInfo(`[Terminal ${this.terminal.id}] Executing ${queueItem.parsedCommand.executable} ${queueItem.parsedCommand.args.join(" ")}`.trim());
        logInfo(`[Terminal ${this.terminal.id}] Working directory: ${this.terminal.cwd}`);

        this.process = spawn(queueItem.parsedCommand.executable, queueItem.parsedCommand.args, {
            cwd: this.terminal.cwd,
            env: processEnv,
            shell: false,
        });

        const complete = (result: TerminalCommandResult): void => {
            if (isCompleted) {
                return;
            }

            isCompleted = true;
            this.process = null;
            this.isProcessing = false;
            queueItem.resolve(result);
            this.emit("command:completed", result);
            this.processQueue();
        };

        this.process.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            output += chunk;
            this.emit("output", chunk);
        });

        this.process.stderr.on("data", (data: Buffer) => {
            const chunk = data.toString();
            output += chunk;
            this.emit("output", chunk);
        });

        this.process.on("error", (error: Error) => {
            this.emit("error", error.message);
            complete({
                terminalId: this.terminal.id,
                commandId: queueItem.commandId,
                output,
                exitCode: 1,
                error: error.message,
            });
        });

        this.process.on("close", (code: number | null) => {
            complete({
                terminalId: this.terminal.id,
                commandId: queueItem.commandId,
                output,
                exitCode: code ?? undefined,
            });
        });
    }

    /**
     * Close the terminal
     */
    close(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}
