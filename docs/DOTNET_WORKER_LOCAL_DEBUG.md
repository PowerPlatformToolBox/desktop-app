# .NET Worker Local Debug Guide

**Planned for PR7; not yet runnable.** PR6 has an internal broker, but PPTB does
not yet expose worker start/send/subscribe/stop to tools. PR3 currently restores
from nuget.org only. This guide records the intended local author workflow and
the tests PR7 must implement; the commands below build packages but cannot yet
run them through PPTB.

## Intended Workflow

1. Install the .NET 10 SDK required by PPTB's local-tool preparation. Also install
   the worker's required `Microsoft.NETCore.App` runtime when roll-forward cannot
   use an installed compatible version. SDK/runtime detection does not install
   either component.
2. Build the shared core and console adapter. Pack the adapter as a .NET tool at
   the exact version named by the local UI tool's `pptb.config.json` declaration.
3. Place the `.nupkg` in the explicitly configured **developer-only local feed**.
   PR7 still has to implement an app-owned setting or equivalent trusted source
   configuration; a tool cannot provide a feed path through its manifest or API.
4. In an unpackaged PPTB development build, choose **Load Local Tool** and load
   the npm UI package from its working directory.
5. Start the declared worker explicitly from the tool. Review native-code consent,
   wait for package verification and the protocol handshake, then run the test
   query. Answer any worker-to-tool Dataverse request through `dataverseAPI`.
6. Inspect the returned result/progress, try cancellation, then stop or close the
   tool. Repack with a fresh exact version after changing worker package bytes.

## Worker Package Example

After PR7, the author-side build should resemble:

```sh
dotnet restore path/to/Worker.csproj
dotnet publish path/to/Worker.csproj --configuration Debug --framework net10.0
dotnet pack path/to/Worker.csproj --configuration Release --output path/to/local-feed
```

The published tool must contain the console entry point, shared core DLL and
managed dependencies. Use the same exact package ID/version/command as the UI
tool declaration. These commands only build/package artifacts; there is currently
no PPTB local-feed selection or callable worker API.

## Required Smoke Cases

- Correct consent and package/version display; denial causes no restore or launch.
- Local UI tool resolves its own declared worker, never another tool's package.
- Missing SDK, worker runtime, package, command or incompatible protocol gives a
  clear error and leaves no apparently usable partial cache.
- Exact local feed package restores; warm reuse works; changed bytes/source/version
  invalidate cached preparation and persistent consent.
- Initialize succeeds before domain traffic. The worker can issue a reverse
  FetchXML/metadata request while the original operation remains pending.
- Progress, Unicode JSON, multiple correlated requests, cancellation, worker
  exit, stop, renderer close/navigation and app quit behave as documented.
- A package available only from the local feed is rejected in packaged builds
  and by marketplace/registry installation. Those flows remain nuget.org-only.
- No token, connection secret or inherited credential environment reaches the
  native worker. The process is trusted same-user code, not an OS sandbox.

## Test Environment Notes

- PR0 exercised SQL 4 CDS 10.5.1 on macOS arm64 with the .NET 8 runtime using a
  simulated, narrow organization-locale callback. It did not verify a live query,
  .NET 10, local NuGet feeds, or the PPTB broker.
- This environment previously had .NET 8/9 SDKs but no .NET 10 SDK. A local
  end-to-end PR7 test requires an installed compatible .NET 10 SDK; do not silently
  install one as part of loading an npm tool.
- Full Windows/macOS/Linux RID qualification and packaged-app behavior remain PR8.

See the [PR7 plan](../.github/plans/plan-dotnet-workers-pr7.md) and
[delivery tracker](DOTNET_WORKERS_STATUS.md). PR7 remains not started until a
separate approval to begin implementation.
