/**
 * Constants used throughout the application
 */

/**
 * Dataverse Web API version
 * Update this constant when the API version changes
 */
export const DATAVERSE_API_VERSION = "v9.2";

/**
 * Tool Registry Configuration
 * @deprecated Use Supabase instead
 */
export const TOOL_REGISTRY_URL = "https://www.powerplatformtoolbox.com/registry/registry.json";

/**
 * Supabase Configuration
 * These values are injected at build time from environment variables.
 * They are NOT stored in the source code for security reasons.
 * Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables before building.
 */
export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

/**
 * Minimum API version supported by this ToolBox version
 * Tools requiring older API versions than this will not be supported
 * This represents backwards compatibility - how far back we support
 * 1.0.17 - File System breaking change was introduced
 */
export const MIN_SUPPORTED_API_VERSION = "1.0.17";

/**
 * Azure Blob Storage Configuration
 * Base URL for the Azure Blob container that hosts tool packages and the remote registry.
 * The container should be publicly readable (anonymous read access for blobs).
 * Set AZURE_BLOB_BASE_URL to the full container URL, e.g.:
 *   https://<account>.blob.core.windows.net/tools
 *
 * Expected layout inside the container:
 *   registry.json                                                     – remote registry index (fallback after Supabase)
 *   packages/<tool-id>-<version>/<tool-id>-<version>.tar.gz          – pre-packaged tool archive
 *   packages/<tool-id>-<version>/icon-light.png                      – light theme icon for the tool/version
 *   packages/<tool-id>-<version>/icon-dark.png                       – dark theme icon for the tool/version
 */
export const AZURE_BLOB_BASE_URL = process.env.AZURE_BLOB_BASE_URL || "";

/**
 * Blocked terminal commands that tools are not allowed to execute through the TerminalManager.
 * This is a security measure to prevent tools from executing potentially dangerous commands that could harm the user's system or compromise their security.
 * Note that this is not an exhaustive list of all potentially dangerous commands, but it covers the most common ones.
 * The check is done by comparing the command being executed against this list, ignoring case and allowing for additional arguments (e.g. "powershell -NoProfile" would still be blocked).
 */
export const BLOCKED_TERMINAL_COMMANDS = new Set([
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
    // Runtime interpreters/hosts that can evaluate arbitrary code or spawn child processes
    "node",
    "node.exe",
    "nodejs",
    "dotnet",
    "dotnet.exe",
    "csi",
    "csi.exe",
    // Privilege escalation
    "sudo",
    "su",
    "runas",
    "doas",
    "pkexec",
    // Scripting interpreters with shell-escape or arbitrary-eval capability
    "python",
    "python3",
    "python2",
    "perl",
    "ruby",
    "irb",
    "php",
    "php.exe",
    "lua",
    "tclsh",
    "wish",
    // Pagers/editors with built-in shell escapes
    "less",
    "more",
    "man",
    "vi",
    "vim",
    "nvim",
    "emacs",
    "nano",
    // Utilities with side-channel command execution
    "find",
    "awk",
    "gawk",
    "nawk",
    "xargs",
    "make",
    // Remote access / tunneling / exfiltration
    "ssh",
    "scp",
    "sftp",
    "rsync",
    "telnet",
    "ftp",
    "nc",
    "ncat",
    "netcat",
    "socat",
    // WSL (escapes the sandbox into a full Linux shell)
    "wsl",
    "wsl.exe",
    // Windows LOLBins
    "mshta.exe",
    "wscript.exe",
    "cscript.exe",
    "regsvr32.exe",
    "rundll32.exe",
    "certutil.exe",
    "bitsadmin.exe",
    "forfiles.exe",
    "wmic.exe",
    "installutil.exe",
    "msiexec.exe",
    "reg.exe",
    "schtasks.exe",
    "vssadmin.exe",
    "wevtutil.exe",
    "conhost",
    "conhost.exe",
    "start",
    // macOS-specific
    "osascript",
    "open",
    "launchctl",
    "defaults",
    "dscl",
    // Linux-specific
    "crontab",
    "at",
    "systemd-run",
    "chroot",
    "useradd",
    "usermod",
    "passwd",
]);

/**
 * Environment variables and npx flags that must be stripped from terminal sessions to prevent security issues or breakage.
 * These are not necessarily blocked from being executed, but they will be removed from the environment or command line when a terminal session is created.
 * For example, allowing PATH through could let a tool trick the user into executing a malicious version of a common command.
 * Allowing "npx -s" or "npx --shell" could let a tool execute arbitrary shell commands, bypassing the blocked command list entirely.
 * Note that this is not an exhaustive list of all potentially dangerous environment variables or npx flags, but it covers the most common ones.
 */
export const BLOCKED_TERMINAL_ENV_KEYS = new Set([
    "PATH",
    "PATHEXT",
    "COMSPEC",
    "SHELL",
    "NODE_OPTIONS",
    "BASH_ENV",
    "ENV",
    "PROMPT_COMMAND",
    "ZDOTDIR",
    // Dynamic-linker / runtime injection
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    // Tool-specific command/option injection
    "GIT_SSH_COMMAND",
    "PYTHONSTARTUP",
    "PERL5OPT",
    "RUBYOPT",
]);

/**
 * Blocked npx flags that could be used to execute arbitrary shell commands, bypassing the blocked command list.
 * This is a security measure to prevent tools from using npx as a way to execute commands that would otherwise be blocked.
 * The check is done by looking for these flags anywhere in the command line, ignoring case and allowing for additional arguments (e.g. "npx -s" or "npx --shell" would both be blocked).
 * For more information, see the npx documentation: https://www.npmjs.com/package/npx#options
 */
export const BLOCKED_NPX_FLAGS = new Set(["-c", "--call", "-s", "--shell"]);
