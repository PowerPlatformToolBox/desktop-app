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
     * @param browserType The type of browser to check (chrome or edge)
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
        }

        // Check if any of the paths exist
        return possiblePaths.some((p) => fs.existsSync(p));
    }

    /**
     * Get list of browser profiles for a specific browser
     * @param browserType The type of browser to get profiles for
     * @returns Array of profile objects with name and path
     */
    public getBrowserProfiles(browserType: string): Array<{ name: string; path: string }> {
        if (!browserType || browserType === "default") {
            return [];
        }

        if (!this.isBrowserInstalled(browserType)) {
            return [];
        }

        const platform = process.platform;

        try {
            if (browserType === "chrome" || browserType === "edge") {
                return this.getChromiumProfiles(browserType, platform);
            }
        } catch (error) {
            logWarn(`Failed to get profiles for ${browserType}: ${(error as Error).message}`);
            return [];
        }

        return [];
    }

    /**
     * Get Chromium-based browser profiles (Chrome, Edge)
     * Returns objects with both display name and directory path
     */
    private getChromiumProfiles(browserType: string, platform: string): Array<{ name: string; path: string }> {
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
        }

        if (!fs.existsSync(userDataPath)) {
            return [];
        }

        const profiles: Array<{ name: string; path: string }> = [];

        try {
            // Try to read Local State file to get profile names (preferred method)
            const localStatePath = path.join(userDataPath, "Local State");
            if (fs.existsSync(localStatePath)) {
                const localStateContent = fs.readFileSync(localStatePath, "utf8");
                const localState = JSON.parse(localStateContent);

                if (localState.profile && localState.profile.info_cache) {
                    const infoCache = localState.profile.info_cache;

                    // Iterate through all profiles in info_cache
                    for (const profileDir in infoCache) {
                        if (Object.prototype.hasOwnProperty.call(infoCache, profileDir)) {
                            const profileInfo = infoCache[profileDir];
                            const profileName = profileInfo.name || profileDir;

                            // Include Default and Profile X directories
                            if (profileDir === "Default" || profileDir.startsWith("Profile ")) {
                                profiles.push({
                                    name: profileName,
                                    path: profileDir,
                                });
                            }
                        }
                    }
                }

                // If we found profiles from Local State, return them
                if (profiles.length > 0) {
                    return profiles;
                }
            }
        } catch (error) {
            logWarn(`Failed to read Local State file, falling back to directory scan: ${(error as Error).message}`);
        }

        // Fallback: Scan directories and try to read individual Preferences files
        try {
            const entries = fs.readdirSync(userDataPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const dirName = entry.name;

                    // Check for Default profile or Profile X directories
                    if (dirName === "Default" || dirName.startsWith("Profile ")) {
                        try {
                            // Try to read the profile name from Preferences file
                            const preferencesPath = path.join(userDataPath, dirName, "Preferences");
                            if (fs.existsSync(preferencesPath)) {
                                const preferencesContent = fs.readFileSync(preferencesPath, "utf8");
                                const preferences = JSON.parse(preferencesContent);

                                const profileName = preferences.profile?.name || dirName;
                                profiles.push({
                                    name: profileName,
                                    path: dirName,
                                });
                            } else {
                                // If Preferences doesn't exist, use directory name
                                profiles.push({
                                    name: dirName,
                                    path: dirName,
                                });
                            }
                        } catch {
                            // If we can't read Preferences, just use directory name
                            profiles.push({
                                name: dirName,
                                path: dirName,
                            });
                        }
                    }
                }
            }
        } catch (error) {
            logWarn(`Failed to scan browser profile directories: ${(error as Error).message}`);
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
            // Sanitize profile name to avoid problematic characters in CLI argument
            const safeProfileName = profileName.replace(/[^\w\s-]/g, "_");
            // Chrome and Edge use --profile-directory flag
            args.push(`--profile-directory=${safeProfileName}`);
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
