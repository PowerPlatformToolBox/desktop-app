import type { CspExceptionSource } from "../../../common/types";

export interface CspExceptionModalChannelIds {
    acceptConsent: string;
    declineConsent: string;
    grantAllConsent: string;
    revokeAllConsent: string;
}

export interface CspExceptionData {
    toolName: string;
    authors: string[];
    cspExceptions: {
        [directive: string]: CspExceptionSource[];
    };
}

/**
 * Returns the controller script that wires up DOM events for the CSP exception modal.
 */
export function getCspExceptionModalControllerScript(channels: CspExceptionModalChannelIds, mode: "consent" | "manage" = "consent"): string {
    const serializedChannels = JSON.stringify(channels);
    const serializedMode = JSON.stringify(mode);
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const MODE = ${serializedMode};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        console.warn("modalBridge API is unavailable");
        return;
    }

    const acceptButton = document.getElementById("csp-accept-btn");
    const declineButton = document.getElementById("csp-decline-btn");
    const cancelButton = document.getElementById("csp-cancel-btn");
    const grantAllButton = document.getElementById("csp-grant-all-btn");
    const revokeAllButton = document.getElementById("csp-revoke-all-btn");

    const getSelectedOptionalDomains = () => {
        const checkboxes = document.querySelectorAll('.csp-optional-checkbox:not([disabled])');
        const approvedOptionalDomains = [];
        checkboxes.forEach((cb) => {
            if (cb.checked) {
                approvedOptionalDomains.push(cb.value);
            }
        });
        return approvedOptionalDomains;
    };

    const getAllOptionalDomains = () => {
        const checkboxes = document.querySelectorAll('.csp-optional-checkbox:not([disabled])');
        const allOptionalDomains = [];
        checkboxes.forEach((cb) => {
            allOptionalDomains.push(cb.value);
        });
        return allOptionalDomains;
    };

    // Handle accept button — collect which optional (non-disabled) domains are checked
    acceptButton?.addEventListener('click', () => {
        const approvedOptionalDomains = getSelectedOptionalDomains();
        modalBridge.send(CHANNELS.acceptConsent, { approvedOptionalDomains });
    });

    // Handle decline button
    declineButton?.addEventListener('click', () => {
        modalBridge.send(CHANNELS.declineConsent, {});
    });

    cancelButton?.addEventListener('click', () => {
        modalBridge.send(CHANNELS.declineConsent, {});
    });

    grantAllButton?.addEventListener('click', () => {
        if (MODE !== 'manage') return;
        modalBridge.send(CHANNELS.grantAllConsent, { approvedOptionalDomains: getAllOptionalDomains() });
    });

    revokeAllButton?.addEventListener('click', () => {
        if (MODE !== 'manage') return;
        modalBridge.send(CHANNELS.revokeAllConsent, { approvedOptionalDomains: [] });
    });
})();
</script>`;
}
