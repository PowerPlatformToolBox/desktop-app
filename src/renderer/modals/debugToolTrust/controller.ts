export interface DebugToolTrustModalChannelIds {
    trust: string;
    cancel: string;
}

/**
 * Returns the controller script that wires up DOM events for the debug-tool trust prompt.
 * Focus defaults to Cancel so an inattentive Enter press never grants trust.
 */
export function getDebugToolTrustModalControllerScript(channels: DebugToolTrustModalChannelIds): string {
    const serializedChannels = JSON.stringify(channels);
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        return;
    }

    const acceptButton = document.getElementById("debug-trust-accept-btn");
    const cancelButton = document.getElementById("debug-trust-cancel-btn");
    const closeButton = document.getElementById("debug-trust-close-btn");

    acceptButton?.addEventListener('click', () => {
        modalBridge.send(CHANNELS.trust, {});
    });

    const cancel = () => modalBridge.send(CHANNELS.cancel, {});
    cancelButton?.addEventListener('click', cancel);
    closeButton?.addEventListener('click', cancel);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            cancel();
        }
    });

    cancelButton?.focus();
})();
</script>`;
}
