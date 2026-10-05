import type { Config } from "jest";
import baseConfig from "../jest.config";

process.env.PPTB_DOTNET_PROBE = "1";

const config: Config = {
    ...baseConfig,
    rootDir: "..",
    testMatch: ["<rootDir>/tests/unit/compatibility/dotnetWorker.test.ts"],
    maxWorkers: 1,
};

export default config;
