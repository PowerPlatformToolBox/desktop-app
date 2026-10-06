import type { ToolPackageFeatures } from "../../../packages/types";

const packageFeatureExamples: ToolPackageFeatures[] = [
    { connections: 0 },
    { connections: 1 },
    { connections: { min: 1, max: 5 } },
    { connections: { max: 5 } },
    { multiConnection: "optional", connectionRequirement: "required" },
    { minAPI: "1.0.0", enabledForPowerPlatformAPI: true },
];

describe("published tool package feature types", () => {
    it("exports the package.json features contract from @pptb/types", () => {
        expect(packageFeatureExamples).toHaveLength(6);
    });
});
