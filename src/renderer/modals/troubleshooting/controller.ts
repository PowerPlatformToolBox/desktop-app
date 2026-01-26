export interface TroubleshootingModalChannelIds {
    runChecks: string;
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
        setCheckStatus("check-supabase", "pending", "Ready to check");
        setCheckStatus("check-registry", "pending", "Ready to check");
        setCheckStatus("check-fallback", "pending", "Ready to check");
    }

    async function runChecks() {
        if (isRunning) return;
        isRunning = true;
        retryChecksBtn.disabled = true;
        retryChecksBtn.textContent = "Running Checks...";

        try {
            // Check Supabase connectivity
            setCheckStatus("check-supabase", "loading", "Checking Supabase API...");
            try {
                const supabaseResult = await window.toolboxAPI.checkSupabaseConnectivity();
                if (supabaseResult.success) {
                    setCheckStatus("check-supabase", "success", "✓ Connected to Supabase successfully");
                } else {
                    setCheckStatus("check-supabase", "error", "✗ " + (supabaseResult.message || "Failed to connect to Supabase"));
                }
            } catch (error) {
                setCheckStatus("check-supabase", "error", "✗ Error checking Supabase: " + error.message);
            }

            // Small delay between checks for better UX
            await new Promise(resolve => setTimeout(resolve, 300));

            // Check registry file
            setCheckStatus("check-registry", "loading", "Checking local registry file...");
            try {
                const registryResult = await window.toolboxAPI.checkRegistryFile();
                if (registryResult.success) {
                    setCheckStatus("check-registry", "success", "✓ Registry file loaded with " + registryResult.toolCount + " tools");
                } else {
                    setCheckStatus("check-registry", "error", "✗ " + (registryResult.message || "Registry file not found or invalid"));
                }
            } catch (error) {
                setCheckStatus("check-registry", "error", "✗ Error checking registry: " + error.message);
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            // Check fallback API (placeholder for future implementation)
            setCheckStatus("check-fallback", "loading", "Checking fallback API...");
            try {
                const fallbackResult = await window.toolboxAPI.checkFallbackApi();
                if (fallbackResult.success) {
                    setCheckStatus("check-fallback", "success", "✓ " + (fallbackResult.message || "Fallback API is accessible"));
                } else {
                    setCheckStatus("check-fallback", "error", "✗ " + (fallbackResult.message || "Fallback API check failed"));
                }
            } catch (error) {
                setCheckStatus("check-fallback", "error", "✗ Error checking fallback API: " + error.message);
            }

        } finally {
            isRunning = false;
            retryChecksBtn.disabled = false;
            retryChecksBtn.textContent = "Retry Checks";
        }
    }

    closeModalBtn?.addEventListener("click", () => modalBridge.close());
    closeBtnFooter?.addEventListener("click", () => modalBridge.close());
    retryChecksBtn?.addEventListener("click", () => runChecks());
})();
</script>`;
}
