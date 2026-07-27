/// <reference types="jest" />

import { InstallIdManager } from "../../../../src/main/managers/installIdManager";
import { SettingsManager } from "../../../../src/main/managers/settingsManager";

describe("InstallIdManager", () => {
    let settingsManager: SettingsManager;
    let manager: InstallIdManager;

    beforeEach(() => {
        settingsManager = new SettingsManager();
        manager = new InstallIdManager(settingsManager);
    });

    it("generates a UUID on first call", () => {
        const id = manager.getInstallId();
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("returns the same ID on subsequent calls (in-memory cache)", () => {
        const first = manager.getInstallId();
        const second = manager.getInstallId();
        expect(second).toBe(first);
    });

    it("persists the ID to settings", () => {
        const id = manager.getInstallId();
        expect(settingsManager.getSetting("installId")).toBe(id);
    });

    it("reuses an existing ID from settings", () => {
        const existingId = "11111111-2222-3333-4444-555555555555";
        // Pre-seed the settings store so the manager picks it up
        settingsManager.setSetting("installId", existingId);

        const freshManager = new InstallIdManager(settingsManager);
        expect(freshManager.getInstallId()).toBe(existingId);
    });

    it("migrates a legacy machineId to installId", () => {
        const legacyId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        settingsManager.setSetting("machineId", legacyId);

        const freshManager = new InstallIdManager(settingsManager);
        expect(freshManager.getInstallId()).toBe(legacyId);
        // Verify it was promoted to installId
        expect(settingsManager.getSetting("installId")).toBe(legacyId);
    });
});
