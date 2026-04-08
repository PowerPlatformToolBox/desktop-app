# Insider Channel Icons

Place the insider-specific application icons here:

| File | Platform | Description |
|------|----------|-------------|
| `icon.png` | macOS (tray) / Windows (window) | PNG — recommended 256×256 px; automatically resized to 16×16 for tray |
| `icon.icns` | macOS | macOS application bundle icon |
| `icon.ico` | Windows | Windows application icon (multi-resolution) |

These icons are used when the app is packaged with `PPTB_CHANNEL=insider` (i.e. via `pnpm run package:insider`).

If an insider icon is missing at runtime, the code falls back to the standard icon from the parent `icons/` directory.
