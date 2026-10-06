# Internal DotNet Tool Preparation (PR3)

PR3 provides `DotNetToolManager.prepare`. PR6 now consumes it through
[the internal broker](WORKER_BROKER.md) with live consent and optional cancellation;
there is still no renderer launch IPC/preload/public API. The default
executor can perform a NuGet restore when an internal caller explicitly calls
`prepare` and its injected approval callback returns exactly `true`. It never
runs the restored command. PR1 declaration validation and PR2 installed-host
discovery remain authoritative and unchanged.

## Internal Contract

Construct `DotNetToolManager` with an absolute, canonical, app-owned workspace
root and `DotNetToolPreparationDependencies`. Its parent must already exist;
preparation can create the root itself. The root is not a renderer argument.
Symlinked ancestor/root paths and multiply-linked artifact files are rejected.
Use the canonical real path when the OS temporary directory is an alias.

`DotNetToolPreparationRequest` has exactly three fields:

- `identity`: `toolId`, `toolVersion`, `workerId`, `sourceFingerprint`.
  The future main-process caller must resolve these from the sender's installed
  tool and freshly read source, not accept renderer assertions. `sourceFingerprint`
  is a lowercase SHA-256 identity supplied by that trusted resolver.
- `declaration`: the validated canonical PR1 `NormalizedWorkerDeclaration`,
  including effective roll-forward policy and sorted platforms. Preparation
  revalidates it through the existing authoritative worker validator.
- `selection`: PR2 `DotNetDiscoverySelection`, including its exact SDK pin.

Every call requires fresh injected approval, including warm reuse and calls
deduplicated with another preparation. Denial or approval failure occurs before
filesystem access, discovery/probes, command execution or in-memory cache lookup.
Approval is an internal prerequisite, not a complete consent/security design.
Callbacks receive copies so the approval argument cannot mutate the request.

Default revalidation invokes PR2 discovery again, without accepting a supplied
host/path override, and compares all selection authority fields except diagnostic
attempts. A trusted injected `rediscover` must provide equivalent current host,
architecture, SDK/config and runtime validation. Differences fail before workspace
access. Cold preparation additionally invokes the absolute host's `--version`
inside the pinned workspace and requires the exact selected stable SDK version.

## Workspace And Restore

The workspace name hashes the complete resolved identity, canonical declaration,
PR2 selection and schema version, with native RID as a suffix. Tool versions,
source fingerprints, requirements, SDKs and RIDs cannot share authority by accident.
Generated files are:

- `global.json`: PR2's exact `sdkPin`, including disabled roll-forward, no
  prerelease and host-scoped SDK paths.
- `.config/dotnet-tools.json`: version 1, `isRoot: true`, exactly one lowercase
  package ID, normalized exact package version and declared command.
- `NuGet.Config`: clears inherited feeds/fallback folders/mapping; only
  `https://api.nuget.org/v3/index.json` is admitted, with all packages mapped there.
- Isolated `packages`, `cli-home`, HTTP/plugin caches and temporary directories.

NuGet identity normalization pads to three numeric components, removes a zero
fourth component, removes numeric-component leading zeroes and build metadata,
and compares prerelease labels case-insensitively. It never resolves a tag, range,
floating version or newest release. The original declaration remains in authority.

The bounded `execFile` default uses `shell: false`, explicit argument arrays,
absolute PR2 host and a fresh minimal environment. It inherits no PATH, credentials,
home, startup hooks, SDK resolver overrides, proxy or authentication variables.
`NUGET_PACKAGES`, `DOTNET_CLI_HOME`, NuGet HTTP/plugin caches and temporary paths
are workspace-local. The SDK check has a 5-second bound; restore has a 120-second
bound; both have 256-KiB output limits and forced termination. Exceptions/stdout
are not logged or returned. Generated configuration is re-read and validated
before each command, including immediately before downloading.

The adapter retains the actual `ChildProcess` returned by `execFile`. Preparation
controls retain an internal `AbortSignal`, but the adapter removes that signal
and the command timeout from Node's options and owns both termination triggers.
Cancellation, command timeout and callback failures explicitly request the
configured `SIGKILL`; no graceful restore shutdown is attempted. A callback,
`AbortError`, dispatched kill or parent `exit` is not sufficient: the command
result settles only after observed child `close`, including output-pipe closure.
Termination/early-callback close verification has an additional 5-second bound.
Diagnostics remain bounded and redacted; raw callback errors/output are not exposed.

If close is not observed within that bound, `RESTORE_STOP_UNVERIFIED` takes
precedence over cancellation. Preparation retains its owned staging directory
and lock rather than deleting files a command may still be using. The existing
lock blocks future preparation of that exact workspace, including after app
restart. There is no automatic late-close recovery or stale-lock deletion.
Restart alone is not proof that a surviving child has stopped: trusted manual
resolution must first establish termination and pipe closure before removing
the retained partial workspace/lock. Injected executors must provide the same
close-before-settlement contract; an indefinitely pending injected executor
can only be quarantined by the broker's bounded cleanup timeout, not safely
forced into successful cleanup.

Restore is `tool restore` with explicit local manifest and configfile, no-cache,
disabled parallel restore and minimal verbosity. No author-controlled source,
flag, config, cwd, executable path or environment is exposed. There is no global
tool install, package command, `dotnet tool run` or worker process.

## Verification And Cache

Local tools use the isolated NuGet cache, not global `.store` shims. Verification
checks the expected package directory, nuspec ID/version, downloaded archive
SHA-512 against its cache digest and version-2 NuGet source metadata, local
manifest, and the isolated CLI `toolResolverCache/1/<package-id>` registry record.
The resolver must have exactly one matching version/command/dotnet-runner entry;
its absolute executable must match verified package settings. Resolver target
framework can identify the restore SDK or declared executable framework; the
executable's own packaged artifacts must always match the explicit declaration.

The controlled package path is `tools/<declared-tfm>/any`. Bounded XML inspection
verifies a single managed command and its relative DLL entrypoint. Runtimeconfig
requires the declared TFM, exact minimum `Microsoft.NETCore.App` version and
matching native policy. `Latest` means packaged `LatestMajor`; default `Major`
must actually be packaged `Major`. An omitted binary policy means native `Minor`,
not a license to override it with Major; omission is accepted when the declaration
also requires `Minor`. Explicit `rollForward` cannot coexist with `applyPatches`
(even `true`) or `rollForwardOnNoCandidateFx`. Framework-level `rollForward`,
`applyPatches` and `rollForwardOnNoCandidateFx` are conservatively unsupported,
even when they match the top-level policy: preparation does not implement nested
host-policy precedence. Adjacent `<entrypoint>.runtimeconfig.dev.json` is rejected
before cache publication and on warm reuse, regardless of valid inventory hashes,
because it is another host input for probing/framework configuration. Additional
frameworks, self-contained configs, disabled patching and legacy policy overrides
fail closed. Deps target,
library identities, dependency links and referenced artifact paths are inspected.
Published flattened DLLs are accepted only inside the verified tool artifact root.
Traversal, symlinks and hardlink escapes are rejected throughout the workspace.

Preparation stages in a unique sibling directory. It verifies restore artifacts,
relocates only the verified resolver entrypoint to its final path, atomically
renames the directory, verifies again and writes `complete.json` last. Errors
remove owned partial staging/publication only after verified command closure;
`RESTORE_STOP_UNVERIFIED` retains staging and its lock. An existing incomplete or modified
cache fails closed rather than being silently overwritten. An interrupted run
may leave an incomplete directory or lock that requires trusted offline recovery.

An in-memory promise map deduplicates matching approved requests. A filesystem
directory lock excludes other managers/processes; existing locks are never stolen
or removed as allegedly stale. Release checks the owned directory inode and
owner token. There is no automatic stale-lock deletion or cross-process wait.

The completion marker binds full authority and a bounded SHA-256 inventory of
all workspace files. Warm reuse reapproves, rediscovers, rehashes every artifact
and rechecks manifest/config/package/resolver/runtime/deps authority without any
preparation SDK-version or NuGet command. Default PR2 rediscovery still performs
its bounded installed-host diagnostics. Offline reuse requires valid discovery and
approval; it is not a host-validation bypass.

## PR4 Handoff

`DotNetPreparedTool` in the new internal `dotnetTool.ts` contains resolved identity,
declaration/preparation fingerprints, workspace/manifest paths, normalized package
identity, command, verified DLL/runtimeconfig/deps paths, PR2 selection,
inventory integrity hash and `reused`. PR4 can consume this descriptor without
editing existing shared discovery types. It is a snapshot, not an execution
permit: revalidate sender ownership, source/consent, host and workspace immediately
before any future worker execution. No public export has been added.

## Limits And Validation

These checks do not establish that package code is safe, authenticated or signed.
An attacker able to replace both files and marker can defeat plain inventory
hashes. PR3 is not a sandbox, filesystem race proof, supply-chain attestation or
protection from another process with the same filesystem privileges. ZIP contents
are not independently re-extracted and compared; archive digest/source and
extracted-artifact checks serve different purposes. Network/TLS and NuGet's own
restore behavior remain external dependencies, without inherited enterprise feeds
or proxy credentials. Forced CLI termination is not a process-tree sandbox.

This implementation conservatively supports one managed command, `tools/<tfm>/any`,
CLI resolver format 1, cache metadata format 2 and bounded ordinary package XML.
DTD, declarations other than the XML header, comments, CDATA, external entities,
custom XML/settings, RID-specific package indirection and native-only shims are
not supported. Nuspec XML is limited to 256 KiB, configs to 256 KiB, deps to 4 MiB,
marker to 2 MiB; inventory is at most 10,000 entries, 256 MiB per file and 1 GiB
total. An exact real-path/case requirement may reject unusual Windows layouts.

Focused tests use actual temporary directories and an injected executor that
populates local NuGet package and resolver layout, including flattened dependency
DLLs. They do not download packages or prove real CLI compatibility. Native .NET
10 is unavailable for qualification in this agent session. Focused Jest command
execution through the available runner failed before starting; refreshed editor
diagnostics and main-agent command gates must be recorded separately.

The PR3 reviewer repair adds cold and warm regressions for nested policies,
explicit/deprecated policy conflicts and adjacent development runtimeconfigs,
plus omitted-policy `Minor` parity. Warm rejection fixtures reseal the changed
artifact inventory and assert that resolver verification was reached, so they
test semantic rejection rather than only hash mismatch. Post-repair editor
diagnostics are clean; no executable test runner is exposed in the repair session.
The main agent's reported initial 192 passing tests predate these repairs and are
not evidence that the new regressions passed. Native qualification remains pending.

Pending main checks: project Prettier on the three new TypeScript modules and
test file; `pnpm run test:unit --runInBand --runTestsByPath
tests/unit/main/managers/dotnetToolManager.test.ts`, `pnpm run typecheck`,
`pnpm run lint`, `pnpm run build`. Qualify actual local restore and offline reuse
on native .NET 10 and all supported platforms before enabling production callers.

References: [local tool restore](https://learn.microsoft.com/dotnet/core/tools/dotnet-tool-restore),
[SDK selection](https://learn.microsoft.com/dotnet/core/tools/global-json),
[PR1 and PR2 contracts](DOTNET_WORKER_DECLARATIONS.md).
