# PR0: Shared .NET DLL Compatibility Probe

## What It Proves

An npm/TypeScript host can communicate with a persistent .NET process that uses
the actual SQL 4 CDS engine. The worker remains responsive while a synchronous
SDK operation inside that DLL waits for an asynchronous reverse JSON-RPC request.

The fixture has separate `Core` and `Worker` projects. Core references SQL 4 CDS
and contains no RPC dependency. This illustrates sharing business logic through
`IOrganizationService`; the console worker supplies a callback adapter. The sample
core targets .NET 8, so using it in an existing .NET Framework XrmToolBox host
would require compatible targeting and dependencies. That host is not tested here.
The host harness uses the established `vscode-jsonrpc` library; the worker uses
`StreamJsonRpc`. Both use UTF-8 Content-Length framing, not line-delimited JSON.

## Run

Prerequisites: the repository's pnpm dependencies, a .NET SDK that can build
`net8.0`, and a compatible .NET 8 runtime. The first restore requires nuget.org.
This intentionally targets the SDK/runtime available during PR0; it does not
lower the planned production .NET 10 requirement.

```sh
pnpm install
pnpm run test:dotnet-probe
```

The opt-in command builds with locked NuGet dependencies and runs five real-pipe
integration tests. Ordinary `pnpm run test:unit` skips this suite so existing CI
does not acquire a new .NET or network prerequisite. Build output is ignored;
project lock files are tracked. No worker is started by installing npm dependencies.

The executable on PATH is used for the build. `PPTB_DOTNET_PATH` can select an
absolute host path for test worker launch; it does not change the build SDK.

## Request Flow

1. The TypeScript harness starts the already-built worker with piped stdio,
   `shell: false` and an explicit limited environment. No credentials are supplied.
2. The host invokes `query` with `SELECT 40 + 2 AS answer`.
3. Worker emits `progress("starting")`, then runs the synchronous core on a
   background task so the RPC dispatcher can continue receiving responses.
4. SQL 4 CDS constructs its connection and looks up the organization locale.
5. The SDK adapter sends `dataverse/fetchXml` back to TypeScript. While this is
   pending, the test issues `ping` and verifies a response before answering it.
6. The simulated FetchXML response contains locale 1033. The adapter reconstructs
   the SDK entity, the actual engine executes SQL, and the host receives `"42"`
   plus a completion notification.
7. Closing stdin ends the worker cleanly. stdout contains protocol frames only;
   startup diagnostics are written separately to stderr.

## Test Coverage

- Actual engine execution and a reverse FetchXML callback, including a non-ASCII
  SQL result to exercise UTF-8 framing.
- Two simultaneous queries with separate correlated callbacks.
- Cooperative cancellation during a pending callback using `$/cancelRequest`,
  followed by a successful ping on the same process.
- Callback errors returned to the original caller without breaking the worker.
- Clean process exit on stdin EOF, with force-kill fallback in test cleanup.

Cancellation was initially able to race a callback response. The core now checks
the token after connection setup and before returning a result. This proves this
specific cancellation path, not universal preemption of native computation.

## Package Shape

The worker project is packable as a .NET tool named `pptb-compatibility-worker`.
Its project reference carries the core DLL into the published worker payload;
authors do not have to publish a separate core NuGet package to share its code.

```sh
dotnet pack tests/fixtures/dotnet-worker/Worker/Worker.csproj --configuration Release --output tests/fixtures/dotnet-worker -p:RestoreLockedMode=true
```

This generates a local test package only. Do not publish the fixture to nuget.org.
NuGet installation/command resolution through PPTB is deliberately deferred to PR3.

## Limits And Decisions

The adapter accepts only the engine's organization-locale `QueryExpression` and
maps it to one fixed FetchXML request. All other SDK operations throw an explicit
unsupported-operation error. There is no general-purpose SDK serializer, metadata
cache adapter, live Dataverse connection or account/contact query support yet.

The TypeScript callback is simulated. A real author adapter must map supported
callbacks to its existing `dataverseAPI` and map the results back to SDK objects.
This must account for metadata, SDK value types, paging, service errors and any
additional operations the chosen engine requires. Never silently substitute empty
results for an unsupported operation.

Only macOS arm64 with the `net8.0` fixture has been exercised. .NET 10 and other
platforms remain qualification work. The worker is trusted native code under the
user account, not a sandbox. This fixture is not reachable through PPTB IPC or
`terminal.execute`, and the terminal's `dotnet` block remains unchanged.

See the [delivery tracker](DOTNET_WORKERS_STATUS.md) before starting PR1.
