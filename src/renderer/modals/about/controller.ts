export interface AboutModalControllerConfig {
    copyChannel: string;
    appVersion: string;
    installId: string;
    electronVersion: string;
    nodeVersion: string;
    chromeVersion: string;
    platform: string;
    arch: string;
    osVersion: string;
    locale: string;
}

export function getAboutModalControllerScript(config: AboutModalControllerConfig): string {
    const serialized = JSON.stringify(config);
    return `
<script>
(() => {
    const CONFIG = ${serialized};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        return;
    }

    const closeBtn = document.getElementById("about-close-btn");
    const okBtn = document.getElementById("about-ok-btn");
    const copyBtn = document.getElementById("about-copy-btn");

    closeBtn?.addEventListener("click", () => {
        modalBridge.close();
    });

    okBtn?.addEventListener("click", () => {
        modalBridge.close();
    });

    copyBtn?.addEventListener("click", () => {
        modalBridge.send(CONFIG.copyChannel, {
            text: [
                "Power Platform ToolBox",
                "Version: " + CONFIG.appVersion,
                "Install ID: " + CONFIG.installId,
                "",
                "Environment:",
                "Electron: " + CONFIG.electronVersion,
                "Node.js: " + CONFIG.nodeVersion,
                "Chromium: " + CONFIG.chromeVersion,
                "",
                "System:",
                "OS: " + CONFIG.platform + " " + CONFIG.arch,
                "OS Version: " + CONFIG.osVersion,
                "Locale: " + CONFIG.locale,
            ].join("\\n"),
        });
    });
})();
</script>`;
}
