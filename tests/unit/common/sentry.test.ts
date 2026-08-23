/// <reference types="jest" />

import { getSentryEnvironment } from "../../../src/common/sentry";

describe("getSentryEnvironment", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalChannel = process.env.PPTB_CHANNEL;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.PPTB_CHANNEL = originalChannel;
    });

    it("uses development for packaged insider builds", () => {
        process.env.PPTB_CHANNEL = "insider";

        expect(getSentryEnvironment(true)).toBe("development");
    });

    it("uses local for unpackaged runs, including the insider channel", () => {
        process.env.PPTB_CHANNEL = "insider";

        expect(getSentryEnvironment(false)).toBe("local");
    });

    it("uses local for renderer development runs", () => {
        process.env.NODE_ENV = "development";
        process.env.PPTB_CHANNEL = "stable";

        expect(getSentryEnvironment()).toBe("local");
    });

    it("uses production for packaged stable builds", () => {
        process.env.PPTB_CHANNEL = "stable";

        expect(getSentryEnvironment(true)).toBe("production");
    });
});
