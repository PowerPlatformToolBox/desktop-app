# Internal Worker Process Transport (PR4)

PR4 supplies a main-process-only managed stdio transport. PR6 now constructs it
through [the internal broker](WORKER_BROKER.md). Nothing exports it from the common type barrel or exposes it
through IPC, preload, renderer, public tool API or terminal execution. PR0 and
the parallel PR3/PR5 implementation files are unchanged. This is not permission
to execute native code, a sandbox, a package resolver or a Dataverse adapter.

## Dependency And Runtime Handoff

`vscode-jsonrpc` 8.2.1 is now in production dependencies with the pnpm lockfile
updated. PR4
intentionally imports `vscode-jsonrpc/node` for the production reader/writer;
leaving it development-only would not be an approved shipping configuration.
Production build passed; packaged availability remains a PR8 qualification gate.

No Electron/Node version change is required by this implementation. Installed
.NET SDK/runtime selection stays with PR2 and prepared package/binary identity
with PR3. PR4 does not acquire a runtime or fall back to PATH. Real platform
qualification and packaged execution remain future gates.

## Internal PR6 Integration Surface

Types are private in `src/common/types/workerProcess.ts`. The manager constructor
takes `WorkerProcessDependencies`:

```typescript
prepare(owner: WorkerOwner, workerId: string, signal: AbortSignal): Promise<WorkerLaunchDescriptor>;
launch?(descriptor: WorkerLaunchDescriptor, options: WorkerLaunchOptions): WorkerChild;
killTree?(pid: number, platform: NodeJS.Platform): Promise<void>;
platform?: NodeJS.Platform;
limits?: Partial<WorkerProcessLimits>;
```

The instance methods are:

```typescript
start(owner: WorkerOwner, workerId: string): WorkerProcessStart;
snapshot(owner: WorkerOwner, handle: WorkerProcessHandle): WorkerProcessSnapshot;
send(owner: WorkerOwner, handle: WorkerProcessHandle, message: unknown): Promise<void>;
onMessage(owner: WorkerOwner, handle: WorkerProcessHandle, callback: (message: WorkerRpcMessage) => void): () => void;
stop(owner: WorkerOwner, handle: WorkerProcessHandle): Promise<void>;
disposeOwner(owner: WorkerOwner): Promise<void>;
```

`WorkerOwner` is `{ toolId, instanceId }`; `WorkerProcessStart` contains an opaque
random `handle` and a `ready: Promise<void>`. `start` reserves the declaration
immediately and returns while preparation/initialization is in progress. Every
handle operation, including unsubscribe, checks the same owner pair. Wrong or
expired handles yield `NOT_AUTHORIZED` without revealing another owner's state.
No executable, arguments, environment, PID or cwd is exposed in snapshots.
Error text is a stable sanitized `WorkerProcessError.code`, not a native error.

PR6 must derive ownership from authenticated main-process instance context,
never accept it as renderer authority. It must implement PR5 consent and
fingerprint gates, declaration lookup and PR3 prepared-artifact revalidation in
the injected factory before returning a descriptor. Validate the requested ID
against the current installed declaration; syntactic ID validation in PR4 is
not declaration authorization. The factory must honor cancellation and clean
its own preparation resources. A descriptor is not durable permission or proof
against filesystem replacement races.

The descriptor shape is `{ executable, args, cwd, env }`. Only that trusted
factory can supply it; `start` accepts no renderer-selected command or path.
PR3 will need a narrow main-process adapter from its prepared-artifact contract
to this descriptor. PR4 does not depend on, mutate or guess the concurrent PR3
artifact type. The adapter must return the verified absolute host, controlled
payload arguments/cwd, DOTNET_ROOT and effective native roll-forward selection.
Paths are absolute and bounded, arguments/count are bounded, and extra fields,
accessors, controls and unapproved environment names fail before launch. The
manager copies and freezes descriptor, args, environment and owner.

The default environment is constructed without copying `process.env`: fixed
telemetry/first-run/workload suppression and English/C locale. Only an absolute
DOTNET_ROOT, Disable/LatestMajor/Minor/Major DOTNET_ROLL_FORWARD, and matching
fixed values can be added. Windows uses fixed `C:\Windows` SystemRoot/WINDIR.
No PATH, home, token, credential, startup hook or resolver override is inherited.
Arguments must not embed credentials; the trusted resolver owns that invariant.
Alternate Windows system roots need a future trusted host configuration design.

Default launch is absolute `spawn`, `shell: false`, three piped streams,
`windowsHide: true`, and a detached POSIX process group (not detached on Windows).
An injected launcher must obey these options and return exclusively host-owned
child streams/PID before emitting lifecycle events. It is a trusted testing/host
boundary, not a plugin extension point.

## Readiness Contract

Workers must intentionally implement this protocol. PR0 proves the underlying
wire/callback model but its fixture does not implement this startup contract;
PR0 is left unchanged and is not a production-ready PR4 worker.

The host sends one JSON-RPC request with a fresh reserved string ID:

```json
{
    "jsonrpc": "2.0",
    "id": "pptb:initialize:<opaque-random-id>",
    "method": "platform/initialize",
    "params": { "protocol": "jsonrpc-stdio-v1", "protocolVersion": 1 }
}
```

The worker must reply with the identical ID and exactly:

```json
{
    "jsonrpc": "2.0",
    "id": "pptb:initialize:<opaque-random-id>",
    "result": { "protocol": "jsonrpc-stdio-v1", "protocolVersion": 1 }
}
```

There are no extra readiness fields in v1. An error, incompatible result,
duplicate matching response, reserved inbound platform method or timeout
fail-stops the worker. Unrelated valid traffic is bounded and queued during
startup, not treated as readiness. Ten seconds covers preparation, launch and
initialize by default. PR6 defers this protocol deadline until launch, leaving
consent/discovery/restore independently bounded. Factory rejection, process error or exit during startup rejects
`ready`; stopping also rejects an unsettled `ready`. No domain request is sent
by the manager before or after initialization.

## Framing And Resource Limits

The established `StreamMessageReader` and `StreamMessageWriter` implement
Content-Length framing. The reader is preceded by `BoundedWorkerReader` because
the library itself buffers before validating length and queues asynchronous
decodes. The gate collects only a bounded header, validates length before body
allocation, and feeds one complete admitted frame at a time to the library.
Completed frames waiting for decoding have aggregate byte/count limits.
Chunk boundaries, coalesced frames and split multi-byte UTF-8 are supported.

The v1 header is strict ASCII CRLF with one case-insensitive Content-Length
containing a positive canonical decimal byte count. Optionally one Content-Type
of `application/vscode-jsonrpc; charset=utf-8` or `application/json; charset=utf-8`
is accepted. Unknown/duplicate headers, LF-only framing, control bytes, leading
zeroes, invalid/signed lengths and encoding/compression overrides fail closed.
Partial headers/bodies have a timeout and truncated EOF fails immediately.
UTF-8 decoding is fatal; invalid JSON, JSON batches, invalid envelope shapes,
non-finite numbers and excessive nesting fail-stop. JSON-RPC IDs are strings or
safe integers (null is permitted only in responses). Envelopes may contain only
standard request/notification/response fields; params are objects or arrays.

| Resource                                | Default                      |
| --------------------------------------- | ---------------------------- |
| JSON body                               | 1 MiB                        |
| Header                                  | 1 KiB                        |
| Pending inbound frames                  | 64 / 4 MiB including headers |
| Pending outbound writes                 | 64 / 4 MiB including framing |
| Early messages                          | 64 / 4 MiB JSON bytes        |
| Subscribers                             | 64                           |
| Stderr counter                          | 16 KiB, capped               |
| Records and reserved live slots         | 256                          |
| Startup / partial frame / write timeout | 10 seconds each              |
| Graceful stop / tree termination wait   | 2 / 3 seconds                |

Injected limits can only tighten positive integer defaults. Additional bounded
JSON cloning/validation memory is proportional to admitted frame size, not an
unbounded decoder backlog. Native pipe/OS buffers and an upstream already-created
chunk are outside the JavaScript gate; the gate does not copy an oversized chunk
into an unbounded reader buffer. Outbound messages are checked, cloned and deeply
frozen before queuing. Invalid caller payloads reject locally; inbound invalidity
is fatal. No unbounded correlation map is created.

Writes are serialized, including initialization, against the library's write
completion callbacks. Pending count/byte accounting includes the active write.
Queue overflow rejects just the new send; write error/timeout fail-stops. A
resolved send means bytes were written, not that a worker method completed.

## Routing And Diagnostics

Requests, responses, notifications and `$/cancelRequest` retain their envelopes
and IDs. Only the startup request is correlated by the host. There is no domain
query replay, cancellation synthesis, SQL interpretation, capability bridge or
global message broadcast. PR7's browser-compatible adapter will own
domain/reverse-request correlation; PR6 only supplies targeted routing.

Messages received before subscription are queued with byte/count bounds. Once
running, the first active subscriber set drains early messages in arrival order;
later subscribers do not replay history. Unsubscribe removes that callback even
mid-delivery; subsequent messages wait boundedly if no subscribers remain.
Subscribers receive deeply frozen messages in registration order. A throwing
subscriber is removed without affecting other subscribers or logging its error.
Stop/exit clears subscriptions and queues and prevents late delivery.

Stderr is drained but **all text is redacted**, not heuristically scrubbed.
Snapshots return only capped byte count, truncation and `Worker stderr redacted`.
No stdout, stderr, package path, error body, token or diagnostic is sent to
telemetry. There are no production console calls.

## Lifecycle And Termination

States are starting, running, stopping, exited and failed. One declaration may
have one process/reserved preparation slot per owner instance; different declared
IDs and instances are independent. Retained terminal handles are bounded and
may expire when capacity is needed; `disposeOwner` removes that owner's records.

Stop rejects queued/active send promises, clears subscriptions and cancels
preparation. An active write may already have reached the worker: rejection is
not proof of non-execution. Normal stop waits for the active write before sending
an uncorrelated `platform/shutdown` notification, then closes stdin. Workers must
support stdin EOF as the authoritative shutdown signal; the notification may be
ignored. No host-owned shutdown correlation is retained. Failure closes stdin
without adding domain traffic. Both paths have a bounded force deadline.

The injected tree killer sees only the PID captured from a host-owned launch.
POSIX uses SIGKILL on that detached process group. Windows invokes fixed trusted
`C:\Windows\System32\taskkill.exe` with `/PID <integer> /T /F`, no shell,
no inherited environment, a two-second timeout and 4 KiB diagnostic bound.
There is no terminal command interpolation or caller-selected process target.
The tree-killer promise itself is time-bounded. A failed/timed-out kill or a
successful signal without an observed exit leaves the slot quarantined: a
replacement is forbidden until the old child reports exit. Later exit frees
only that exact handle's slot, not a replacement's reservation.

`stop` completion is a bounded cleanup result, **not a guarantee that an escaped
descendant is gone**; inspect the authorized snapshot for failures. Native code
can self-daemonize, change groups, spawn descendants which outlive a leader, or
escape Windows taskkill tree enumeration. This is trusted native execution under
the user account, not unlimited descendant containment. Stronger containment
(e.g. platform job objects) is future work, not a PR4 promise. Already-observed
leader exit avoids signaling a potentially reused PID. Kill failures must be
surfaced by the future host lifecycle integration, not silently retried as queries.

## Verification Status

New fake-child tests cover launch validation/options, immutable descriptors,
duplicate slots, startup mismatch/timeouts/errors, all-state cross-owner checks,
early routing/unsubscribe, cancellation/uncorrelated responses, fragmented Unicode,
coalesced/burst input, header/body/EOF safety, queue bounds, write callbacks,
shutdown/force races, quarantine, fixed platform kill paths and redacted stderr.
No real process, SDK, NuGet access or PR0 fixture is used by this suite.

Editor diagnostics were run immediately after edits. A test-view diagnostic
identified a jsonrpc writer excess-property error; the inline shutdown literal
was replaced with a typed message. That view subsequently retained the old
expression, so executable confirmation remains pending. A later external test
view refresh exposed Missing initialize request failures in the fake harness;
installed-library inspection showed its semaphores use setImmediate, not only
promises. The harness now keeps those callbacks real and flushes event-loop
turns without advancing lifecycle deadlines. The immediate diagnostic result
retained the earlier failures; a fresh focused run is required. No Jest, pnpm,
formatting, lint, build or git command was executed by this agent: no runner is
exposed in this session. See the PR4 plan execution log for commands the main
agent must run. Do not mark this PR runtime-qualified or shipping-ready yet.
