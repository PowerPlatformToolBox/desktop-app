/**
 * CLI-specific constants for headless operation mode
 */

export const CLI_CONSTANTS = {
    /**
     * Default port for headless MCP server
     */
    DEFAULT_MCP_PORT: 7340,

    /**
     * Default hostname for headless MCP server
     */
    DEFAULT_MCP_HOST: "127.0.0.1",

    /**
     * Default timeout for headless tool invocation (in milliseconds)
     */
    DEFAULT_TOOL_TIMEOUT_MS: 300000, // 5 minutes

    /**
     * Default job cleanup TTL (in milliseconds) - how long to keep completed jobs
     */
    DEFAULT_JOB_CLEANUP_TTL_MS: 3600000, // 1 hour

    /**
     * Job polling check interval (in milliseconds)
     */
    JOB_CLEANUP_CHECK_INTERVAL_MS: 60000, // 1 minute

    /**
     * Maximum number of concurrent job executions
     */
    MAX_CONCURRENT_JOBS: 10,

    /**
     * Log levels for CLI
     */
    LOG_LEVELS: {
        DEBUG: "debug",
        INFO: "info",
        WARN: "warn",
        ERROR: "error",
    } as const,
};

/**
 * CLI Exit codes for error handling
 */
export const EXIT_CODES = {
    SUCCESS: 0,
    GENERAL_ERROR: 1,
    INVALID_ARGUMENTS: 2,
    AUTHENTICATION_FAILED: 3,
    TOOL_NOT_FOUND: 4,
    HEADLESS_NOT_SUPPORTED: 5,
    TOOL_EXECUTION_FAILED: 6,
} as const;

/**
 * CLI command definitions
 */
export const CLI_COMMANDS = {
    SERVE: "serve",
    INVOKE: "invoke",
    JOB_STATUS: "job-status",
    CONFIG: "config",
    HELP: "help",
    VERSION: "version",
} as const;
