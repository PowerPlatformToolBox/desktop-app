# Tool Maturity UI Local Testing

## Setup

Use registry data containing `maturity: "Verified"`, no maturity value, and an unrecognized value such as `maturity: "Community Recommended"`.

The built-in Supabase source reads `tool_maturity(status)` through the `tools` relationship. A missing `tool_maturity` row is treated as Unverified. Because the desktop app uses an anonymous key, the backend must grant public read access only to `tool_maturity.tool_id` and `tool_maturity.status`; review requests, reviewer identities, CSP snapshots, and change reasons must remain restricted.

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:unit -- tests/unit/renderer/toolMaturity.test.ts
pnpm exec playwright test tests/e2e/toolMaturity.spec.ts
pnpm run build
pnpm run dev
```

## Manual Checks

1. Open Marketplace and confirm Verified tools appear before other tools while each selected sort remains the order within those groups.
2. Confirm only `Verified` tools show the checkmark badge in standard and compact modes, in light and dark themes.
3. Hover and inspect the badge with a screen reader to verify its short explanation is available.
4. Enable **Verified only** in Marketplace and Installed; confirm only Verified tools remain and the existing empty state appears when none match.
5. In Installed, select **Maturity (Verified first)** and confirm Verified tools appear first, followed by name.
6. Change a tool's registry maturity, wait at least 30 seconds, then reload either list through navigation or a filter change. Confirm both views reflect the new status without restarting the app.
7. Confirm missing, `Unverified`, and unknown maturity values show no badge.
