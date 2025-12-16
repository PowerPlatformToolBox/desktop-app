export interface CspExceptionModalChannelIds {
    acceptConsent: string;
    declineConsent: string;
}

export interface CspExceptionData {
    toolName: string;
    authors: string[];
    cspExceptions: {
        [directive: string]: string[];
    };
}

/**
 * Returns the controller script that wires up DOM events for the CSP exception modal.
 */
export function getCspExceptionModalControllerScript(channels: CspExceptionModalChannelIds): string {
    const serializedChannels = JSON.stringify(channels);
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        console.warn("modalBridge API is unavailable");
        return;
    }

    const acceptButton = document.getElementById("csp-accept-btn");
    const declineButton = document.getElementById("csp-decline-btn");

    // Handle accept button
    acceptButton?.addEventListener('click', () => {
        modalBridge.send(CHANNELS.acceptConsent, {});
    });

    // Handle decline button
    declineButton?.addEventListener('click', () => {
        modalBridge.send(CHANNELS.declineConsent, {});
    });
})();
</script>`;
}
