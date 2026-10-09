/// <reference types="jest" />

import { createHash } from "crypto";
import * as fs from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { NormalizedWorkerDeclaration } from "../../../../src/common/types/tool";
import { DOTNET_NUGET_ORG_SOURCE } from "../../../../src/common/types/dotnetTool";
import {
    DOTNET_LOCAL_NUGET_FEED_ENV,
    DotNetPackageSourceError,
    resolveDotNetLocalFeedPath,
    resolveDotNetPackageSource,
    validateDotNetLocalFeedDirectory,
} from "../../../../src/main/utilities/dotnetLocalFeed";

const declaration: NormalizedWorkerDeclaration = {
    kind: "dotnet-tool",
    packageId: "Contoso.Worker",
    packageVersion: "1.2.3",
    command: "contoso-worker",
    dotnet: { targetFramework: "net8.0", minimumRuntimeVersion: "8.0.0", rollForward: "Major" },
    platforms: ["all"],
};

function captureError(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error("Expected the operation to fail");
}

describe("dotnet local package feed", () => {
    let root: string;
    let feed: string;
    let packagePath: string;

    beforeEach(async () => {
        root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "pptb-dotnet-feed-")));
        feed = join(root, "feed");
        await fs.mkdir(feed);
        packagePath = join(feed, "contoso.worker.1.2.3.nupkg");
        await fs.writeFile(packagePath, "exact pinned package bytes");
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("defaults to nuget.org and rejects any configured local feed in packaged builds", () => {
        expect(resolveDotNetPackageSource(null, declaration, false, false)).toEqual({ kind: "nuget.org", url: DOTNET_NUGET_ORG_SOURCE });
        expect(() => resolveDotNetPackageSource(feed, declaration, true, true)).toThrow(DotNetPackageSourceError);
        expect(() => resolveDotNetPackageSource(feed, declaration, false, false)).toThrow(DotNetPackageSourceError);
        expect(() => resolveDotNetPackageSource("https://example.test/feed", declaration, false, true)).toThrow(DotNetPackageSourceError);
    });

    it("reads only the explicit environment variable and rejects it in packaged builds", () => {
        expect(resolveDotNetLocalFeedPath({}, false, false)).toBeNull();
        expect(resolveDotNetLocalFeedPath({ [DOTNET_LOCAL_NUGET_FEED_ENV]: feed }, false, true)).toBe(feed);
        expect(() => resolveDotNetLocalFeedPath({ [DOTNET_LOCAL_NUGET_FEED_ENV]: feed }, true, true)).toThrow(DotNetPackageSourceError);
        expect(() => resolveDotNetLocalFeedPath({ [DOTNET_LOCAL_NUGET_FEED_ENV]: feed }, false, false)).toThrow(DotNetPackageSourceError);
        expect(() => resolveDotNetLocalFeedPath({ [DOTNET_LOCAL_NUGET_FEED_ENV]: "https://example.test/feed" }, false, true)).toThrow(DotNetPackageSourceError);
    });

    it("requires an absolute canonical directory without symlink components", async () => {
        expect(validateDotNetLocalFeedDirectory(feed)).toBe(feed);
        expect(() => validateDotNetLocalFeedDirectory("relative/feed")).toThrow(DotNetPackageSourceError);

        const alias = join(root, "feed-link");
        await fs.symlink(feed, alias);
        expect(() => validateDotNetLocalFeedDirectory(alias)).toThrow(DotNetPackageSourceError);
    });

    it("rejects hierarchical child directories so nested packages cannot shadow the flat feed", async () => {
        await fs.mkdir(join(feed, "Contoso.Worker", "1.2.3"), { recursive: true });
        expect(() => validateDotNetLocalFeedDirectory(feed)).toThrow(DotNetPackageSourceError);
    });

    it("resolves only the pinned package and binds its exact SHA-512 bytes", () => {
        const source = resolveDotNetPackageSource(feed, declaration, false, true);
        expect(source).toEqual({
            kind: "local-feed",
            path: feed,
            packageSha512: createHash("sha512").update("exact pinned package bytes").digest("base64"),
        });
    });

    it("rejects a missing or linked package and changes identity when package bytes change", async () => {
        const source = resolveDotNetPackageSource(feed, declaration, false, true);
        await fs.writeFile(packagePath, "replacement package bytes");
        expect(resolveDotNetPackageSource(feed, declaration, false, true)).not.toEqual(source);

        await fs.unlink(packagePath);
        expect(captureError(() => resolveDotNetPackageSource(feed, declaration, false, true))).toMatchObject({ code: "PACKAGE_MISSING" });

        const outside = join(root, "outside.nupkg");
        await fs.writeFile(outside, "package bytes");
        await fs.symlink(outside, packagePath);
        expect(captureError(() => resolveDotNetPackageSource(feed, declaration, false, true))).toMatchObject({ code: "FEED_DIRECTORY_INVALID" });
    });
});
