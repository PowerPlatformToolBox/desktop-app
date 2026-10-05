# .NET Worker Delivery Tracker

This is the implementation tracker for issue #493. PR numbers below identify
planned delivery slices, not opened GitHub pull requests. Only PR0 is implemented.
No production worker API or native execution permission is enabled by PR0.

## Status

| Slice | Status                    | Dependencies       | Deliverable and completion gate                                                                                                                                                                                                              |
| ----- | ------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR0   | Completed (bounded probe) | None               | Real SQL 4 CDS DLL, reverse callback, concurrent requests, cancellation, progress, errors and EOF exit tested. See the [probe](DOTNET_WORKERS_PR0.md) for compatibility limits.                                                              |
| PR1   | Not started               | PR0                | Worker declaration schema including target framework, minimum runtime and four-value roll-forward policy; public manifest types, registry/npm/local loading and persisted metadata; fail-closed validation and backward-compatibility tests. |
| PR2   | Not started               | PR1                | Installed SDK/runtime discovery with deterministic .NET 10 SDK selection and declared runtime policy resolution; missing SDK, runtime-only, all four policies and incompatible architecture/config tests.                                    |
| PR3   | Not started               | PR1, PR2           | Pinned NuGet preparation, controlled source/manifest, atomic cache and rollback; concurrency, version/command verification and offline tests.                                                                                                |
| PR4   | Not started               | PR0, PR1           | Internal process/transport manager; framing, backpressure, bounded queues, early messages, malformed input and shutdown tests. No public launch path.                                                                                        |
| PR5   | Not started               | PR1                | Trusted native-execution consent and review/revoke UI; deny, fingerprint changes, duplicate prompts and self-approval rejection tests.                                                                                                       |
| PR6   | Not started               | PR2, PR3, PR4, PR5 | Internal broker, sender-derived ownership, targeted events and full lifecycle; foreign-handle, denial, close/crash/revoke/update/uninstall/quit tests.                                                                                       |
| PR7   | Not started               | PR6                | Public preload API, browser-compatible RPC adapter and author example; Electron callback flow, disposal, SDK guidance and public-type tests.                                                                                                 |
| PR8   | Not started               | PR7                | .NET 10 and declared platform qualification, packaged-app checks, migration docs and coordinated release of app/types/validator.                                                                                                             |

## Runtime Declaration Decision (2026-10-05)

Each worker declares its executable target framework, minimum runtime version and
one of four PPTB roll-forward values. These are planned PR1 fields, not a currently
implemented API:

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
            "platforms": ["win-x64", "osx-arm64"],
            "transport": "jsonrpc-stdio-v1"
        }
    }
}
```

| PPTB value | Runtime selection                                                                                                                                                                                                             | Native .NET mapping |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `Disable`  | Exact requested version, including patch; fail if absent.                                                                                                                                                                     | `Disable`           |
| `Latest`   | Highest available compatible major, minor and patch at or above the requirement.                                                                                                                                              | `LatestMajor`       |
| `Minor`    | Prefer requested major/minor with its latest eligible patch; otherwise select the next available minor within that major and its latest patch. Never advance to a higher major.                                               | `Minor`             |
| `Major`    | Prefer requested major/minor with its latest eligible patch, even when newer majors exist. If absent, try the next minor in that major, then the next higher available major and its lowest eligible minor with latest patch. | `Major`             |

For requirement `8.0.0`, with runtimes `8.0.12` and `10.0.1` installed:
`Disable` fails, `Latest` selects `10.0.1`, and `Minor`/`Major` select `8.0.12`.
With only `10.0.1` installed, `Disable`/`Minor` fail and `Latest`/`Major` select
`10.0.1`. `Major` is a preference for the requested runtime line, not a promise
to use its exact minimum patch; exact patch selection belongs to `Disable`.

Only these four case-sensitive values are accepted. `rollForward` is optional
and defaults to `Major` when omitted. Explicit `null`, empty strings and unknown
values are invalid, not defaults. Normalize omission to `Major` before runtime
selection, package-policy validation and consent fingerprinting, so omission and
explicit `Major` have identical effective behavior. Show the effective policy
in consent and diagnostics. The default must not override a stricter binary
policy; package-policy mismatches still fail validation. `LatestPatch`,
`LatestMinor` and `LatestMajor` are not author-facing PPTB values. `Latest` must
be translated to `LatestMajor` before interacting with .NET, never forwarded
literally as a native runtime option. No policy selects a runtime below the
minimum or treats an installed SDK as proof that the needed runtime exists.

The target framework describes the worker executable, not the shared core DLL.
PR1 validates a supported console target framework and matching major/minor
runtime requirement; PR3 verifies these against the restored package's runtime
configuration. A declaration may not lower the binary's minimum requirement or
silently broaden its roll-forward policy. Authors must configure their worker
runtime settings consistently (using the native policy mapping) and test any
higher-major compatibility they permit. Resolve mismatches before execution.

PPTB owns SDK selection for package installation: initially a compatible .NET 10
SDK. Authors do not declare `sdkMajor`. This replaces the earlier proposal that
all workers must target `net10.0`; a supported `net8.0` worker can run on runtime
10 when its declared and packaged policy permits it. Runtime 8 installation is
not mandatory in that case. v1 supports `Microsoft.NETCore.App` console workers;
Desktop/ASP.NET shared frameworks and self-contained workers remain out of scope.

PR1 tests omission normalizes to `Major`, explicit `Major` is equivalent, and
invalid values are rejected. PR2 tests all policies with exact, patched, missing, same-major fallback and
higher-major inventories; include multiple higher majors to distinguish `Major`
from `Latest`, minimum-patch rejection and architecture mismatch. PR3 checks
package/config consistency, and PR8 qualifies actual runtime combinations.
Production launch policy is still unimplemented; PR0's net8.0 fixture is unchanged.

## Completion Rules

1. Change one slice to `In progress` when work begins. Parallel independent slices
   are permitted after their dependencies are completed.
2. Include focused tests and documentation in that slice, not a later hardening PR.
3. Record the executed command, result, environment and remaining limitations below.
4. Mark `Completed` only after its acceptance gate passes. A partial result stays
   `In progress` or `Blocked`, with the missing gate documented.
5. Review the completed slice before starting a dependent slice. Never expose
   renderer-callable native execution before PR6's consent and lifecycle gates.
6. Keep `dotnet` blocked in the existing terminal API throughout these changes.

## PR0 Evidence

- Date: 2026-10-04.
- Host: macOS arm64; SDK 9.0.203 builds the `net8.0` fixture using installed .NET 8.
- Candidate library: `MarkMpn.Sql4Cds.Engine` 10.5.1, not a replacement toy engine.
- Transport: `StreamJsonRpc` 2.25.29 and `vscode-jsonrpc` 8.2.1 with Content-Length
  framing. NuGet dependency closures are recorded in project lock files.
- Command: `pnpm run test:dotnet-probe`; five tests passed.
- Existing unit suite: 426 tests passed through VS Code's test runner; the opt-in
  probe does not add an SDK prerequisite to that suite.
- `pnpm run typecheck`, `pnpm run lint` and `pnpm run build` passed. Lint reports
  the existing TypeScript/parser compatibility warning; Vite reports existing
  chunk/import warnings.
- Local `dotnet pack` succeeded. Package inspection confirmed `Core.dll`,
  `MarkMpn.Sql4Cds.Engine.dll`, `Worker.dll` and `DotnetToolSettings.xml` are present.
- Read-only code review found no blocking defects or production API exposure.
- Callback originates inside SQL 4 CDS's organization-locale lookup during
  connection construction. The host supplies simulated data, not live Dataverse.
- No credentials are passed to the worker. Worker startup uses a limited explicit
  environment; this is not an OS sandbox.
- General account/contact FetchXML, metadata and SDK message serialization remain
  unresolved. They require an author-owned service adapter before a real SQL tool.
- .NET 10, Windows and Linux have not been qualified. Do not infer support from
  this probe or advertise these targets as verified.
- Cancellation is checked while awaiting a callback; subsequent responsiveness
  is verified by ping. Active-query cancellation, another SQL query after
  cancellation and EOF during an outstanding query remain additional checks.
- The sample core targets .NET 8. This proves architectural separation, not binary
  compatibility with a .NET Framework-based XrmToolBox host.
- SDK acquisition, runtime discovery, user consent and production IPC are not part
  of PR0. The probe is explicitly developer-invoked, not shipped as an API.

## Next Checkpoint

PR1 can begin with the bounded protocol result above, but must not claim a complete
Dataverse proxy or cross-platform compatibility. Retain the organization-locale
fixture as the cheap full-duplex regression test. Carry the remaining real-query
adapter and platform checks into the author example and PR8 qualification gates.
