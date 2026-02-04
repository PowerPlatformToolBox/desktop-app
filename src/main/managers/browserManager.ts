import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { shell } from "electron";
import { logInfo, logWarn } from "../../common/sentryHelper";
import { DataverseConnection } from "../../common/types";

/**
 * Manages browser detection, profile enumeration, and browser launching
 */
export class BrowserManager {
    /**
     * Check if a specific browser is installed on the system
     * @param browserType The type of browser to check
     * @returns true if browser is installed, false otherwise
     */
    public isBrowserInstalled(browserType: string): boolean {
        if (!browserType || browserType === "default") {
            return true; // Default browser is always available
        }

        const platform = process.platform;
        let possiblePaths: string[] = [];

        if (browserType === "chrome") {
            if (platform === "win32") {
                possiblePaths = [
                    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
                    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
                    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
                ];
            } else if (platform === "darwin") {
                possiblePaths = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
            } else {
                // For Linux, check if command exists
                try {
                    execSync("which google-chrome", { stdio: "ignore" });
                    return true;
                } catch {
                    return false;
                }
            }
        } else if (browserType === "edge") {
            if (platform === "win32") {
                possiblePaths = [
                    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
                    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
                ];
            } else if (platform === "darwin") {
                possiblePaths = ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"];
            } else {
                try {
                    execSync("which microsoft-edge", { stdio: "ignore" });
                    return true;
                } catch {
                    return false;
                }
            }
        } else if (browserType === "firefox") {
            if (platform === "win32") {
                possiblePaths = [
                    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Mozilla Firefox\\firefox.exe"),
                    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Mozilla Firefox\\firefox.exe"),
                ];
            } else if (platform === "darwin") {
                possiblePaths = ["/Applications/Firefox.app/Contents/MacOS/firefox"];
            } else {
                try {
                    execSync("which firefox", { stdio: "ignore" });
                    return true;
                } catch {
                    return false;
                }
            }
        } else if (browserType === "brave") {
            if (platform === "win32") {
                possiblePaths = [
                    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                    path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                ];
            } else if (platform === "darwin") {
                possiblePaths = ["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"];
            } else {
                try {
                    execSync("which brave-browser", { stdio: "ignore" });
                    return true;
                } catch {
                    return false;
                }
            }
        }

        // Check if any of the paths exist
        return possiblePaths.some((p) => fs.existsSync(p));
    }

    /**
     * Get list of browser profiles for a specific browser
     * @param browserType The type of browser to get profiles for
     * @returns Array of profile names
     */
    public getBrowserProfiles(browserType: string): string[] {
        if (!browserType || browserType === "default") {
            return [];
        }

        if (!this.isBrowserInstalled(browserType)) {
            return [];
        }

        const platform = process.platform;

        try {
            if (browserType === "firefox") {
                return this.getFirefoxProfiles(platform);
            } else if (browserType === "chrome" || browserType === "edge" || browserType === "brave") {
                return this.getChromiumProfiles(browserType, platform);
            }
        } catch (error) {
            logWarn(`Failed to get profiles for ${browserType}: ${(error as Error).message}`);
            return [];
        }

        return [];
    }

    /**
     * Get Firefox profiles by parsing profiles.ini
     */
    private getFirefoxProfiles(platform: string): string[] {
        let profilesPath = "";

        if (platform === "win32") {
            profilesPath = path.join(process.env.APPDATA || "", "Mozilla\\Firefox\\profiles.ini");
        } else if (platform === "darwin") {
            profilesPath = path.join(os.homedir(), "Library/Application Support/Firefox/profiles.ini");
        } else {
            profilesPath = path.join(os.homedir(), ".mozilla/firefox/profiles.ini");
        }

        if (!fs.existsSync(profilesPath)) {
            return [];
        }

        const content = fs.readFileSync(profilesPath, "utf8");
        const profiles: string[] = [];

        // Parse INI file for profile names
        const lines = content.split("\n");
        let currentSection = "";
        let currentName = "";

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                // Save previous profile if we have a name
                if (currentName && currentSection.startsWith("Profile")) {
                    profiles.push(currentName);
                }
                currentSection = trimmed.slice(1, -1);
                currentName = "";
            } else if (trimmed.startsWith("Name=")) {
                currentName = trimmed.substring(5);
            }
        }

        // Don't forget the last profile
        if (currentName && currentSection.startsWith("Profile")) {
            profiles.push(currentName);
        }

        return profiles;
    }

    /**
     * Get Chromium-based browser profiles (Chrome, Edge, Brave)
     */
    private getChromiumProfiles(browserType: string, platform: string): string[] {
        let userDataPath = "";

        if (browserType === "chrome") {
            if (platform === "win32") {
                userDataPath = path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\User Data");
            } else if (platform === "darwin") {
                userDataPath = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
            } else {
                userDataPath = path.join(os.homedir(), ".config/google-chrome");
            }
        } else if (browserType === "edge") {
            if (platform === "win32") {
                userDataPath = path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\User Data");
            } else if (platform === "darwin") {
                userDataPath = path.join(os.homedir(), "Library/Application Support/Microsoft Edge");
            } else {
                userDataPath = path.join(os.homedir(), ".config/microsoft-edge");
            }
        } else if (browserType === "brave") {
            if (platform === "win32") {
                userDataPath = path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\User Data");
            } else if (platform === "darwin") {
                userDataPath = path.join(os.homedir(), "Library/Application Support/BraveSoftware/Brave-Browser");
            } else {
                userDataPath = path.join(os.homedir(), ".config/BraveSoftware/Brave-Browser");
            }
        }

        if (!fs.existsSync(userDataPath)) {
            return [];
        }

        const profiles: string[] = [];

        // Read all directories in User Data folder
        const entries = fs.readdirSync(userDataPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const dirName = entry.name;

                // Check for Default profile
                if (dirName === "Default") {
                    profiles.push("Default");
                }
                // Check for Profile X directories
                else if (dirName.startsWith("Profile ")) {
                    profiles.push(dirName);
                }
            }
        }

        return profiles;
    }

    /**
     * Get browser executable path and arguments for launching with a specific profile
     * Returns null if browser is not found, which triggers fallback to default browser
     */
    private getBrowserLaunchCommand(browserType: string, profileName: string | undefined): { executable: string; args: string[] } | null {
        const platform = process.platform;
        let executable = "";
        const args: string[] = [];

        // If no browser type specified or set to default, return null for fallback
        if (!browserType || browserType === "default") {
            return null;
        }

        // Determine browser executable path based on platform and browser type
        if (browserType === "chrome") {
            if (platform === "win32") {
                // Try multiple common Chrome installation paths on Windows
                const chromePaths = [
                    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
                    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
                    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
                ];
                for (const chromePath of chromePaths) {
                    if (fs.existsSync(chromePath)) {
                        executable = chromePath;
                        break;
                    }
                }
            } else if (platform === "darwin") {
                executable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
            } else {
                // Linux
                executable = "google-chrome";
            }
        } else if (browserType === "edge") {
            if (platform === "win32") {
                const edgePaths = [
                    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
                    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
                ];
                for (const edgePath of edgePaths) {
                    if (fs.existsSync(edgePath)) {
                        executable = edgePath;
                        break;
                    }
                }
            } else if (platform === "darwin") {
                executable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
            } else {
                // Linux
                executable = "microsoft-edge";
            }
        } else if (browserType === "firefox") {
            if (platform === "win32") {
                const firefoxPaths = [
                    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Mozilla Firefox\\firefox.exe"),
                    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Mozilla Firefox\\firefox.exe"),
                ];
                for (const firefoxPath of firefoxPaths) {
                    if (fs.existsSync(firefoxPath)) {
                        executable = firefoxPath;
                        break;
                    }
                }
            } else if (platform === "darwin") {
                executable = "/Applications/Firefox.app/Contents/MacOS/firefox";
            } else {
                executable = "firefox";
            }
        } else if (browserType === "brave") {
            if (platform === "win32") {
                const bravePaths = [
                    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                    path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
                ];
                for (const bravePath of bravePaths) {
                    if (fs.existsSync(bravePath)) {
                        executable = bravePath;
                        break;
                    }
                }
            } else if (platform === "darwin") {
                executable = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
            } else {
                executable = "brave-browser";
            }
        }

        // If executable not found or not set, return null for fallback
        if (!executable) {
            return null;
        }

        // Verify executable exists (for absolute paths)
        if (path.isAbsolute(executable) && !fs.existsSync(executable)) {
            return null;
        }

        // Add profile argument if specified
        if (profileName) {
            if (browserType === "firefox") {
                // Firefox uses -P flag for profile
                args.push("-P", profileName);
            } else {
                // Chrome, Edge, and Brave use --profile-directory flag
                args.push(`--profile-directory=${profileName}`);
            }
        }

        return { executable, args };
    }

    /**
     * Open URL in browser with optional profile support
     * Falls back to default browser if profile browser is not found
     */
    public async openBrowserWithProfile(url: string, connection: DataverseConnection): Promise<void> {
        const browserType = connection.browserType || "default";
        const profileName = connection.browserProfile;

        // If default browser or no profile specified, use standard shell.openExternal
        if (browserType === "default" || !profileName) {
            return shell.openExternal(url);
        }

        // Try to get browser launch command with profile
        const browserCommand = this.getBrowserLaunchCommand(browserType, profileName);

        if (!browserCommand) {
            // Browser not found, fallback to default browser
            logInfo(`Browser ${browserType} not found, falling back to default browser`);
            return shell.openExternal(url);
        }

        try {
            // Launch browser with profile
            const { executable, args } = browserCommand;
            const browserArgs = [...args, url];

            logInfo(`Launching ${browserType} with profile ${profileName}: ${executable} ${browserArgs.join(" ")}`);

            spawn(executable, browserArgs, {
                detached: true,
                stdio: "ignore",
            }).unref();
        } catch (error) {
            // If browser launch fails, fallback to default browser
            logWarn(`Failed to launch ${browserType} with profile, falling back to default: ${(error as Error).message}`);
            return shell.openExternal(url);
        }
    }
}
