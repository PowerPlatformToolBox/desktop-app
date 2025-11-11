# Application Icon Guidelines

## Overview

This document describes the icon requirements and best practices for the Power Platform Tool Box application. Following these guidelines helps prevent antivirus false positives and ensures proper icon display across different operating systems and resolutions.

## Icon Specifications

### Windows (`.ico`)

**Location:** `icons/icon.ico`

**Requirements:**
- Must include multiple icon sizes in a single ICO file
- Required sizes: 16x16, 32x32, 48x48, 256x256
- Recommended sizes: 16, 32, 48, 64, 96, 128, 256
- Format: Windows ICO with embedded PNG or BMP images
- Typical file size: 100-200KB for multi-resolution icon

**Why Multiple Sizes Matter:**
- Windows displays icons at different sizes in various contexts (taskbar, Alt+Tab, file explorer, etc.)
- Single-size icons can trigger antivirus false positives
- Multi-resolution icons provide better visual quality at all sizes
- Follows Microsoft's official icon guidelines

### macOS (`.icns`)

**Location:** `icons/icon.icns`

**Requirements:**
- ICNS format with multiple icon representations
- Required sizes: 16x16, 32x32, 128x128, 256x256, 512x512
- Includes both 1x and 2x (Retina) versions
- Format: Apple ICNS
- Typical file size: 50-100KB

### Linux (`.png`)

**Location:** `icons/icon256x256.png`

**Requirements:**
- PNG format
- Recommended size: 256x256 or 512x512
- Transparent background
- Format: PNG with alpha channel

## Creating Icons

### Using ImageMagick (Recommended)

To create a multi-resolution ICO file from a source PNG:

```bash
# Install ImageMagick
sudo apt-get install imagemagick  # Linux
brew install imagemagick           # macOS

# Create ICO with multiple sizes
convert source-icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icons/icon.ico
```

### Using Online Tools

Alternatively, you can use online tools:
- [ICO Convert](https://icoconvert.com/)
- [Favicon.io](https://favicon.io/)
- [CloudConvert](https://cloudconvert.com/png-to-ico)

When using online tools, ensure you select multiple output sizes.

### Using macOS iconutil

For creating ICNS files on macOS:

```bash
# Create iconset directory structure
mkdir icon.iconset

# Add PNG files at required sizes
# icon_16x16.png, icon_16x16@2x.png, icon_32x32.png, etc.

# Convert to ICNS
iconutil -c icns icon.iconset -o icons/icon.icns
```

## Troubleshooting Antivirus False Positives

### Common Causes

1. **Single-size ICO files** - The most common trigger
2. **Unusual icon dimensions** - Non-standard sizes can trigger heuristics
3. **High compression** - Overly compressed icons may appear suspicious
4. **Missing icon metadata** - Improperly formatted ICO headers

### Resolution Steps

If antivirus software flags your build:

1. **Rebuild the icon with multiple sizes** (most effective)
2. **Verify icon format** with `file icons/icon.ico`
3. **Check icon size** - should be 100KB+ for multi-resolution
4. **Use standard dimensions** - 16, 32, 48, 64, 96, 128, 256
5. **Sign your code** - Code signing certificate reduces false positives

## Historical Context

### v1.0.5 Issue

In v1.0.5, the application icon was updated to use a single 256x256 PNG embedded in the ICO file (20KB). This triggered false positives in Windows Defender and other antivirus software, preventing users from downloading and installing the application.

### v1.0.6 Fix

The icon was rebuilt to include 7 different sizes (16, 32, 48, 64, 96, 128, 256) in the ICO file, increasing the file size to 154KB. This follows Microsoft's recommended practices and eliminated the false positive detections.

## Verification

After creating or updating icons, verify them:

```bash
# Check ICO file
file icons/icon.ico
# Should show: MS Windows icon resource - N icons...

# Check ICNS file
file icons/icon.icns
# Should show: Mac OS X icon...

# Check icon size
ls -lh icons/
# ICO should be 100KB+, ICNS should be 50KB+
```

## References

- [Microsoft Windows Icon Guidelines](https://docs.microsoft.com/en-us/windows/win32/uxguide/vis-icons)
- [Apple Human Interface Guidelines - App Icon](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Electron Builder Icon Documentation](https://www.electron.build/icons)
- [ImageMagick ICO Format](https://imagemagick.org/script/formats.php#ico)

## Maintenance

When updating the application icon:

1. Update the source PNG in `assets/` directory
2. Regenerate ICO file with multiple sizes
3. Regenerate ICNS file if needed
4. Test build locally before releasing
5. Update version number in `package.json`
6. Document changes in CHANGELOG.md
