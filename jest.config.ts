import type { Config } from "jest";

const config: Config = {
    // Test environment
    testEnvironment: "node",

    // TypeScript transformation via ts-jest
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                tsconfig: "tsconfig.test.json",
                diagnostics: {
                    // Only report errors, not warnings, to keep output clean
                    warnOnly: false,
                    ignoreCodes: ["TS151001"],
                },
            },
        ],
    },

    // Test file discovery
    testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],

    // Module name mapper — redirect Electron and electron-store to manual mocks
    moduleNameMapper: {
        "^electron$": "<rootDir>/tests/__mocks__/electron.ts",
        "^electron-store$": "<rootDir>/tests/__mocks__/electron-store.ts",
    },

    // Coverage configuration
    collectCoverageFrom: ["src/main/managers/**/*.ts", "src/common/**/*.ts", "src/renderer/utils/**/*.ts"],

    coverageDirectory: "coverage",

    coverageReporters: ["text", "lcov"],

    // Ignore paths
    testPathIgnorePatterns: ["/node_modules/", "/dist/", "/build/"],

    // Verbose output for CI readability
    verbose: true,
};

export default config;
