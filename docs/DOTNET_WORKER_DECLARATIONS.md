# .NET Worker Declarations (PR1)

PR1 adds declaration validation and installed-tool metadata only. It does not
provide a production worker API, install .NET/NuGet packages, discover runtimes,
launch a process or grant native-execution consent. The terminal `dotnet` block
is unchanged. Runtime/package verification belongs to PR2/PR3; execution remains
disabled until the later security and lifecycle gates pass.

Declare `workers` in the package-root `pptb.config.json`, independently of
`invocation` and `agents`. The entire file and the `workers` section are optional.
If present, `workers` must be a non-empty object.

```json
{
    "workers": {
        "engine": {
            "kind": "dotnet-tool",
            "packageId": "Contoso.SqlWorker",
            "packageVersion": "1.4.2",
            "command": "contoso-sql-worker",
            "dotnet": {
                "targetFramework": "net8.0",
                "minimumRuntimeVersion": "8.0.0",
                "rollForward": "Major"
            },
            "platforms": ["windows-x64", "macos-arm64"]
        }
    }
}
```

| Field                          | Accepted values and limits                                                                                                                                                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declaration ID                 | 1-64 ASCII letters, digits, underscores or hyphens; starts with a letter. `constructor`, `prototype` and `__proto__` are forbidden.                                                                                                                                                                                  |
| `kind`                         | Exactly `dotnet-tool`.                                                                                                                                                                                                                                                                                               |
| `packageId`                    | 1-100 ASCII letters, digits or underscores, with dot/hyphen-separated non-empty segments. No paths or whitespace.                                                                                                                                                                                                    |
| `packageVersion`               | Exact NuGet version: 1-4 numeric components, optional ASCII alphanumeric/hyphen dot-separated prerelease and build labels. Numeric version components are at most 2147483647. Examples: `1`, `1.2`, `1.2.3.4`, `1.2.3-beta.1+build.2`. No tags, floating versions, interval notation or ranges, including `[1.2.3]`. |
| `command`                      | 1-100 ASCII letters, digits, underscores or hyphens, starting with a letter or digit. No dots, executable paths, whitespace or options. PR3 must verify the name against the restored local tool manifest.                                                                                                           |
| `dotnet.targetFramework`       | Explicit console allowlist: `net8.0`, `net9.0`, `net10.0`. Platform-qualified TFMs, .NET Framework, Desktop/ASP.NET shared frameworks and self-contained workers are excluded. This is the executable TFM, not the core DLL's TFM.                                                                                   |
| `dotnet.minimumRuntimeVersion` | Stable `major.minor.patch`, no leading zeroes or suffix; major/minor must match the TFM. Components are at most 2147483647. Binary consistency is a PR3 gate.                                                                                                                                                        |
| `dotnet.rollForward`           | Optional, case-sensitive `Disable`, `Latest`, `Minor`, `Major`. Omission becomes `Major`. Explicit null, empty, undefined or other values are invalid.                                                                                                                                                               |
| `platforms`                    | Required non-empty unique array of `all`, `windows-x64`, `windows-arm64`, `macos-x64`, `macos-arm64`, `linux-x64`, `linux-arm64`. `all` must appear alone. Empty, duplicate, unknown and old `win-*`/`osx-*` RID names are rejected.                                                                                 |

All listed fields except `rollForward` are required. Unknown worker or `dotnet`
fields fail validation. There are no author-controlled feeds, SDK selection,
flags, environment, working directories, executable/DLL paths or download URLs.
The eventual source is platform-controlled nuget.org; PR1 performs no restore.

These platform names are author-facing PPTB aliases, not native .NET RIDs.
Declare only targets the author has tested; accepting an alias does not qualify
that platform. Linux distribution/glibc/native dependency requirements still
need author documentation. `"platforms": ["all"]` means the versioned officially
supported PPTB platform matrix, not every conceivable OS/architecture or every
syntactically accepted alias. Future matrix expansion requires qualification
before enabling existing packages on additional platforms. PR1 retains `all`
literally. PR2 adds the internal matrix-v1 resolver and discovery described below;
neither platform qualification nor worker execution follows from declaration validation.

`transport` is not an author-facing field, even when set to `jsonrpc-stdio-v1`.
Explicit declarations fail strict unknown-key validation; normalized metadata
does not contain it. The protocol remains PPTB-defined `jsonrpc-stdio-v1`
internally, for the future startup handshake, not selectable in author config.
PR0 wire protocol and fixture implementation are unchanged.

Canonical metadata sorts declaration IDs and platform lists, constructs fields
in a fixed order, preserves `["all"]` without expansion, excludes `transport`,
and includes the effective `rollForward`. Omission and explicit
`Major` yield identical metadata without modifying the input config. No consent
fingerprint or runtime resolver is implemented in PR1. See the
[runtime decision](DOTNET_WORKERS_STATUS.md) for all four policies and the native
mapping of `Latest` to `LatestMajor`; a default cannot override stricter binary
requirements.

Worker-bearing packages require a valid `package.json` `features.minAPI`.
`validatePPTBConfig(config, packageJson)` checks this when package context is
supplied; isolated config validation cannot determine package compatibility.
The validator CLI and desktop loaders supply that context. Registry minAPI must
agree with the packaged value when supplied; when absent it is recovered from
the package. Desktop compatibility uses the existing `VersionManager` policy
for all sources. The first worker-capable API release version has not been
assigned and must not be guessed from this metadata-only change.

Registry installs persist canonical workers in the installed manifest. Npm and
local tools gain manifest persistence when workers are declared, then re-read
their source config on loading after restart. Persisted declarations are
revalidated; malformed entries are excluded without hiding unrelated entries.
Missing worker declarations retain legacy behavior. Invalid JSON fails loading
instead of silently discarding a potentially native declaration. Future worker
startup must revalidate local source changes and recompute consent fingerprints.

The validator is authoritative at `packages/validation/src/validate.ts`. Public
author types are exported by `@pptb/types`, and normalized declarations are part
of shared desktop `ToolMetadata`. Package publication/version bumps are deferred
to the coordinated release gate; generated validator output must be rebuilt
before testing or publishing its CLI.

NuGet grammar reference: [NuGet package versioning](https://learn.microsoft.com/nuget/concepts/package-versioning#where-nugetversion-diverges-from-semantic-versioning).

## Internal Discovery (PR2)

`DotNetDiscoveryManager` is not registered in production startup or exposed through
IPC/preload/public APIs. It returns typed data, not an execution permission. PR1
author types and canonical metadata remain unchanged, including literal `all`
and absent transport. PR0 fixtures and the terminal `dotnet` block are untouched.

Matrix v1 resolves the six accepted concrete aliases: `windows-*` to `win-*`,
`macos-*` to `osx-*`, and `linux-*` unchanged, for native x64/arm64 only. `all`
uses this explicit matrix without mutating declarations. Resolution is admission
to discovery, not qualification of a package, binary, distribution or platform;
actual qualification remains PR8. Linux portable glibc SDK RIDs are admitted;
musl and distribution-specific SDK RIDs are conservatively rejected in this slice.

Host candidates are fixed and visited in this order:

- Windows: `C:\Program Files\dotnet\dotnet.exe`, then its `x64` subdirectory.
- macOS: `/usr/local/share/dotnet/dotnet`, then its `x64` subdirectory.
- Linux: `/usr/share/dotnet/dotnet`, `/usr/lib/dotnet/dotnet`,
  `/usr/lib64/dotnet/dotnet`, `/usr/local/share/dotnet/dotnet`.

Only executable regular files whose absolute real paths remain in these candidate
sets are admitted; duplicate real paths are skipped. There is no PATH lookup or
renderer-configurable executable path. No existing main-host-path configuration
abstraction was found. Alternate Windows system drives, user-local/custom SDK
roots and symlinks outside these locations intentionally require a future trusted
main-process configuration design. Folder names are not architecture evidence:
`--info`'s Host architecture must match detected native OS architecture. Windows
uses Node's native machine identity, and Apple CPU identity prevents Rosetta's
x64 machine name from promising emulated x64 support on arm64. These rules still
need actual Windows/macOS/Linux qualification, not just injected tests.

Each candidate permits only `--info`, `--list-sdks`, `--list-runtimes`, as direct
argument arrays with `shell: false`, a 3-second timeout with forced termination,
256 KiB output bounds and an explicit credential-free environment. Diagnostics
use the OS volume root as cwd, not a tool/repository directory. The environment
omits inherited PATH, home, authentication, SDK resolver and startup-hook settings;
it disables telemetry/workload update notification and requests English output.
At most two hosts on Windows/macOS or four on Linux are probed, sequentially.
No stdout/stderr or exception contents are logged or returned. Failures return
sanitized typed codes and bounded candidate attempts. Filesystem failures are
also sanitized; this is not an OS sandbox or a filesystem race guarantee.

Unqualified listings describe the invoked host's architecture; no `--arch` option
is used. Entries outside that host's SDK/shared-framework directories cannot be
combined with it. The ambient SDK version/base path/global.json reported by
`--info` does not select the SDK. Its Host architecture (and SDK RID if present)
is used for native validation, even if an ambient global.json suppresses SDK info.
Strict listing parsers exclude prereleases and reject malformed output.

SDK selection is the highest stable installed `10.0.*` version at least
`10.0.100`, within the selected host. SDK 11 is never silently substituted.
This conservative policy does not try an older SDK within the same host when
the selected SDK is broken; it tries the next approved host instead. The selected
SDK's installed `dotnet.runtimeconfig.json` must have a bounded (64 KiB), exact
real path, `net10.0`/`Microsoft.NETCore.App` stable 10.0 requirement and default,
`Minor` or `LatestPatch` policy with patching enabled. Its minimum patch must be
satisfied by an installed 10.0 runtime on the same host. SDK presence alone is
not CLI runtime availability. Unsupported SDK configs fail closed.

Worker runtime selection is independent from that SDK runtime. `Disable` requires
the exact patch; `Latest` selects the highest eligible version and maps to native
`LatestMajor`; `Minor`/`Major` prefer the requested line's latest eligible patch.
`Minor` then tries the next minor in the same major; `Major` additionally tries
the lowest higher major, its lowest minor and latest patch. Minimum patch bounds
apply only to the requested line, and no policy selects below the minimum.
Runtime 8/9/10 or higher is eligible only as the worker policy permits.

`HOST_NOT_FOUND`, `INVALID_HOST`, `SDK_NOT_FOUND`, `SDK_CONFIG_INVALID`,
`SDK_RUNTIME_NOT_FOUND`, `RUNTIME_NOT_FOUND`, invalid/unsupported platform/runtime,
architecture mismatch, timeout, probe failure and malformed output are distinct.
For failed candidates the top-level error prefers SDK/worker compatibility
evidence over missing later hosts; every attempted failure remains available.

## PR3 Handoff

Discovery returns the absolute host/root, native RID/architecture, matrix version,
selected SDK, SDK runtime/config path, worker runtime, effective native policy and
an exact `sdkPin`: version, `rollForward: "disable"`, `allowPrerelease: false`,
`paths: ["$host$"]`. It writes no global.json or other preparation artifacts.

PR3 must create the pin only in a PPTB-controlled trusted workspace, invoke the
returned absolute host from that workspace, and verify the SDK actually used.
Revalidate host/config/runtime identity before preparation and later execution;
discovery is a snapshot, not a persistent authorization or binary trust proof.
Use a controlled NuGet source/config and local tool manifest, exact locked package
identity, atomic cache/rollback and offline/concurrency gates. Verify restored
command, executable TFM, shared framework, minimum version and native roll-forward
against the declaration; do not broaden a stricter binary policy. Package config
inspection, source setup, restore and execution are deliberately absent from PR2.

References: [.NET CLI diagnostics and runtime roll-forward](https://learn.microsoft.com/dotnet/core/tools/dotnet),
[SDK selection and host-scoped paths](https://learn.microsoft.com/dotnet/core/tools/global-json).
