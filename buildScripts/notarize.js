#!/usr/bin/env node

const { execFileSync } = require("child_process");

const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetry = (error) => {
    if (!error) {
        return false;
    }

    const message = typeof error === "string" ? error : error.message || "";

    if (!message) {
        return false;
    }

    return (
        message.includes("NSURLErrorDomain Code=-1009") ||
        message.includes("The Internet connection appears to be offline") ||
        message.includes("socket hang up") ||
        message.includes("ECONNRESET") ||
        message.includes("timed out")
    );
};

const getArg = (name, defaultValue) => {
    const prefix = `${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));

    if (match) {
        return match.slice(prefix.length);
    }
    return defaultValue;
};

const ensureAppleCreds = () => {
    const appleId = process.env.APPLE_ID;
    const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;

    const teamId = process.env.APPLE_TEAM_ID;

    if (!appleId || !applePassword || !teamId) {
        throw new Error("Apple notarization secrets are missing. Ensure APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID are set.");
    }

    return { appleId, applePassword, teamId };
};

const runNotarytool = (args) => {
    return execFileSync("xcrun", ["notarytool", ...args], { encoding: "utf8" }).trim();
};

const submit = () => {
    const defaultAppPath = path.resolve("build", "mac", "Power Platform ToolBox.app");
    const appPath = path.resolve(getArg("--app", defaultAppPath));

    const outputPath = path.resolve(getArg("--output", path.resolve("build", "notarization-info.json")));
    const bundleId = getArg("--bundle-id", "com.powerplatform.toolbox");

    if (!fs.existsSync(appPath)) {
        throw new Error(`Cannot submit for notarization because the app path does not exist: ${appPath}`);
    }

    const { appleId, applePassword, teamId } = ensureAppleCreds();

    process.stdout.write(`Submitting ${appPath} for notarization (bundleId: ${bundleId}) without waiting...\n`);

    const resultRaw = runNotarytool(["submit", appPath, "--apple-id", appleId, "--team-id", teamId, "--password", applePassword, "--bundle-id", bundleId, "--no-wait", "--output-format", "json"]);

    const parsed = JSON.parse(resultRaw);
    const submissionId = parsed.id;
    const info = {
        submissionId,
        bundleId,
        status: parsed.status,
        appPath,
        submittedAt: new Date().toISOString(),
    };

    fs.writeFileSync(outputPath, `${JSON.stringify(info, null, 2)}\n`);
    process.stdout.write(`Submitted notarization request. Submission ID: ${submissionId}\n`);
};

const loadInfo = (infoPath) => {
    if (!fs.existsSync(infoPath)) {
        throw new Error(`Notarization info file not found: ${infoPath}`);
    }

    const contents = fs.readFileSync(infoPath, "utf8");
    const info = JSON.parse(contents);

    if (!info.submissionId) {
        throw new Error(`Notarization info is missing submissionId: ${infoPath}`);
    }

    return info;
};

const waitForStatus = async () => {
    const infoPath = path.resolve(getArg("--info", path.resolve("build", "notarization-info.json")));
    const timeoutHours = Number(getArg("--timeout-hours", "12"));
    const intervalMinutes = Number(getArg("--interval-minutes", "5"));

    if (Number.isNaN(timeoutHours) || Number.isNaN(intervalMinutes)) {
        throw new Error("timeout-hours and interval-minutes must be numeric values");
    }

    const maxAttempts = Math.max(1, Math.ceil((timeoutHours * 60) / intervalMinutes));
    const info = loadInfo(infoPath);
    const { appleId, applePassword, teamId } = ensureAppleCreds();

    process.stdout.write(`Waiting for notarization ${info.submissionId} (max ${timeoutHours}h)...\n`);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const output = runNotarytool(["log", info.submissionId, "--apple-id", appleId, "--team-id", teamId, "--password", applePassword, "--output-format", "json"]);

            const parsed = JSON.parse(output);
            const status = parsed.status;

            if (status === "Accepted") {
                process.stdout.write(`Notarization ${info.submissionId} accepted.\n`);
                return;
            }

            if (status === "Invalid") {
                const issues = parsed.issues || [];
                process.stderr.write(`Notarization ${info.submissionId} was rejected.\n`);
                if (issues.length > 0) {
                    process.stderr.write(`${JSON.stringify(issues, null, 2)}\n`);
                }
                throw new Error("Apple rejected the notarization request.");
            }

            if (attempt === maxAttempts) {
                throw new Error(`Timed out waiting for notarization ${info.submissionId} after ${timeoutHours} hours.`);
            }

            const nextDelayMs = intervalMinutes * 60 * 1000;
            process.stdout.write(`Notarization still in progress (attempt ${attempt}/${maxAttempts}). Checking again in ${intervalMinutes} minutes...\n`);
            await sleep(nextDelayMs);
        } catch (error) {
            if (!shouldRetry(error)) {
                throw error;
            }

            const retryDelayMs = Math.max(60000, intervalMinutes * 60 * 1000);
            process.stderr.write(`Transient notarization error (${error.message}). Retrying in ${Math.round(retryDelayMs / 1000)} seconds...\n`);
            await sleep(retryDelayMs);
        }
    }
};

const mode = process.argv[2];

async function main() {
    if (mode === "submit") {
        submit();
        return;
    }

    if (mode === "wait") {
        await waitForStatus();
        return;
    }

    process.stderr.write("Usage: node buildScripts/notarize.js <submit|wait> [options]\n");
    process.stderr.write("  submit options: --app=path --output=path --bundle-id=com.example.app\n");
    process.stderr.write("  wait options: --info=path --timeout-hours=12 --interval-minutes=5\n");
    process.exitCode = 1;
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
});
const { notarize } = require("@electron/notarize");

const MAX_NOTARIZE_ATTEMPTS = 3;
const RETRY_DELAY_BASE_MS = 30000; // 30 seconds base delay, increases with attempts

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryNotarization = (error) => {
    if (!error) {
        return false;
    }

    const message = typeof error === "string" ? error : error.message || "";

    if (!message) {
        return false;
    }

    return message.includes("NSURLErrorDomain Code=-1009") || message.includes("The Internet connection appears to be offline") || message.includes("ECONNRESET") || message.includes("socket hang up");
};

module.exports = async function notarizeApp(context) {
    if (process.platform !== "darwin") {
        return;
    }

    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== "darwin") {
        return;
    }

    const appleId = process.env.APPLE_ID;
    const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
    const teamId = process.env.APPLE_TEAM_ID;

    if (!appleId || !applePassword || !teamId) {
        process.stdout.write("Skipping notarization because Apple credentials are missing.\n");
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    let lastError;

    for (let attempt = 1; attempt <= MAX_NOTARIZE_ATTEMPTS; attempt += 1) {
        try {
            process.stdout.write(`Submitting notarization request for ${appName}.app (attempt ${attempt}/${MAX_NOTARIZE_ATTEMPTS})...\n`);

            await notarize({
                appBundleId: "com.powerplatform.toolbox",
                appPath: `${appOutDir}/${appName}.app`,
                appleId,
                appleIdPassword: applePassword,
                teamId,
            });

            process.stdout.write(`Notarization completed for ${appName}.app\n`);
            return;
        } catch (error) {
            lastError = error;
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (attempt === MAX_NOTARIZE_ATTEMPTS || !shouldRetryNotarization(error)) {
                process.stderr.write(`Notarization failed for ${appName}.app: ${errorMessage}\n`);
                if (error && typeof error === "object" && "stack" in error && typeof error.stack === "string") {
                    process.stderr.write(`${error.stack}\n`);
                }
                break;
            }

            const delayMs = RETRY_DELAY_BASE_MS * attempt;
            process.stderr.write(`Notarization attempt ${attempt} failed (${errorMessage}). Retrying in ${Math.round(delayMs / 1000)}s...\n`);
            await delay(delayMs);
        }
    }

    throw lastError;
};
