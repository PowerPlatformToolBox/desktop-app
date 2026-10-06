# Internal Worker Broker (PR6)

`WorkerBrokerManager` is a main-process facade. It is constructed at startup but
has no renderer-callable launch handler, preload method, public API export, MCP
entry point or terminal bypass. PR6 validation passed; PR7 remains a separate
implementation checkpoint.
Normal npm installation does not discover .NET, restore NuGet or start a worker.

## Authority And Readiness

The internal API accepts the actual `WebContents` and a declared worker ID.
Index wiring checks exact object membership in ToolWindowManager, not just the
numeric sender ID. The loaded tool ID/version/source comes from the launch
object; current installed metadata and canonical on-disk declarations must
still match. Unknown, main-window, destroyed, spoofed and undeclared callers fail.
Handles cannot be used by another instance, including the same tool's second UI.

Start reserves one slot per instance/declaration and returns an opaque handle
and `ready` promise. Its path is live identity -> consent lease -> installed
DotNet discovery -> freshly approved pinned preparation -> immutable descriptor
-> spawn -> `platform/initialize` negotiation. Discovery failure codes are
sanitized; raw CLI errors and protocol/stderr data are not logged.

Consent leases capture the approval revision before authorization, recheck the
canonical fingerprint and support allow-once without a persistent grant or a
second prompt. Preparation authority combines the consent fingerprint with a
SHA-256 source identity covering the loaded absolute/canonical real path and
package/config file bytes. Source changes invalidate an in-flight launch even
when the npm version and native declaration have not changed.

Checks run after async consent/discovery/preparation and immediately before
spawn. Optional preparation controls check live authority before filesystem
preparation, each SDK/restore command, publication and descriptor return.
`AbortSignal` reaches discovery probes and the preparation adapter, which strips
it from Node's `execFile` options and explicitly requests configured `SIGKILL`.
Cancellation produces `CANCELLED` and rolls back owned partial work only after
observed child `close`; an early callback or parent exit does not release the barrier. Controlled preparations
do not share another owner's cancellation context; filesystem locking still
excludes concurrent preparation of the same cache. A busy cache requires retry.

The launch uses only the verified absolute host, DLL/runtimeconfig/deps paths,
selected runtime version/native policy and app-owned cwd. No ambient PATH, auth
tokens, startup hooks, caller environment or caller command is accepted. The
protocol timeout starts at launch for broker calls, separately from the consent
deadline and bounded discovery/restore commands. Existing transport callers
retain their original preparation-inclusive startup timeout.

## Routing And Lifecycle

Internal methods are `start`, `send`, `onMessage`, `snapshot`, `stop`,
`disposeOwner`, `withToolMutation` and `shutdown`. Message callbacks are scoped
to the exact sender/handle and recheck live authority before delivery. The
transport retains bounded early messages until subscription. No worker data is
broadcast; no public event channels have been registered. PR7 must install its
targeted listener/adapter before starting, preserve these bounds, and own domain
request correlation and reverse callbacks.

The process manager's internal terminal subscription is owner/handle-scoped and
carries no protocol messages. After readiness, exit or error triggers verified
broker cleanup and releases launch/consent/subscription references. Only an
explicit new start can restart a successfully cleaned worker; no operation is
automatically replayed. Failed cleanup retains the launch as a blocker.

Confirmed tool close awaits only that owner's worker disposal before destroying
its view or other resources. Canceled close calls no disposal. Crash, destruction,
reload/navigation and redirect invalidate/dispose the actual owner. Explicit
navigation is delayed for cleanup; renderer-initiated document replacement
invalidates authority immediately. Electron cannot defer an already-destroyed
renderer, but the callback awaits bounded internal cleanup and handles failures.

Main-window update/uninstall gates block starts for the affected tool, cancel
pending launches and await preparation cleanup and verified process stop before
mutation. A failed stop or preparation timeout rejects mutation without deleting
an active package. A failed mutation releases its gate. Other tools remain live.
Cache eviction and concurrent warm-cache waiting are not implemented.

Cancellation is not cleanup evidence until preparation settles. Expected
`CANCELLED` settlement allows cleanup; `WORKSPACE_INVALID` rollback failure and
`RESTORE_STOP_UNVERIFIED` command-close verification failure
propagate through disposal, mutation and shutdown and retain the blocker.
Successful stop requires parent exit and stdout/stderr EOF or close. A forced
tree kill must be dispatched while the captured parent is still live, complete
successfully, and obtain bounded exit/pipe-close verification. The old PID or
process group is never signaled after observed parent exit.

If a parent exits while descendants retain output pipes, stop rejects
`STOP_UNVERIFIED`; it does not claim there are no orphans. Failed/unconfirmed
tree termination also quarantines the handle. Owner closure does not evict these
records or remove their tool-mutation/shutdown blockers. Operators must resolve
remaining processes/preparation failures manually; later observed pipe closure
can permit a cleanup retry, but failed tree dispatch or workspace rollback does
not become successful merely because the parent subsequently exits. EOF is a
bounded lifecycle check, not proof against native code detaching descendants
and deliberately closing every inherited pipe. Real OS qualification is pending.

An unverified preparation command retains its stage and filesystem lock. Future
preparation of that exact workspace remains blocked even after app restart;
restart does not establish native-process termination. Unlike a transport pipe
closure retry, late restore close does not automatically release this quarantine.
Trusted manual resolution must establish termination before removing retained
partial files/locks. An injected executor that never settles also retains the
broker blocker after `PREPARATION_STOP_TIMEOUT`; no forced deletion is allowed.

`WorkerQuitCoordinator` prevents Electron's first quit attempt, obtains any
prevent-close confirmation, and guards reentrancy. It waits for broker shutdown
before MCP/auth/tray cleanup, then retries quit through a committed guard.
Canceled confirmation preserves workers and unrelated subsystems. Stop failure
does not commit other cleanup. Tray/background hide does not call the broker.

## Validation And Limits

Focused tests use fake WebContents, injected discovery/preparation and fake child
streams with the established JSON-RPC reader. Preparation tests use temporary
files and injected commands. No test requires an SDK, NuGet network or Dataverse.
Main-agent verification passed: 1,067 full unit tests, focused broker/lifecycle
and preparation checks, five consent browser tests, typecheck, lint and production
build. Follow-up security review found no remaining blockers. See the PR6 execution
log for repair evidence. This is internal slice acceptance, not cross-platform
native qualification or a release of the public worker API.

Same-user native trust is not an OS sandbox. Source and cache hashes are not
signatures or proof against a same-user adversary replacing files between checks.
Actual .NET 10 restore, managed DLL loading and process-tree behavior on all
supported platforms remain PR8 qualification. No SDK download, API minVersion,
Dataverse proxy, automatic restart/query replay or public worker API is added.
