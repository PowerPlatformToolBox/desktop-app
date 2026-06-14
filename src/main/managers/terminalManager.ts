import { ChildProcessWithoutNullStreams, spawn, execFileSync } from "child_process";
import { existsSync } from "fs";
import { basename, isAbsolute } from "path";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { Terminal, TerminalCommandResult, TerminalOptions } from "../../common/types";
import { logInfo, logWarn } from "../../common/logger";

// Shell interpreters and privilege-escalation tools that must never be invoked through the terminal API.
// Everything else is permitted so that tools can use commands like cd, code, dotnet, git, pac, npm install, etc.
const BLOCKED_TERMINAL_COMMANDS = new Set([
    // Unix/macOS shells
    "bash",
    "sh",
    "zsh",
    "fish",
    "csh",
    "ksh",
    "dash",
    "tcsh",
    // Windows shells and their .exe variants
    "cmd",
    "cmd.exe",
    "powershell",
    "powershell.exe",
    "pwsh",
    "pwsh.exe",
    // Privilege escalation
    "sudo",
    "su",
    "runas",
    "doas",
    "pkexec",
]);
const BLOCKED_TERMINAL_ENV_KEYS = new Set(["PATH", "PATHEXT", "COMSPEC", "SHELL", "NODE_OPTIONS", "BASH_ENV", "ENV", "PROMPT_COMMAND", "ZDOTDIR"]);
const BLOCKED_NPX_FLAGS = new Set(["-c", "--call", "-s", "--shell"]);
const BLOCKED_NPM_SUBCOMMANDS = new Set(["exec", "run", "run-script", "start", "stop", "restart", "test"]);

type ShellType = "posix" | "pwsh" | "cmd";

interface ParsedTerminalCommand {
    executable: string;
    args: string[];
}

interface QueuedCommand {
    parsedCommand: ParsedTerminalCommand;
    commandId: string;
    resolve: (result: TerminalCommandResult) => void;
}

interface PendingCommand {
    commandId: string;
    resolve: (result: TerminalCommandResult) => void;
    output: string;
    stderrBuffer: string;
}

interface SanitizedTerminalEnv {
    env?: Record<string, string>;
    strippedKeys: string[];
}

function sanitizeTerminalEnv(env?: Record<string, string>): SanitizedTerminalEnv {
    if (!env) {
        return { strippedKeys: [] };
    }

    const strippedKeys: string[] = [];
    const sanitizedEnv = Object.entries(env).reduce<Record<string, string>>((result, [key, value]) => {
        const normalizedKey = key.toUpperCase();
        if (BLOCKED_TERMINAL_ENV_KEYS.has(normalizedKey)) {
            strippedKeys.push(key);
            return result;
        }

        result[key] = value;
        return result;
    }, {});

    return {
        env: Object.keys(sanitizedEnv).length > 0 ? sanitizedEnv : undefined,
        strippedKeys,
    };
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
            // Commands are executed with shell:false, so tokenization only needs to preserve quoted
            // arguments and escaped whitespace/quotes without emulating full shell parsing.
            if (nextChar === '"' || nextChar === "'" || nextChar === "\\" || /\s/.test(nextChar || "")) {
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
        throw new Error("Terminal command ends with an incomplete escape sequence.");
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

    if (/[\r\n\u2028\u2029]/.test(trimmedCommand) || trimmedCommand.includes("\u000b") || trimmedCommand.includes("\u000c")) {
        throw new Error("Multi-line terminal commands are not allowed.");
    }

    const tokens = tokenizeTerminalCommand(trimmedCommand);
    if (tokens.length === 0) {
        throw new Error("Terminal command cannot be empty.");
    }

    const executable = tokens[0].toLowerCase();
    if (/[;&|<>]/.test(tokens[0])) {
        throw new Error(`Terminal command executable "${tokens[0]}" contains shell metacharacters.`);
    }

    if (BLOCKED_TERMINAL_COMMANDS.has(executable)) {
        throw new Error(`Blocked unsafe terminal command "${tokens[0]}". Shell interpreters and privilege-escalation tools are not allowed.`);
    }

    if (executable === "npx" && tokens.slice(1).some((arg) => BLOCKED_NPX_FLAGS.has(arg.toLowerCase()))) {
        throw new Error("Blocked unsafe npx invocation. Shell execution flags are not allowed.");
    }

    if (executable === "npm") {
        const subcommand = tokens[1]?.toLowerCase();
        if (subcommand && BLOCKED_NPM_SUBCOMMANDS.has(subcommand)) {
            throw new Error(`Blocked unsafe npm subcommand "${tokens[1]}".`);
        }
    }

    return {
        executable,
        args: tokens.slice(1),
    };
}

function getShellType(shell: string): ShellType {
    const name = basename(shell).toLowerCase().replace(/\.exe$/, "");
    if (name === "pwsh" || name === "powershell") return "pwsh";
    if (name === "cmd") return "cmd";
    return "posix";
}

function getShellInteractiveArgs(shellType: ShellType): string[] {
    if (shellType === "pwsh") return ["-NoLogo"];
    if (shellType === "cmd") return ["/K"];
    return ["-i"];
}

/**
 * Builds the text written to the shell's stdin to execute a validated command.
 * A unique sentinel marker is written to stderr after the command so the caller
 * can detect completion and extract the exit code without polluting visible output.
 */
function buildShellCommandInput(parsedCommand: ParsedTerminalCommand, commandId: string, shellType: ShellType): string {
    const quoteArg = (arg: string): string => {
        if (shellType === "pwsh") return `'${arg.replace(/'/g, "''")}'`;
        if (shellType === "cmd") return `"${arg.replace(/"/g, '""')}"`;
        return `'${arg.replace(/'/g, "'\\''")}'`; // POSIX single-quote escaping
    };
    const argStr = parsedCommand.args.length > 0 ? " " + parsedCommand.args.map(quoteArg).join(" ") : "";
    const cmd = `${parsedCommand.executable}${argStr}`;
    const sentinel = `PPTB_CMD_END_${commandId}`;

    if (shellType === "pwsh") {
        // Write sentinel to stderr so stdout stays clean for the caller
        return `${cmd}\n$__pptb__ = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }; [Console]::Error.WriteLine("${sentinel}_$__pptb__")\n`;
    }
    if (shellType === "cmd") {
        return `${cmd}\r\necho ${sentinel}_%ERRORLEVEL% 1>&2\r\n`;
    }
    // POSIX: write sentinel to stderr using printf to avoid echo quirks
    return `${cmd}\n__pptb__=$?; printf '%s\\n' "${sentinel}_$__pptb__" >&2\n`;
}

/**
 * Resolves the preferred shell requested by a tool, falling back to the system
 * default if the requested shell cannot be found on the current machine.
 */
function resolveShell(requestedShell: string, defaultShell: string, terminalId: string): string {
    if (isAbsolute(requestedShell)) {
        if (existsSync(requestedShell)) {
            return requestedShell;
        }
        logWarn(`Requested shell "${requestedShell}" not found for terminal ${terminalId}; falling back to ${defaultShell}`);
        return defaultShell;
    }

    try {
        const finder = process.platform === "win32" ? "where" : "which";
        execFileSync(finder, [requestedShell], { encoding: "utf8", timeout: 3000 });
        return requestedShell;
    } catch {
        logWarn(`Requested shell "${requestedShell}" not found in PATH for terminal ${terminalId}; falling back to ${defaultShell}`);
        return defaultShell;
    }
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
        const shell = options.shell ? resolveShell(options.shell, this.defaultShell, terminalId) : this.defaultShell;
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

        const { env: sanitizedEnv, strippedKeys: strippedEnvKeys } = sanitizeTerminalEnv(options.env);
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
 * Internal terminal instance that owns a persistent shell process.
 * Commands are written to the shell's stdin and completion is detected
 * via a unique sentinel marker written to stderr.
 */
class TerminalInstance extends EventEmitter {
    public terminal: Terminal;
    private shellProcess: ChildProcessWithoutNullStreams | null = null;
    private env?: Record<string, string>;
    private commandQueue: QueuedCommand[] = [];
    private isProcessing = false;
    private pendingCommand: PendingCommand | null = null;
    private shellType: ShellType;

    constructor(terminal: Terminal, env?: Record<string, string>) {
        super();
        this.terminal = terminal;
        this.env = env;
        this.shellType = getShellType(terminal.shell);
        this.startShellProcess();
    }

    /**
     * Start the persistent shell process so the terminal is not blank when a tool loads.
     * Wires up stdout/stderr for display output and sentinel-based command completion.
     */
    startShellProcess(): void {
        const processEnv = {
            ...process.env,
            ...this.env,
            TERM: process.env.TERM || "xterm-256color",
            COLORTERM: process.env.COLORTERM || "truecolor",
        };

        logInfo(`[Terminal ${this.terminal.id}] Starting shell: ${this.terminal.shell}`);

        this.shellProcess = spawn(this.terminal.shell, getShellInteractiveArgs(this.shellType), {
            cwd: this.terminal.cwd,
            env: processEnv,
            shell: false,
        });

        this.shellProcess.stdout.on("data", (data: Buffer) => {
            const text = data.toString();
            this.emit("output", text);
            if (this.pendingCommand) {
                this.pendingCommand.output += text;
            }
        });

        this.shellProcess.stderr.on("data", (data: Buffer) => {
            this.handleStderrChunk(data.toString());
        });

        this.shellProcess.on("error", (error: Error) => {
            logWarn(`[Terminal ${this.terminal.id}] Shell process error: ${error.message}`);
            this.emit("error", error.message);
            if (this.pendingCommand) {
                this.failPendingCommand(error.message);
            }
        });

        this.shellProcess.on("close", () => {
            logInfo(`[Terminal ${this.terminal.id}] Shell process exited`);
            this.shellProcess = null;
            if (this.pendingCommand) {
                this.failPendingCommand("Shell process exited unexpectedly.");
            }
        });
    }

    /**
     * Handle a chunk of stderr output from the shell.
     * Normal stderr lines are forwarded to the terminal display.
     * Sentinel lines (written after each command) are used to detect completion
     * and extract the exit code without polluting the visible output.
     */
    private handleStderrChunk(text: string): void {
        if (!this.pendingCommand) {
            this.emit("output", text);
            return;
        }

        this.pendingCommand.stderrBuffer += text;
        const sentinel = `PPTB_CMD_END_${this.pendingCommand.commandId}_`;
        const sentinelIdx = this.pendingCommand.stderrBuffer.indexOf(sentinel);

        if (sentinelIdx !== -1) {
            // Emit any stderr output that preceded the sentinel line
            const beforeSentinel = this.pendingCommand.stderrBuffer.substring(0, sentinelIdx);
            if (beforeSentinel) {
                this.emit("output", beforeSentinel);
                this.pendingCommand.output += beforeSentinel;
            }
            const afterSentinel = this.pendingCommand.stderrBuffer.substring(sentinelIdx + sentinel.length);
            const exitCodeMatch = afterSentinel.match(/^(\d+)/);
            const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
            this.resolvePendingCommand(exitCode);
        } else {
            // Sentinel not yet received; emit complete stderr lines in real-time
            const lastNewline = this.pendingCommand.stderrBuffer.lastIndexOf("\n");
            if (lastNewline !== -1) {
                const safeToEmit = this.pendingCommand.stderrBuffer.substring(0, lastNewline + 1);
                this.emit("output", safeToEmit);
                this.pendingCommand.output += safeToEmit;
                this.pendingCommand.stderrBuffer = this.pendingCommand.stderrBuffer.substring(lastNewline + 1);
            }
        }
    }

    private resolvePendingCommand(exitCode: number): void {
        if (!this.pendingCommand) return;
        const pending = this.pendingCommand;
        this.pendingCommand = null;
        this.isProcessing = false;

        const result: TerminalCommandResult = {
            terminalId: this.terminal.id,
            commandId: pending.commandId,
            output: pending.output,
            exitCode,
        };
        pending.resolve(result);
        this.emit("command:completed", result);
        this.processQueue();
    }

    private failPendingCommand(errorMsg: string): void {
        if (!this.pendingCommand) return;
        const pending = this.pendingCommand;
        this.pendingCommand = null;
        this.isProcessing = false;

        const result: TerminalCommandResult = {
            terminalId: this.terminal.id,
            commandId: pending.commandId,
            output: pending.output,
            exitCode: 1,
            error: errorMsg,
        };
        pending.resolve(result);
        this.emit("command:completed", result);
        this.processQueue();
    }

    /**
     * Execute a validated command by writing it to the shell's stdin.
     */
    async executeCommand(parsedCommand: ParsedTerminalCommand): Promise<TerminalCommandResult> {
        const commandId = randomUUID();
        return new Promise<TerminalCommandResult>((resolve) => {
            this.commandQueue.push({ parsedCommand, commandId, resolve });
            this.processQueue();
        });
    }

    /**
     * Dequeue the next command and write it to the shell's stdin.
     */
    private processQueue(): void {
        if (this.isProcessing || this.commandQueue.length === 0) {
            return;
        }

        const queueItem = this.commandQueue.shift()!;

        if (!this.shellProcess || this.shellProcess.stdin.destroyed) {
            const result: TerminalCommandResult = {
                terminalId: this.terminal.id,
                commandId: queueItem.commandId,
                exitCode: 1,
                error: "Shell process is not running.",
            };
            queueItem.resolve(result);
            this.emit("command:completed", result);
            this.processQueue();
            return;
        }

        this.isProcessing = true;
        this.pendingCommand = {
            commandId: queueItem.commandId,
            resolve: queueItem.resolve,
            output: "",
            stderrBuffer: "",
        };

        logInfo(`[Terminal ${this.terminal.id}] Executing: ${queueItem.parsedCommand.executable}`);
        this.shellProcess.stdin.write(buildShellCommandInput(queueItem.parsedCommand, queueItem.commandId, this.shellType));
    }

    /**
     * Kill the shell process and clean up.
     */
    close(): void {
        if (this.shellProcess) {
            this.shellProcess.kill();
            this.shellProcess = null;
        }
    }
}
