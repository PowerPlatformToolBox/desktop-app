import type { ToolPackageFeatures } from "../../../packages/types/toolManifest";

const packageFeatureExamples: ToolPackageFeatures[] = [
    { connections: 0 },
    { connections: 1 },
    { connections: { min: 1, max: 5 } },
    { connections: { max: 5 } },
    { connections: 1, connectionTypes: ["financeOperations"] },
    { connections: 2, connectionTypes: ["dataverse", "financeOperations"] },
    { connections: { slots: [{ label: "Accounts" }, { label: "Customers", connectionTypes: ["financeOperations"], required: false }] } },
    { multiConnection: "optional", connectionRequirement: "required" },
    { minAPI: "1.0.0", enabledForPowerPlatformAPI: true },
];

describe("published tool package feature types", () => {
    it("exports the package.json features contract from @pptb/types/toolManifest", () => {
        expect(packageFeatureExamples).toHaveLength(9);
    });
});
