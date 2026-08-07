export interface SentryConsentModalChannelIds {
    acceptConsent: string;
    declineConsent: string;
}

export function getSentryConsentModalControllerScript(channels: SentryConsentModalChannelIds): string {
    const serializedChannels = JSON.stringify(channels);
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        return;
    }

    document.getElementById("sentry-consent-yes-btn")?.addEventListener("click", () => {
        modalBridge.send(CHANNELS.acceptConsent, { consent: "yes" });
    });

    document.getElementById("sentry-consent-no-btn")?.addEventListener("click", () => {
        modalBridge.send(CHANNELS.declineConsent, { consent: "no" });
    });
})();
</script>`;
}
