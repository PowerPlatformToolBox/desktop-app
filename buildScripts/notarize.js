const { notarize } = require("@electron/notarize");

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

    try {
        await notarize({
            appBundleId: "com.powerplatform.toolbox",
            appPath: `${appOutDir}/${appName}.app`,
            appleId,
            appleIdPassword: applePassword,
            teamId,
        });

        process.stdout.write(`Submitted notarization request for ${appName}.app\n`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Notarization failed for ${appName}.app: ${errorMessage}\n`);
        if (error && typeof error === "object" && "stack" in error && typeof error.stack === "string") {
            process.stderr.write(`${error.stack}\n`);
        }
        throw error;
    }
};
