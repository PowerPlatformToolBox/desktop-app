/// <reference types="jest" />

import { getSentryConsentModalControllerScript } from "../../../src/renderer/modals/sentryConsent/controller";
import { getSentryConsentModalView } from "../../../src/renderer/modals/sentryConsent/view";

describe("sentry consent modal view", () => {
    it("lists the data categories captured when consent is granted", () => {
        const { body } = getSentryConsentModalView({
            isDarkTheme: false,
            appVersion: "1.2.3",
            platform: "win32",
            arch: "x64",
        });

        expect(body).toContain("Install ID");
        expect(body).toContain("Installed version");
        expect(body).toContain("Operating system");
        expect(body).toContain("CPU architecture");
        expect(body).toContain("Warnings and errors only (no user data)");
    });
});

describe("sentry consent modal controller", () => {
    it("wires yes and no buttons to modal bridge channels", () => {
        const script = getSentryConsentModalControllerScript({
            acceptConsent: "sentry-consent:accept",
            declineConsent: "sentry-consent:decline",
        });

        expect(script).toContain('document.getElementById("sentry-consent-yes-btn")');
        expect(script).toContain('modalBridge.send(CHANNELS.acceptConsent, { consent: "yes" });');
        expect(script).toContain('document.getElementById("sentry-consent-no-btn")');
        expect(script).toContain('modalBridge.send(CHANNELS.declineConsent, { consent: "no" });');
    });
});
