import { validatePackageJson, type ToolPackageJson } from "../../../packages/validation/src/validate";

const mirroredValidator = require("../../../packages/lib/validate.js") as {
    validatePackageJson: (packageJson: ToolPackageJson, options: { skipUrlChecks: boolean }) => Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
};

const validPackage = (features: ToolPackageJson["features"]): ToolPackageJson => ({
    name: "test-tool",
    version: "1.0.0",
    displayName: "Test Tool",
    description: "Validation test tool",
    license: "MIT",
    contributors: [{ name: "Test Author" }],
    configurations: {
        repository: "https://github.com/example/test-tool",
        readmeUrl: "https://raw.githubusercontent.com/example/test-tool/main/README.md",
    },
    features,
});

describe("package.json features.connections validation", () => {
    it.each([0, 1, 2, 10])("accepts numeric connection count %i", async (connections) => {
        const result = await validatePackageJson(validPackage({ connections }), { skipUrlChecks: true });
        expect(result.valid).toBe(true);
    });

    it.each([[{ min: 0, max: 1 }], [{ min: 1, max: 5 }], [{ min: 3, max: 5 }], [{ max: 5 }], [{ min: 2 }], [{}]])("accepts connection range %p", async (connections) => {
        const result = await validatePackageJson(validPackage({ connections }), { skipUrlChecks: true });
        expect(result.valid).toBe(true);
    });

    it.each([
        [1.5, "features.connections must be an integer between 0 and 10"],
        [-1, "features.connections must be an integer between 0 and 10"],
        [11, "features.connections must be an integer between 0 and 10"],
        [{ min: 3, max: 2 }, "features.connections.min must be less than or equal to features.connections.max"],
        [{ max: 11 }, "features.connections.max must be an integer between 0 and 10"],
        [{ min: -1 }, "features.connections.min must be an integer between 0 and 10"],
        [{ maxx: 2 }, "features.connections can only contain 'min' and 'max' properties. Invalid properties: maxx"],
        [null, "features.connections must be an integer or an object with optional 'min' and 'max' properties"],
    ])("rejects invalid connections value %p", async (connections, expectedError) => {
        const result = await validatePackageJson(validPackage({ connections } as ToolPackageJson["features"]), { skipUrlChecks: true });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(expectedError);
    });

    it("does not require multiConnection when connections is provided", async () => {
        const result = await validatePackageJson(validPackage({ connections: { min: 1, max: 5 }, minAPI: "1.0.0" }), { skipUrlChecks: true });
        expect(result.errors).not.toContain("features.multiConnection is required when features object is provided without features.connections");
    });

    it.each([[{ connections: 2, multiConnection: "optional" }], [{ connections: 1, connectionRequirement: "required" }]])(
        "rejects modern and legacy connection fields together: %p",
        async (features) => {
            const result = await validatePackageJson(validPackage(features as ToolPackageJson["features"]), { skipUrlChecks: true });
            expect(result.errors).toContain("features.connections cannot be combined with legacy features.multiConnection or features.connectionRequirement; remove the legacy fields");
        },
    );

    it("keeps legacy manifests valid and reports a deprecation warning", async () => {
        const result = await validatePackageJson(validPackage({ multiConnection: "optional", connectionRequirement: "required" }), { skipUrlChecks: true });
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain("Legacy connection feature fields (features.multiConnection, features.connectionRequirement) are deprecated; use features.connections instead");
    });

    it("keeps the JavaScript validator mirror in sync", async () => {
        const modernPackage = validPackage({ connections: { min: 1, max: 5 } });
        const legacyPackage = validPackage({ multiConnection: "optional" });
        const invalidPackage = validPackage({ connections: 5, multiConnection: "optional" });

        await expect(mirroredValidator.validatePackageJson(modernPackage, { skipUrlChecks: true })).resolves.toMatchObject({ valid: true });
        await expect(mirroredValidator.validatePackageJson(legacyPackage, { skipUrlChecks: true })).resolves.toMatchObject({
            valid: true,
            warnings: expect.arrayContaining([expect.stringContaining("deprecated")]),
        });
        await expect(mirroredValidator.validatePackageJson(invalidPackage, { skipUrlChecks: true })).resolves.toMatchObject({
            valid: false,
            errors: expect.arrayContaining([expect.stringContaining("cannot be combined")]),
        });
    });
});
