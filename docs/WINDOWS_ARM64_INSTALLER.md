# Windows ARM64 NSIS Payload Compatibility

The ARM64 NSIS configuration uses `useZip: true` and `differentialPackage: false`.
Keep these options together: electron-builder only selects a ZIP payload when
differential packaging is disabled. The Insider configuration inherits them.

The published 1.2.7 ARM64 EXE installer contained the application executable and
runtime DLLs, but each used the `ARM64 LZMA2` compression method. Its data files
used plain `LZMA2`. The reported NSIS installation retained the data files and
uninstaller but omitted the ARM64 executable and DLLs. The MSI installed correctly.
This pattern points to the older NSIS 7z extraction plugin not supporting the
ARM64 filter selected automatically by modern 7-Zip.

ZIP payloads use the NSIS ZIP extraction plugin instead, avoiding this filter.
This workaround can increase installer size and disables differential package
generation for ARM64. It does not change MSI, portable ZIP, or x64 packaging.

## Verification

Checking binaries in the unpacked directory or portable ZIP does not exercise
the NSIS extraction plugin. The release workflows do not add those diagnostic
checks; verification of this workaround requires installing the rebuilt EXE.

After rebuilding the ARM64 EXE installer:

1. Install it on Windows ARM64 into a clean destination directory.
2. Verify that `Power Platform ToolBox.exe` and the root runtime DLLs exist.
3. Launch the app from the installer finish page and its Start menu shortcut.
4. Verify uninstall works.
5. Repeat with the Insider installer.

Existing 1.2.7 installers are unchanged; affected users can use the working MSI
until a rebuilt EXE is available.
