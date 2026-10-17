# .NET Workers Engineering Reference

This document collects the internal contracts, implementation limits and
qualification evidence for the staged worker implementation. For author setup
and the end-to-end developer workflow, see [the worker guide](DOTNET_WORKERS.md).
For current delivery state and PR-by-PR evidence, see [the tracker](DOTNET_WORKERS_STATUS.md).
Historical execution details remain in the linked [PR plans](../.github/plans/plan-dotnet-workers-pr1.md)
through [PR7 plan](../.github/plans/plan-dotnet-workers-pr7.md).

## Compatibility Probe (PR0)

The opt-in probe uses the real SQL 4 CDS 10.5.1 engine behind separate .NET 8
Core and console Worker projects. Core has no RPC dependency; the worker adapts
`IOrganizationService`. The TypeScript harness uses `vscode-jsonrpc` 8.2.1 and
the worker uses `StreamJsonRpc` 2.25.29, both with UTF-8 Content-Length framing.
Five real-pipe tests exercised SQL `SELECT 40 + 2`, a reverse organization-locale
FetchXML callback while another request remained responsive, Unicode, concurrent
requests, callback errors, cancellation during a pending callback and EOF exit.
The probe ran on macOS arm64 with SDK 9.0.203 and the .NET 8 runtime; local pack
inspection found the core, engine, worker and tool settings in the package.

This is not evidence of .NET 10, Windows/Linux, XrmToolBox .NET Framework
compatibility, a live Dataverse query or a complete service adapter. The callback
is simulated and supports only the engine's organization-locale lookup; other
SDK operations fail explicitly. Active native computation cancellation, another
query after cancellation and EOF with an outstanding query are not qualified.
The fixture is developer-invoked only and is not connected to IPC or the terminal.

## Declaration And Discovery (PR1-PR2)

The author declaration is metadata, not execution authority. It is validated by
the shared validator, canonicalized for installed tools and re-read from source
before use. Worker-bearing packages require `features.minAPI`; no API release
version is inferred by the declaration. Strict validation rejects unknown keys,
paths, arbitrary feeds/flags/environment, duplicate or empty platform lists,
legacy `win-*`/`osx-*` aliases and an explicit author-facing `transport` field.
`platforms: ["all"]` stays literal and means the versioned PPTB support matrix.
The internal wire protocol is `jsonrpc-stdio-v1`, protocol version 1.

Accepted platform aliases are `all`, `windows-x64`, `windows-arm64`, `macos-x64`,
`macos-arm64`, `linux-x64` and `linux-arm64`. Concrete aliases resolve internally
to native .NET RIDs; the Linux matrix is portable glibc only, not musl or
distro-specific SDK targets. Admission is not platform qualification.

The worker declaration contains an exact NuGet package ID/version and command,
an executable TFM (`net8.0`, `net9.0` or `net10.0`), a stable minimum
`major.minor.patch` runtime version matching the TFM major/minor, and optional
case-sensitive `rollForward` (`Disable`, `Latest`, `Minor`, `Major`). Omission
normalizes to `Major`; explicit null, empty and unknown values fail. `Latest`
maps to native `LatestMajor`. `Major` prefers the requested line and then the
next minor in that major before a higher major; `Minor` never advances major;
`Disable` requires the exact patch. Nothing selects below the minimum. Package
runtime configuration cannot lower the minimum or broaden its declared policy.
The executable TFM is independent of the shared core library's TFM. The initial
worker is a framework-dependent `Microsoft.NETCore.App` console tool; desktop,
ASP.NET shared frameworks and self-contained workers are excluded.

PR2 discovery is internal and is not an execution grant. It checks fixed host
locations only: Windows `C:\Program Files\dotnet\dotnet.exe` and its `x64`
subdirectory; macOS `/usr/local/share/dotnet/dotnet` and its `x64` subdirectory;
Linux `/usr/share/dotnet/dotnet`, `/usr/lib/dotnet/dotnet`,
`/usr/lib64/dotnet/dotnet` and `/usr/local/share/dotnet/dotnet`. There is no PATH
lookup, renderer-provided host path, alternate Windows drive, user-local root or
symlink escape. Native architecture is checked from host output, not folder
names. Only bounded `--info` and `--list-runtimes` probes run, with an explicit
credential-free environment, no inherited PATH/home, 3-second timeouts and
256 KiB output limits. A non-zero `--info` exit (as on runtime-only hosts) still
uses its Host section; the RID may appear under both the SDK and Host sections
but must agree. No .NET SDK is required, and no SDK/runtime is downloaded or
installed.

## Package Preparation

> Simplified in October 2026. Preparation originally ran `dotnet tool restore`
> in an isolated SDK workspace and verified SDK-internal files such as
> `toolResolverCache`. That required an installed .NET 10 SDK, depended on
> undocumented SDK layouts, and needed staging/lock/quarantine handling for the
> restore child process. It was replaced by the direct package flow below.

Preparation accepts only a trusted main-process identity, canonical validated
declaration and current discovery selection. Fresh approval is required before
filesystem or network access, including warm-cache reuse. Unknown request
fields, non-canonical declarations and non-nuget.org/non-configured sources are
rejected before any download.

The [.NET tool package format](https://github.com/dotnet/sdk/blob/main/documentation/general/tool-nuget-package-format.md)
requires each `tools/<tfm>/any` folder to contain every dependency the tool needs,
so no NuGet dependency resolution is performed. PPTB:

1. Downloads `https://api.nuget.org/v3-flatcontainer/{id}/{version}/{id}.{version}.nupkg`
   over HTTPS only (HTTPS-only redirects, at most 5), through the app proxy agent,
   with a 256 MiB size cap, 5-minute timeout and cancellation. Developer builds
   read the exact `.nupkg` from the configured local feed instead and require its
   SHA-512 to equal the consent-pinned hash.
2. Extracts with `yauzl` only the nuspec and `tools/**`. Entry names are
   percent-decoded and must be safe package-relative paths (no absolute paths,
   `..`, backslashes, colons or control characters); symlinks and
   case-insensitive duplicates are rejected; at most 10,000 entries and 1 GiB
   uncompressed.
3. Verifies the nuspec ID/version and the `DotnetTool` package type, then
   publishes the extraction from `native-workers/.tmp/` to
   `native-workers/<id>/<version>/` (local feeds: `<version>-local-<hash>`) with
   a `complete.json` marker recording the package SHA-512 and extracted file sizes.
4. Verifies, for every launch, `DotnetToolSettings.xml` (Version 1, single
   command matching the declaration, `Runner="dotnet"`, managed DLL entry point),
   the entry point, its runtimeconfig against the declared TFM/minimum/policy,
   the absence of `runtimeconfig.dev.json`, and that every `deps.json` runtime
   asset exists and lists the entry point.

Concurrent preparations of the same package share one in-process download; it is
aborted only when every waiter has cancelled. The app is single-instance, so no
filesystem lock is needed. A cache whose marker or file sizes do not match is
discarded and rebuilt. On first use per launch, PPTB removes `native-workers/.tmp`
and legacy `<64-hex>-<rid>`, `.stage-*` and `.lock` entries from the restore-based
layout. The marker detects accidental damage; it is not a signature or defense
against a same-user adversary. nuget.org integrity relies on HTTPS and immutable
package versions; NuGet repository signatures are not verified.

## Process Transport (PR4)

The main-process manager accepts only an immutable descriptor created by trusted
preparation; no renderer-selected command, executable, cwd or environment is
accepted. It launches an absolute host with `shell: false`, piped stdio and a
minimal constructed environment. It exposes owner-scoped opaque handles, never
PIDs, streams or child-process objects. One declaration has at most one reserved
process per tool instance. Messages are targeted to that owner; stderr is
drained but fully redacted, and protocol/stdout/raw diagnostics are not telemetry.

Readiness is an exact JSON-RPC `platform/initialize` request/reply for
`jsonrpc-stdio-v1`, version 1, with a fresh reserved string ID and no extra result
fields. Domain traffic is not sent before readiness. The framing is strict ASCII
CRLF `Content-Length`, UTF-8 JSON; duplicate/unknown headers, malformed lengths,
invalid UTF-8/envelopes, batches, excessive nesting and oversized frames fail
closed. The bounded reader validates lengths before handing a frame to
`vscode-jsonrpc`.

Default transport bounds are: 1 MiB JSON body, 1 KiB header, 64 pending inbound
frames/4 MiB, 64 pending outbound writes/4 MiB, 64 early messages/4 MiB, 64
subscribers and 16 KiB capped stderr count. Startup, partial-frame and write
timeouts are 10 seconds; graceful stop and tree-termination waits are 2 and 3
seconds. Limits may be tightened, not loosened. Writes are serialized with
backpressure. Early messages are bounded and delivered in order after the first
subscription; later subscribers do not replay history. A resolved `send` means
bytes were written, not that a worker operation completed.

Stop rejects pending sends and cancels preparation, waits for an active write
before shutdown, then closes stdin; EOF is authoritative. Forced termination is
bounded and the slot stays quarantined until exit is observed. POSIX uses the
captured detached process group; Windows invokes fixed `taskkill.exe` arguments.
Leader exit or a successful kill signal alone does not prove descendants or pipes
are gone. Native code can detach/daemonize, so process-tree cleanup is not an OS
containment guarantee. No query or operation is automatically replayed.

## Consent And Broker (PR5-PR6)

Consent is a main-window-only trust decision for native code running as the
current OS user. It is not sandboxing, elevation or runtime installation
permission. Persistent consent fingerprints the exact tool ID/version, worker
ID, canonical native declaration, fixed source, protocol version and platform
matrix version. Omitted and explicit `Major` normalize identically; local source
changes still require re-approval. Records are held in the dedicated
`native-worker-consents` store, not generic tool settings. Allow-once and denial
do not persist. Review/revoke is main-window-only; revoke cancels matching
launches and workers.

The broker derives the exact live tool instance from the sender's `WebContents`,
then validates the loaded identity against current package/config source before
consent, discovery, preparation and immediately before spawn. Preparation
authority includes a source fingerprint over canonical path and package/config
bytes. Each asynchronous boundary rechecks live consent revision and source.
Handles and events are scoped to the owning instance; another instance of the
same tool cannot use them. Normal npm installation does not discover .NET,
download packages or start workers. No credentials are passed to the worker.

Confirmed close, renderer crash/destruction/navigation, revocation, tool mutation
and explicit app quit coordinate owner cleanup and verified stop. Canceled close
preserves the worker; update/uninstall blocks before file mutation if preparation
or stop cannot be proven complete. App quit waits behind a reentrancy guard;
tray hiding does not stop workers. Preparation runs no child process; cancelling
it aborts the shared download once no caller is waiting, and a failed preparation
does not block later mutation or retry. A worker stop/pipe-close failure retains
the broker blocker. Cleanup status is not proof against a
native child that deliberately escapes the process group or closes inherited
pipes.

## PR7 Local Feed And Qualification

The unpublished-package feed is developer-only. It requires both the Vite-injected
`PPTB_DEVELOPER_BUILD=1` marker and an unpackaged app, plus
`PPTB_DOTNET_LOCAL_NUGET_FEED` supplied to the main process as an absolute path.
The path is not a manifest/renderer input and is never exposed to the tool
preload. PPTB reads only the exact declared `<id>.<version>.nupkg` from the
feed (the package already bundles its dependencies). Missing local packages
fail without fallback. Registry, marketplace and npm-debug installs remain
nuget.org-only. The consent/cache identity includes the canonical feed path and
package SHA-512, so changing either invalidates prior approval/preparation.

The sample UI is a protocol/core-sharing demonstration, not an SQL 4 CDS
integration. Its `net10.0` package must be packed and run through the local feed
on a host with the .NET 10 runtime. The earlier PR0 .NET 8 probe is not
evidence for this flow. Do not mark PR7 complete or claim C# interoperability
until this smoke passes. PR8 still owns native .NET 10 and declared-platform
qualification, packaged Electron behavior, and release coordination; do not
advertise untested platforms.

For the executable local setup, build and smoke commands, automated checks and
required manual cases, see [Local Debug in the worker guide](DOTNET_WORKERS.md#local-debug-with-an-unpublished-package).
The [PR7 execution plan](../.github/plans/plan-dotnet-workers-pr7.md) records
the remaining acceptance gates. Historical PR implementation details are in
the [PR1](../.github/plans/plan-dotnet-workers-pr1.md),
[PR2](../.github/plans/plan-dotnet-workers-pr2.md),
[PR3](../.github/plans/plan-dotnet-workers-pr3.md),
[PR4](../.github/plans/plan-dotnet-workers-pr4.md),
[PR5](../.github/plans/plan-dotnet-workers-pr5.md) and
[PR6](../.github/plans/plan-dotnet-workers-pr6.md) execution logs.
