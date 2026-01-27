export interface TroubleshootingModalChannelIds {
    runCheck: string;
    checkResult: string;
}

export interface TroubleshootingModalControllerConfig {
    channels: TroubleshootingModalChannelIds;
}

export function getTroubleshootingModalControllerScript(config: TroubleshootingModalControllerConfig): string {
    const serialized = JSON.stringify(config);
    return `
<script>
(() => {
    const CONFIG = ${serialized};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        console.warn("modalBridge API is unavailable");
        return;
    }

    const closeModalBtn = document.getElementById("close-modal");
    const closeBtnFooter = document.getElementById("close-btn");
    const retryChecksBtn = document.getElementById("retry-checks-btn");

    // SVG icons
    const PENDING_ICON = '<svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
    const LOADING_ICON = '<svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2 A8 8 0 0 1 18 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
    const SUCCESS_ICON = '<svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 10 L9 13 L14 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
    const ERROR_ICON = '<svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 7 L13 13 M13 7 L7 13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>';

    let isRunning = false;

    function setCheckStatus(checkId, status, message) {
        const icon = document.getElementById(checkId + "-icon");
        const messageEl = document.getElementById(checkId + "-message");
        
        if (!icon || !messageEl) return;

        // Update icon
        icon.className = "check-status-icon " + status;
        switch (status) {
            case "pending":
                icon.innerHTML = PENDING_ICON;
                break;
            case "loading":
                icon.innerHTML = LOADING_ICON;
                break;
            case "success":
                icon.innerHTML = SUCCESS_ICON;
                break;
            case "error":
                icon.innerHTML = ERROR_ICON;
                break;
        }

        // Update message
        messageEl.textContent = message;
        messageEl.className = "check-message";
        if (status === "success") {
            messageEl.classList.add("success");
        } else if (status === "error") {
            messageEl.classList.add("error");
        }
    }

    function resetChecks() {
        setCheckStatus("check-user-settings", "pending", "Ready to check");
        setCheckStatus("check-tool-settings", "pending", "Ready to check");
        setCheckStatus("check-connections", "pending", "Ready to check");
        setCheckStatus("check-sentry", "pending", "Ready to check");
        setCheckStatus("check-supabase", "pending", "Ready to check");
        setCheckStatus("check-registry", "pending", "Ready to check");
        setCheckStatus("check-download", "pending", "Ready to check");
        setCheckStatus("check-fallback", "pending", "Ready to check");
    }

    // Listen for check results from main process
    modalBridge.onMessage?.((payload) => {
        if (!payload || typeof payload !== "object") return;
        if (payload.channel !== CONFIG.channels.checkResult) return;
        
        const data = payload.data || {};
        const checkType = data.checkType;
        const result = data.result || {};
        
        let checkId;
        switch (checkType) {
            case "user-settings":
                checkId = "check-user-settings";
                break;
            case "tool-settings":
                checkId = "check-tool-settings";
                break;
            case "connections":
                checkId = "check-connections";
                break;
            case "sentry":
                checkId = "check-sentry";
                break;
            case "supabase":
                checkId = "check-supabase";
                break;
            case "registry":
                checkId = "check-registry";
                break;
            case "download":
                checkId = "check-download";
                break;
            case "fallback":
                checkId = "check-fallback";
                break;
            default:
                return;
        }
        
        if (result.success) {
            let message = result.message || "Check passed";
            if (checkType === "registry" && result.toolCount !== undefined) {
                message = \`✓ Registry accessible with \${result.toolCount} tools\`;
            } else if (checkType === "connections" && result.connectionCount !== undefined) {
                message = \`✓ \${result.message}\`;
            } else if (message.startsWith("✓")) {
                // Message already has checkmark
            } else {
                message = \`✓ \${message}\`;
            }
            setCheckStatus(checkId, "success", message);
        } else {
            const message = result.message || "Check failed";
            setCheckStatus(checkId, "error", \`✗ \${message}\`);
        }
    });

    async function runChecks() {
        if (isRunning) return;
        isRunning = true;
        retryChecksBtn.disabled = true;
        retryChecksBtn.textContent = "Running Checks...";

        try {
            // Configuration checks
            setCheckStatus("check-user-settings", "loading", "Checking user settings...");
            modalBridge.send(CONFIG.channels.runCheck, { checkType: "user-settings" });
            await new Promise(resolve => setTimeout(resolve, 400));

            setCheckStatus("check-tool-settings", "loading", "Checking tool settings...");
            modalBridge.send(CONFIG.channels.runCheck, { checkType: "tool-settings" });
            await new Promise(resolve => setTimeout(resolve, 400));

            setCheckStatus("check-connections", "loading", "Checking connections storage...");
            modalBridge.send(CONFIG.channels.runCheck, { checkType: "connections" });
            await new Promise(resolve => setTimeout(resolve, 400));

            setCheckStatus("check-sentry", "loading", "Checking Sentry logging...");
            modalBridge.send(CONFIG.channels.runCheck, { checkType: "sentry" });
            await new Promise(resolve => setTimeout(resolve, 400));

            // Connectivity checks
            setCheckStatus("check-supabase", "loading", "Checking Supabase API...");
            modalBridge.send(CONFIG.channels.runCheck, { checkType: "supabase" });
            await new Promise(resolve => setTimeout(resolve, 500));

            setCheckStatus("check-registry", "loading", "Checking local registry...");
            modalBridge.send(CONFIG.channels.runCheck, { checkType: "registry" });
            await new Promise(resolve => setTimeout(resolve, 500));

            setCheckStatus("check-download", "loading", "Testing tool download from GitHub...");
            modalBridge.send(CONFIG.channels.runCheck, { checkType: "download" });
            await new Promise(resolve => setTimeout(resolve, 500));

            // Fallback API check (last)
            setCheckStatus("check-fallback", "loading", "Checking fallback API...");
            modalBridge.send(CONFIG.channels.runCheck, { checkType: "fallback" });

        } finally {
            // Re-enable button after a delay to allow all checks to complete
            setTimeout(() => {
                isRunning = false;
                retryChecksBtn.disabled = false;
                retryChecksBtn.textContent = "Retry Checks";
            }, 3000);
        }
    }

    closeModalBtn?.addEventListener("click", () => modalBridge.close());
    closeBtnFooter?.addEventListener("click", () => modalBridge.close());
    retryChecksBtn?.addEventListener("click", () => runChecks());
})();
</script>`;
}
