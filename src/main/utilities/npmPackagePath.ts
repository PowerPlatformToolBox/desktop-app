/**
 * Resolve the directory name used for an npm package installed in node_modules.
 *
 * The package name may include a version or dist-tag suffix, but scoped package
 * names already contain an `@` at the beginning and must keep their scope.
 */
export function resolveNpmPackageDirectoryName(packageName: string): string {
    if (packageName.startsWith("@")) {
        const versionAtIndex = packageName.indexOf("@", 1);
        return versionAtIndex === -1 ? packageName : packageName.slice(0, versionAtIndex);
    }

    const versionAtIndex = packageName.indexOf("@");
    return versionAtIndex === -1 ? packageName : packageName.slice(0, versionAtIndex);
}
