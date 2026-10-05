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
literally; matrix versioning, platform resolution and runtime discovery are not
implemented here and must not be inferred from this declaration change.

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
