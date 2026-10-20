/// <reference types="jest" />

import { VersionManager } from "../../../../src/main/managers/versionManager";
import { mergeInstalledToolFeatures } from "../../../../src/main/managers/toolRegistryManager";

describe("connection slot release compatibility", () => {
    // Representative feature release; these checks do not assign a release version.
    const featureRelease = "1.3.0";

    afterEach(() => jest.restoreAllMocks());

    it.each([
        ["1.2.8", false],
        ["1.3.0-beta.1", false],
        ["1.3.0", true],
        ["1.3.1", true],
    ])("checks the declared minimum against app %s", (appVersion, supported) => {
        jest.spyOn(VersionManager, "getToolBoxVersion").mockReturnValue(appVersion);
        expect(VersionManager.isToolSupported(featureRelease)).toBe(supported);
    });

    it("preserves a slot package's newer minimum when catalog metadata is stale", () => {
        jest.spyOn(VersionManager, "getToolBoxVersion").mockReturnValue("1.2.8");
        const features = mergeInstalledToolFeatures(
            { connections: 2, minAPI: "1.2.0" },
            { connections: { slots: [{ label: "Accounts" }, { label: "Customers", connectionTypes: ["financeOperations"] }] }, minAPI: featureRelease },
        );

        expect(features?.minAPI).toBe(featureRelease);
        expect(VersionManager.isToolSupported(features?.minAPI)).toBe(false);
    });

    it("keeps unconstrained and supported legacy count tools compatible", () => {
        jest.spyOn(VersionManager, "getToolBoxVersion").mockReturnValue("1.2.8");
        expect(VersionManager.isToolSupported()).toBe(true);
        expect(VersionManager.isToolSupported("1.2.0")).toBe(true);
    });
});
