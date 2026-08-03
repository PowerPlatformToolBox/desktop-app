/// <reference types="jest" />

import { MarketplaceSource } from "../../../../src/common/types";
import { SettingsManager } from "../../../../src/main/managers/settingsManager";

// electron-store is replaced by the manual mock at tests/__mocks__/electron-store.ts

describe("SettingsManager", () => {
    let manager: SettingsManager;

    beforeEach(() => {
        manager = new SettingsManager();
    });

    // -----------------------------------------------------------------------
    // Default settings
    // -----------------------------------------------------------------------
    describe("default settings", () => {
        it("returns defaults on first access", () => {
            const settings = manager.getUserSettings();
            expect(settings.theme).toBe("system");
            expect(settings.autoUpdate).toBe(true);
            expect(settings.installedTools).toEqual([]);
            expect(settings.favoriteTools).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // updateUserSettings / getSetting / setSetting
    // -----------------------------------------------------------------------
    describe("updateUserSettings", () => {
        it("persists theme change", () => {
            manager.updateUserSettings({ theme: "dark" });
            expect(manager.getSetting("theme")).toBe("dark");
        });

        it("persists multiple settings at once", () => {
            manager.updateUserSettings({ theme: "light", autoUpdate: false });
            expect(manager.getSetting("theme")).toBe("light");
            expect(manager.getSetting("autoUpdate")).toBe(false);
        });
    });

    describe("setSetting / getSetting", () => {
        it("round-trips a setting value", () => {
            manager.setSetting("notificationDuration", 3000);
            expect(manager.getSetting("notificationDuration")).toBe(3000);
        });
    });

    describe("marketplace sources", () => {
        it("includes a built-in marketplace source by default", () => {
            const sources = manager.getMarketplaceSources();
            expect(sources).toEqual(expect.arrayContaining([expect.objectContaining({ id: "builtin-pptb", type: "builtin", enabled: true })]));
        });

        it("keeps the built-in marketplace enabled when no private source exists", () => {
            manager.setBuiltinMarketplaceEnabled(false);
            expect(manager.getMarketplaceSources().find((source) => source.id === "builtin-pptb")?.enabled).toBe(true);
        });

        it("allows disabling the built-in marketplace when a private source exists", () => {
            const privateSource: MarketplaceSource = {
                id: "contoso-private",
                type: "private",
                label: "Contoso private marketplace",
                url: "https://example.contoso.test/registry.json",
                enabled: true,
            };

            manager.addMarketplaceSource(privateSource);
            manager.setBuiltinMarketplaceEnabled(false);

            expect(manager.getMarketplaceSources().find((source) => source.id === "builtin-pptb")?.enabled).toBe(false);
        });

        it("keeps the built-in marketplace enabled when no private source is available", () => {
            const sources: MarketplaceSource[] = [
                {
                    id: "builtin-pptb",
                    type: "builtin",
                    label: "Power Platform ToolBox marketplace",
                    url: "https://example.test/registry.json",
                    enabled: false,
                },
            ];

            manager.updateUserSettings({ marketplaceSources: sources });

            expect(manager.getMarketplaceSources().find((source) => source.id === "builtin-pptb")?.enabled).toBe(true);
        });

        it("allows the built-in marketplace to stay disabled when a private source is enabled", () => {
            const sources: MarketplaceSource[] = [
                {
                    id: "builtin-pptb",
                    type: "builtin",
                    label: "Power Platform ToolBox marketplace",
                    url: "https://example.test/registry.json",
                    enabled: false,
                },
                {
                    id: "contoso-private",
                    type: "private",
                    label: "Contoso private marketplace",
                    url: "https://example.contoso.test/registry.json",
                    enabled: true,
                },
            ];

            manager.updateUserSettings({ marketplaceSources: sources });

            expect(manager.getMarketplaceSources().find((source) => source.id === "builtin-pptb")?.enabled).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Favorite tools
    // -----------------------------------------------------------------------
    describe("favorite tools", () => {
        it("adds and retrieves a favorite tool", () => {
            manager.addFavoriteTool("tool-a");
            expect(manager.getFavoriteTools()).toContain("tool-a");
        });

        it("does not duplicate favorite tools", () => {
            manager.addFavoriteTool("tool-a");
            manager.addFavoriteTool("tool-a");
            expect(manager.getFavoriteTools().filter((t) => t === "tool-a")).toHaveLength(1);
        });

        it("removes a favorite tool", () => {
            manager.addFavoriteTool("tool-a");
            manager.removeFavoriteTool("tool-a");
            expect(manager.getFavoriteTools()).not.toContain("tool-a");
        });

        it("isFavoriteTool returns correct boolean", () => {
            expect(manager.isFavoriteTool("tool-x")).toBe(false);
            manager.addFavoriteTool("tool-x");
            expect(manager.isFavoriteTool("tool-x")).toBe(true);
        });

        it("toggleFavoriteTool adds then removes", () => {
            expect(manager.toggleFavoriteTool("tool-toggle")).toBe(true);
            expect(manager.isFavoriteTool("tool-toggle")).toBe(true);
            expect(manager.toggleFavoriteTool("tool-toggle")).toBe(false);
            expect(manager.isFavoriteTool("tool-toggle")).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Installed tools
    // -----------------------------------------------------------------------
    describe("installed tools", () => {
        it("adds and retrieves installed tools", () => {
            manager.addInstalledTool("@pptb/my-tool");
            expect(manager.getInstalledTools()).toContain("@pptb/my-tool");
        });

        it("does not duplicate installed tools", () => {
            manager.addInstalledTool("@pptb/my-tool");
            manager.addInstalledTool("@pptb/my-tool");
            expect(manager.getInstalledTools().filter((t) => t === "@pptb/my-tool")).toHaveLength(1);
        });

        it("removes an installed tool", () => {
            manager.addInstalledTool("@pptb/my-tool");
            manager.removeInstalledTool("@pptb/my-tool");
            expect(manager.getInstalledTools()).not.toContain("@pptb/my-tool");
        });
    });

    // -----------------------------------------------------------------------
    // CSP consents
    // -----------------------------------------------------------------------
    describe("CSP consents", () => {
        it("hasCspConsent returns false for unknown tool", () => {
            expect(manager.hasCspConsent("unknown-tool")).toBe(false);
        });

        it("grantCspConsent sets consent and hasCspConsent returns true", () => {
            manager.grantCspConsent("tool-a", ["api.example.com"], ["cdn.example.com"]);
            expect(manager.hasCspConsent("tool-a")).toBe(true);
        });

        it("getApprovedRequiredDomains returns granted required domains", () => {
            manager.grantCspConsent("tool-a", ["api.example.com"]);
            expect(manager.getApprovedRequiredDomains("tool-a")).toEqual(["api.example.com"]);
        });

        it("getApprovedOptionalDomains returns granted optional domains", () => {
            manager.grantCspConsent("tool-a", [], ["cdn.example.com"]);
            expect(manager.getApprovedOptionalDomains("tool-a")).toEqual(["cdn.example.com"]);
        });

        it("revokeCspConsent removes consent", () => {
            manager.grantCspConsent("tool-a");
            manager.revokeCspConsent("tool-a");
            expect(manager.hasCspConsent("tool-a")).toBe(false);
        });

        it("grantCspConsent stores seenOptional domains", () => {
            manager.grantCspConsent("tool-a", ["api.example.com"], ["cdn.example.com"], ["cdn.example.com", "analytics.example.com"]);
            const consents = manager.getCspConsents();
            expect(consents["tool-a"].seenOptional).toEqual(["cdn.example.com", "analytics.example.com"]);
        });

        it("grantCspConsent defaults seenOptional to empty array when omitted", () => {
            manager.grantCspConsent("tool-a", ["api.example.com"], ["cdn.example.com"]);
            const consents = manager.getCspConsents();
            expect(consents["tool-a"].seenOptional).toEqual([]);
        });

        it("getCspConsents includes seenOptional in returned record", () => {
            manager.grantCspConsent("tool-b", [], ["opt1.com"], ["opt1.com", "opt2.com"]);
            const consents = manager.getCspConsents();
            expect(consents["tool-b"]).toMatchObject({
                allowed: true,
                required: [],
                optional: ["opt1.com"],
                seenOptional: ["opt1.com", "opt2.com"],
            });
        });

        it("grantCspConsent overwrites stale removed domains when a tool update syncs the consent record", () => {
            manager.grantCspConsent(
                "tool-c",
                ["api.example.com", "legacy-required.example.com"],
                ["cdn.example.com", "legacy-optional.example.com"],
                ["cdn.example.com", "legacy-optional.example.com"],
            );

            manager.grantCspConsent("tool-c", ["api.example.com"], ["cdn.example.com"], ["cdn.example.com"]);

            expect(manager.getCspConsents()["tool-c"]).toEqual({
                allowed: true,
                required: ["api.example.com"],
                optional: ["cdn.example.com"],
                seenOptional: ["cdn.example.com"],
            });
        });
    });

    // -----------------------------------------------------------------------
    // Tool connections
    // -----------------------------------------------------------------------
    describe("tool connections", () => {
        it("sets and retrieves a tool connection", () => {
            manager.setToolConnection("tool-a", "conn-1");
            expect(manager.getToolConnection("tool-a")).toBe("conn-1");
        });

        it("returns null for unknown tool connection", () => {
            expect(manager.getToolConnection("tool-unknown")).toBeNull();
        });

        it("removes a tool connection", () => {
            manager.setToolConnection("tool-a", "conn-1");
            manager.removeToolConnection("tool-a");
            expect(manager.getToolConnection("tool-a")).toBeNull();
        });

        it("getAllToolConnections returns all mappings", () => {
            manager.setToolConnection("tool-a", "conn-1");
            manager.setToolConnection("tool-b", "conn-2");
            const all = manager.getAllToolConnections();
            expect(all["tool-a"]).toBe("conn-1");
            expect(all["tool-b"]).toBe("conn-2");
        });
    });

    // -----------------------------------------------------------------------
    // Secondary tool connections
    // -----------------------------------------------------------------------
    describe("secondary tool connections", () => {
        it("sets and retrieves a secondary connection", () => {
            manager.setToolSecondaryConnection("tool-a", "conn-sec-1");
            expect(manager.getToolSecondaryConnection("tool-a")).toBe("conn-sec-1");
        });

        it("returns null for missing secondary connection", () => {
            expect(manager.getToolSecondaryConnection("tool-unknown")).toBeNull();
        });

        it("removes a secondary connection", () => {
            manager.setToolSecondaryConnection("tool-a", "conn-sec-1");
            manager.removeToolSecondaryConnection("tool-a");
            expect(manager.getToolSecondaryConnection("tool-a")).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Last used tools
    // -----------------------------------------------------------------------
    describe("last used tools", () => {
        it("starts empty", () => {
            expect(manager.getLastUsedTools()).toEqual([]);
        });

        it("addLastUsedTool appends an entry", () => {
            manager.addLastUsedTool({ toolId: "tool-a" });
            const entries = manager.getLastUsedTools();
            expect(entries).toHaveLength(1);
            expect(entries[0].toolId).toBe("tool-a");
        });

        it("deduplicates entries with same toolId and connections", () => {
            manager.addLastUsedTool({ toolId: "tool-a" });
            manager.addLastUsedTool({ toolId: "tool-a" });
            expect(manager.getLastUsedTools()).toHaveLength(1);
        });

        it("clearLastUsedTools empties the list", () => {
            manager.addLastUsedTool({ toolId: "tool-a" });
            manager.clearLastUsedTools();
            expect(manager.getLastUsedTools()).toEqual([]);
        });

        it("ignores entries without toolId", () => {
            // @ts-expect-error — intentionally testing bad input
            manager.addLastUsedTool({ toolId: undefined });
            expect(manager.getLastUsedTools()).toHaveLength(0);
        });
    });
});
