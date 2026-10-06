# Native Worker Consent (PR5)

Native workers execute code as the current operating-system user. They are **not
sandboxed**: code can access the same-user filesystem, use the network, and start
child processes with that user's permissions. Consent is a trust decision, not a
security boundary, an administrator elevation, or permission to silently install
a .NET runtime. Users must explicitly install any missing runtime themselves.

PR5 implements policy and trusted UI only. It never authorizes a launch on its
own, starts a worker, downloads a package, or installs a runtime. There is no
tool-facing approval or launch-request API.

## Source Organization

The trusted native-worker prompt and approval review live in
[nativeWorkerConsentModal.ts](../src/renderer/modules/consent/nativeWorkerConsentModal.ts)
and [consentReviewManagement.ts](../src/renderer/modules/consent/consentReviewManagement.ts).
The same `src/renderer/modules/consent/` directory groups the CSP, Dataverse-header
and Sentry consent modules without changing their APIs or modal implementation.

Filesystem IPC uses `authorizeFilesystemCaller` in
[filesystemAuthorization.ts](../src/main/utilities/filesystemAuthorization.ts)
to recognize the exact main sender or a known tool instance. It delegates path
permission validation to the existing `ToolFileSystemAccessManager`; it does not
replace that manager or the low-level filesystem utilities.

## Internal Contract

`NativeWorkerConsentManager.authorize(sender: WebContents, workerId: string)` is
main-process-only. The injected identity resolver looks up the live sender in
`ToolWindowManager`, obtains the real tool identity/version, and resolves the
worker declaration from canonical package/config metadata. In the app constructor,
the resolver rereads package.json and pptb.config.json; it fails closed if package
version no longer matches the loaded tool or the declaration is unavailable.
Neither tool identity nor a declaration is accepted as renderer authority.

PR6 can call this method from its broker once it exists. No call is wired in PR5.
The returned approval is a frozen snapshot, not a process handle. PR6 must bind
the subsequent launch to this exact snapshot, check that the installed source is
still current at launch, and honor revocation throughout asynchronous launch work.
Consent does not validate the bytes of a future downloaded package, nor protect
against an already-running same-user process modifying the user's files.

## Fingerprint And Persistence

The SHA-256 fingerprint covers an explicitly ordered JSON object containing:

- Tool ID and exact tool version, plus worker ID.
- Canonical native declaration: kind, package ID/version, command, target framework,
  minimum runtime, effective roll-forward, and sorted platform aliases.
- Fixed NuGet source `https://api.nuget.org/v3/index.json` (nuget.org only).
- Internal protocol version `1` and platform matrix version `1`.

Omitted roll-forward and explicit `Major` are identical. NuGet package ID casing
and platform order are normalized. `Latest` is displayed as native `LatestMajor`.
Tool display names are descriptive, not authority. Local development declarations
use the same actual canonical native fields: changes with an unchanged tool version
still require approval. Absolute machine paths are never part of records/prompts.
Unrelated local config sections are outside this native-worker consent scope.

Approvals are held in SettingsManager's separate `native-worker-consents` store,
as descriptor records keyed by SHA-256 fingerprint, with `approvedAt` ISO
timestamps. This store is not the generic user/tool settings store and is not
writable through generic settings IPC. The manager reconstructs records from
canonical fields and ignores malformed rows, mismatched hashes, invalid dates,
non-nuget.org sources, and stale protocol/platform versions. Construction rewrites
sanitized rows. Extra record fields are dropped; unknown native declaration fields
are invalid. Rejection and allow-once never persist a record.
Dictionary keys that do not match their record fingerprint are also discarded.

## Trusted UI IPC

Only the main application's exact current `WebContents` object can invoke the
following channels. Both IPC handlers and manager controller methods enforce this
check; tools cannot bypass it by invoking channels directly or spoofing a numeric ID.

| Channel                         | Main Preload Method                                 | Manager Method                         |
| ------------------------------- | --------------------------------------------------- | -------------------------------------- |
| `native-worker-consent:get-all` | `getNativeWorkerConsents()`                         | `getAll(sender)`                       |
| `native-worker-consent:revoke`  | `revokeNativeWorkerConsent(fingerprint)`            | `revoke(sender, fingerprint)`          |
| `native-worker-consent:respond` | `respondToNativeWorkerConsent(requestId, decision)` | `respond(sender, requestId, decision)` |

Outbound events go only to the main window:

- `native-worker-consent:request`, subscribed through `onNativeWorkerConsentRequest`.
- `native-worker-consent:closed`, subscribed through `onNativeWorkerConsentClosed`.

Both subscriptions return listener cleanup functions. These methods are added only
to the main preload, not the tool preload or shared tool API interface. The private
`NativeWorkerConsentUI` type describes this main-only bridge.

The modal offers `allow-tool`, `allow-once`, and `reject`. Persistent approval is
limited to the displayed tool version and worker fingerprint, not all future
versions or arbitrary code. It shows package/version/source, runtime, effective
roll-forward, platforms and trust scope. Labels and metadata use `textContent`,
never HTML parsing. Fluent dialog/buttons have accessible roles, initial Reject
focus, keyboard activation, a focus loop, Escape rejection, and focus restoration.
Consent Review includes native approval details, refresh and per-fingerprint revoke.

## Lifecycle And Revocation

Concurrent calls with the same fingerprint share one prompt and independent
owners. A closed or changed caller is rejected without invalidating another live,
unchanged caller. Each queued prompt has a 120-second deadline starting when
created. Missing/destroyed UI, failed delivery, timeout and disposal reject pending
calls and clear timers/listeners. A decision rechecks live caller declarations;
authorization rechecks again after its asynchronous continuation, including cached
approvals. Invalid/stale responses do not grant consent.

Revocation deletes only the targeted fingerprint and cancels its pending prompt.
An internal `revoked` event carries `{ fingerprint }`; future PR6 should subscribe
and stop/cancel matching worker instances and launches. PR5 stops no processes
because none exist in this PR. A revoke after prompt settlement but before the
authorization continuation rejects that authorization. Already-returned approvals
cannot be retrospectively unreturned: the future broker must honor the event and
revalidate immediately before executing native code.

## Validation

The focused Node/Jest suite is
`tests/unit/main/managers/nativeWorkerConsentManager.test.ts`. It uses fake
WebContents, fake timers and mocked persistence, without an Electron GUI. It
covers sender spoofing, decisions, identity/version/native-field changes,
normalization, duplicate-owner closure/mutation, stale responses, pending/settled
revocation races, UI loss, timeouts, disposal, persistence failure and sanitation.
A pure disclosure formatter test runs in the existing Node environment; no jsdom
or other test framework was introduced.

Run:

```sh
pnpm run test:unit --runInBand tests/unit/main/managers/nativeWorkerConsentManager.test.ts
pnpm run typecheck
pnpm run lint
pnpm run build
```

Manual Electron checks after a successful build: open Consent Review; verify
empty/error/granted/revoked states and long metadata in light/dark themes. Once a
trusted main-process broker can prompt, verify focus containment, Reject/Allow Once/
Trust decisions, Escape, closure/timeout, keyboard navigation and same-user warning
at narrow and wide window sizes. PR5 intentionally exposes no renderer launch
method solely to trigger this test.
