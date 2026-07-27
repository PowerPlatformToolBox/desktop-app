// Node-only helpers — npm registry + tarball inspection.
// Not imported by validate.ts so web consumers that only need validation
// don't pull in Node-specific modules.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as tar from "tar";
import { ToolPackageJson } from "./validate";

// export interface NpmPackageInfo {
//     name: string;
//     version: string;
//     description?: string;
//     license?: string;
//     displayName?: string;
// }

interface NpmRegistryVersionData {
    name: string;
    version: string;
    description?: string;
    license?: string;
    displayName?: string;
    dist: { tarball: string };
}

export async function fetchNpmPackageMetadata(
    packageName: string,
): Promise<{ success: true; data: { packageInfo: ToolPackageJson; versionData: NpmRegistryVersionData; latestVersion: string; tarballUrl: string } } | { success: false; error: string }> {
    try {
        const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, { headers: { Accept: "application/json" } });
        if (!response.ok) {
            return response.status === 404 ? { success: false, error: `Package "${packageName}" not found on npm` } : { success: false, error: `Failed to fetch package: HTTP ${response.status}` };
        }
        const packageData: any = await response.json();
        const latestVersion = packageData["dist-tags"]?.latest;
        if (!latestVersion) {
            return { success: false, error: `Package "${packageName}" has no latest version` };
        }
        const versionData = packageData.versions?.[latestVersion];
        if (!versionData) {
            return { success: false, error: `Could not find version data for ${latestVersion}` };
        }
        const tarballUrl = versionData.dist?.tarball;
        if (!tarballUrl) {
            return { success: false, error: "Could not find tarball URL" };
        }
        const packageInfo: ToolPackageJson = {
            name: versionData.name,
            version: versionData.version,
            description: versionData.description,
            license: versionData.license,
            displayName: versionData.displayName,
            contributors: versionData.contributors,
            cspExceptions: versionData.cspExceptions,
            configurations: versionData.configurations,
            features: versionData.features,
            icon: versionData.icon,
        };
        return { success: true, data: { packageInfo, versionData, latestVersion, tarballUrl } };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error fetching package metadata",
        };
    }
}

export interface PackageStructureCheck {
    hasNpmShrinkwrap: boolean;
    hasDistFolder: boolean;
    hasDistIndexHtml: boolean;
}

export async function validatePackageStructure(packageName: string): Promise<{ success: true; data: PackageStructureCheck } | { success: false; error: string }> {
    const metadataResult = await fetchNpmPackageMetadata(packageName);
    if (!metadataResult.success) return metadataResult;

    const tarballResponse = await fetch(metadataResult.data.tarballUrl);
    if (!tarballResponse.ok) {
        return { success: false, error: `Failed to download tarball: HTTP ${tarballResponse.status}` };
    }

    const tarballBuffer = await tarballResponse.arrayBuffer();
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pptb-validate-"));

    try {
        const tarballPath = path.join(tmpDir, "package.tgz");
        await fs.promises.writeFile(tarballPath, Buffer.from(tarballBuffer));
        const extractDir = path.join(tmpDir, "extracted");
        await fs.promises.mkdir(extractDir, { recursive: true });
        await tar.x({ file: tarballPath, cwd: extractDir });

        const packageDir = path.join(extractDir, "package");

        const check = async (p: string, isDir = false): Promise<boolean> => {
            try {
                const stat = await fs.promises.stat(p);
                return isDir ? stat.isDirectory() : stat.isFile();
            } catch {
                return false;
            }
        };

        const hasDistFolder = await check(path.join(packageDir, "dist"), true);

        return {
            success: true,
            data: {
                hasNpmShrinkwrap: await check(path.join(packageDir, "npm-shrinkwrap.json")),
                hasDistFolder,
                hasDistIndexHtml: hasDistFolder ? await check(path.join(packageDir, "dist", "index.html")) : false,
            },
        };
    } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
}
