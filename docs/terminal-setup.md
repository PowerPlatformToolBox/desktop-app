# Terminal Setup Guide

This guide provides instructions for setting up and configuring the terminal environment in Power Platform Tool Box to work with various shell customizations, including Oh-My-Posh, Starship, and other prompt themes.

## Overview

The Power Platform Tool Box terminal manager creates shell instances that run in both **login** and **interactive** modes to ensure your shell profile configurations are properly loaded. This means:

- On Unix-like systems (Linux/macOS): The shell is started with `-l -i` flags, loading both login profiles (`.bash_profile`, `.zprofile`, etc.) and interactive profiles (`.bashrc`, `.zshrc`, etc.)
- On Windows: PowerShell is started with `-NoLogo -NoExit` flags, and cmd.exe with `/Q` flag

## Environment Variables

The terminal manager automatically sets these environment variables to ensure proper rendering:

- **`TERM`**: Set to `xterm-256color` for 256-color support
- **`COLORTERM`**: Set to `truecolor` for full RGB color support

These settings enable proper rendering of themes, prompts, and color schemes like Oh-My-Posh.

## ANSI Color Support

The Power Platform Tool Box terminal includes full ANSI escape code support:

- **True Color (24-bit RGB)**: Supports modern prompt themes with millions of colors
- **256 Color Palette**: Standard extended terminal colors
- **Text Formatting**: Bold, italic, underline, strikethrough, dim, and more
- **Background Colors**: Full color support for text backgrounds
- **Automatic Rendering**: ANSI codes are automatically converted to properly colored HTML

This means Oh-My-Posh themes, Starship prompts, and other terminal customizations will display correctly with all their colors, icons, and formatting.

## Oh-My-Posh Setup

[Oh-My-Posh](https://ohmyposh.dev/) is a popular prompt theme engine that works across multiple shells. Here's how to set it up for use with Power Platform Tool Box.

### Prerequisites

1. **Install Oh-My-Posh**: Follow the [official installation guide](https://ohmyposh.dev/docs/installation)

   **Linux:**
   ```bash
   curl -s https://ohmyposh.dev/install.sh | bash -s
   ```

   **macOS:**
   ```bash
   brew install oh-my-posh
   ```

   **Windows:**
   ```powershell
   winget install JanDeDobbeleer.OhMyPosh -s winget
   ```

2. **Install a Nerd Font**: Oh-My-Posh requires a Nerd Font for proper icon rendering
   - Download from [Nerd Fonts](https://www.nerdfonts.com/)
   - Popular choices: `FiraCode Nerd Font`, `JetBrains Mono Nerd Font`, `Meslo LGM NF`
   - Install the font on your system
   - Configure your terminal/application to use the installed Nerd Font

### Shell Configuration

Add the Oh-My-Posh initialization command to your shell profile:

#### Bash (~/.bashrc or ~/.bash_profile)

```bash
# Oh-My-Posh initialization
if command -v oh-my-posh &> /dev/null; then
    eval "$(oh-my-posh init bash --config ~/.poshthemes/jandedobbeleer.omp.json)"
fi
```

#### Zsh (~/.zshrc)

```bash
# Oh-My-Posh initialization
if command -v oh-my-posh &> /dev/null; then
    eval "$(oh-my-posh init zsh --config ~/.poshthemes/jandedobbeleer.omp.json)"
fi
```

#### PowerShell (Microsoft.PowerShell_profile.ps1)

```powershell
# Oh-My-Posh initialization
if (Get-Command oh-my-posh -ErrorAction SilentlyContinue) {
    oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH\jandedobbeleer.omp.json" | Invoke-Expression
}
```

**Note**: Replace `jandedobbeleer.omp.json` with your preferred theme. You can browse themes at [Oh-My-Posh Themes](https://ohmyposh.dev/docs/themes).

### Downloading Themes

Oh-My-Posh comes with many built-in themes. To use them:

```bash
# Create themes directory
mkdir -p ~/.poshthemes

# Download all themes
oh-my-posh config export --format json --output ~/.poshthemes/
```

Or download a specific theme:

```bash
curl -o ~/.poshthemes/mytheme.omp.json https://raw.githubusercontent.com/JanDeDobbeleer/oh-my-posh/main/themes/jandedobbeleer.omp.json
```

### Verifying Installation

To verify Oh-My-Posh is working in the Power Platform Tool Box terminal:

1. Create a terminal in a tool using the ToolBox API
2. Check if the prompt renders correctly with icons and colors
3. Run: `oh-my-posh --version` to confirm it's accessible
4. Run: `echo $TERM` (Unix) or `$env:TERM` (PowerShell) to verify terminal type is set correctly

### Debugging Oh-My-Posh Issues

If Oh-My-Posh doesn't render correctly, add debug logging to your shell profile:

#### Bash/Zsh Debug

```bash
# Add to ~/.bashrc or ~/.zshrc
echo "[DEBUG] Shell initialization started" >&2
echo "[DEBUG] TERM=$TERM, COLORTERM=$COLORTERM" >&2
echo "[DEBUG] Oh-My-Posh path: $(which oh-my-posh)" >&2

if command -v oh-my-posh &> /dev/null; then
    echo "[DEBUG] Initializing Oh-My-Posh..." >&2
    eval "$(oh-my-posh init bash --config ~/.poshthemes/jandedobbeleer.omp.json)"
    echo "[DEBUG] Oh-My-Posh initialized successfully" >&2
else
    echo "[DEBUG] Oh-My-Posh not found in PATH" >&2
fi
```

#### PowerShell Debug

```powershell
# Add to Microsoft.PowerShell_profile.ps1
Write-Host "[DEBUG] PowerShell profile loading..." -ForegroundColor Yellow
Write-Host "[DEBUG] PSVersion: $($PSVersionTable.PSVersion)" -ForegroundColor Yellow

if (Get-Command oh-my-posh -ErrorAction SilentlyContinue) {
    Write-Host "[DEBUG] Initializing Oh-My-Posh..." -ForegroundColor Yellow
    oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH\jandedobbeleer.omp.json" | Invoke-Expression
    Write-Host "[DEBUG] Oh-My-Posh initialized" -ForegroundColor Green
} else {
    Write-Host "[DEBUG] Oh-My-Posh not found" -ForegroundColor Red
}
```

The debug output will appear in the terminal when it's created, helping you identify configuration issues.

## Other Prompt Themes

### Starship

[Starship](https://starship.rs/) is another popular cross-shell prompt.

**Installation:**
```bash
curl -sS https://starship.rs/install.sh | sh
```

**Configuration (add to shell profile):**

Bash/Zsh:
```bash
if command -v starship &> /dev/null; then
    eval "$(starship init bash)"  # or "starship init zsh" for Zsh
fi
```

PowerShell:
```powershell
if (Get-Command starship -ErrorAction SilentlyContinue) {
    Invoke-Expression (&starship init powershell)
}
```

### Powerlevel10k (Zsh)

[Powerlevel10k](https://github.com/romkatv/powerlevel10k) is a Zsh theme.

**Installation:**
```bash
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/powerlevel10k
```

**Configuration (~/.zshrc):**
```bash
source ~/powerlevel10k/powerlevel10k.zsh-theme
```

## Font Configuration

For proper rendering of icons and special characters, ensure:

1. **System Font Installation**: Install a Nerd Font on your system
2. **Application Font Setting**: Configure the terminal font in Power Platform Tool Box settings (Settings → Terminal Font)
3. **Font Fallback**: Some themes work better with specific fonts - test different Nerd Fonts if you see rendering issues

### Setting Terminal Font in Power Platform Tool Box

The application includes a built-in terminal font selector:

1. Open the **Settings** sidebar (click the gear icon in the Activity Bar)
2. Find the **Terminal Font** dropdown
3. Select your preferred font:
   - **Consolas / Monaco (Default)**: Standard monospace fonts available on most systems
   - **JetBrains Mono**: Clean and readable, great for coding
   - **Fira Code**: Popular font with ligature support
   - **Cascadia Code**: Microsoft's modern monospace font
   - **MesloLGS Nerd Font**: Recommended by Oh-My-Posh
   - **FiraCode Nerd Font**: Fira Code with Nerd Font icons
   - **JetBrains Mono Nerd Font**: JetBrains Mono with Nerd Font icons
4. The font will be applied immediately to all terminal instances
5. Click **Save Settings** to persist your choice

**Note**: The selected font must be installed on your system. Nerd Font variants include special icons required by Oh-My-Posh and similar themes.

### Recommended Nerd Fonts

- **FiraCode Nerd Font**: Great for coding with ligatures
- **JetBrains Mono Nerd Font**: Clean and readable
- **Meslo LGM NF**: Recommended by Oh-My-Posh
- **Hack Nerd Font**: Popular among developers

## Common Issues and Solutions

### Issue: Prompt shows squares or question marks instead of icons

**Solution**: 
- Install a Nerd Font
- Configure your terminal application to use the Nerd Font
- Verify the font supports the icons your theme uses

### Issue: No colors in prompt

**Solution**:
- Check that `TERM` is set to `xterm-256color` (run `echo $TERM`)
- Check that `COLORTERM` is set to `truecolor` (run `echo $COLORTERM`)
- The terminal manager sets these automatically, but they can be overridden in your shell profile

### Issue: Oh-My-Posh command not found

**Solution**:
- Verify Oh-My-Posh is installed: `which oh-my-posh` (Unix) or `Get-Command oh-my-posh` (PowerShell)
- Check your PATH includes the Oh-My-Posh installation directory
- On Linux/macOS, ensure `~/.local/bin` or `/usr/local/bin` is in your PATH
- Reinstall Oh-My-Posh if necessary

### Issue: Profile not loading in terminal

**Solution**:
- Check that your shell profile file exists and is readable
- Verify the file path is correct (e.g., `~/.bashrc` for Bash, `~/.zshrc` for Zsh)
- Add debug logging to your profile to see if it's being executed
- The terminal manager uses `-l -i` flags for Unix shells to load both login and interactive profiles

### Issue: Slow terminal startup

**Solution**:
- Oh-My-Posh and other prompt engines can slow down shell startup
- Use conditional loading to only load the prompt engine when needed
- Consider using a simpler theme or optimizing your shell configuration
- Remove unnecessary commands from your shell profile

## Shell-Specific Configuration Files

Understanding which files are loaded helps with debugging:

### Bash

**Login shells** (loaded with `-l` flag):
1. `/etc/profile`
2. `~/.bash_profile` (or `~/.bash_login` or `~/.profile`)

**Interactive shells** (loaded with `-i` flag):
1. `/etc/bash.bashrc` (on some systems)
2. `~/.bashrc`

**Power Platform Tool Box uses**: `-l -i` (both)

### Zsh

**Login shells**:
1. `/etc/zshenv`
2. `~/.zshenv`
3. `/etc/zprofile`
4. `~/.zprofile`

**Interactive shells**:
1. `/etc/zshrc`
2. `~/.zshrc`

**Power Platform Tool Box uses**: `-l -i` (both)

### PowerShell

**Profile paths** (use `$PROFILE` to see current user profile):
- All Users, All Hosts: `$PSHOME\Profile.ps1`
- All Users, Current Host: `$PSHOME\Microsoft.PowerShell_profile.ps1`
- Current User, All Hosts: `~\Documents\PowerShell\Profile.ps1`
- Current User, Current Host: `~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`

## Testing Your Configuration

To test if your prompt configuration works in Power Platform Tool Box:

1. **Create a test tool** or use the terminal example from `docs/examples/terminal-example.html`
2. **Create a terminal** using the ToolBox API
3. **Check the prompt rendering** - you should see your configured theme
4. **Verify colors and icons** render correctly
5. **Check debug output** if you added debug logging to your profile

Example test code:

```javascript
const context = await window.toolboxAPI.getToolContext();
const terminal = await window.toolboxAPI.createTerminal(context.toolId, {
    name: 'Test Terminal',
    shell: '/bin/bash' // or your preferred shell
});

// Wait for terminal initialization and check the output
```

## Environment Variable Reference

The terminal manager inherits and sets the following important environment variables:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `TERM` | Terminal type for color/feature support | `xterm-256color` |
| `COLORTERM` | Indicates true color support | `truecolor` |
| `HOME` | User home directory | Inherited from parent process |
| `USER` | Current username | Inherited from parent process |
| `PATH` | Executable search paths | Inherited from parent process |
| `SHELL` | Default shell path | Inherited from parent process |
| `PWD` | Current working directory | Set by terminal cwd option |

You can also pass custom environment variables when creating a terminal:

```javascript
const terminal = await window.toolboxAPI.createTerminal(context.toolId, {
    name: 'Custom Env Terminal',
    env: {
        MY_CUSTOM_VAR: 'value',
        ANOTHER_VAR: 'another value'
    }
});
```

## Additional Resources

- [Oh-My-Posh Documentation](https://ohmyposh.dev/docs/)
- [Starship Documentation](https://starship.rs/guide/)
- [Nerd Fonts](https://www.nerdfonts.com/)
- [Terminal Color Codes](https://misc.flogisoft.com/bash/tip_colors_and_formatting)
- [Bash Startup Files](https://www.gnu.org/software/bash/manual/html_node/Bash-Startup-Files.html)
- [Zsh Startup Files](http://zsh.sourceforge.net/Intro/intro_3.html)

## Contributing

If you find issues with terminal configuration or have suggestions for improvements, please:

1. Check existing issues on the [GitHub repository](https://github.com/PowerPlatformToolBox/desktop-app/issues)
2. Create a new issue with:
   - Your operating system and version
   - Shell type and version
   - Prompt engine and theme
   - Steps to reproduce the issue
   - Screenshots if applicable

## Summary

The Power Platform Tool Box terminal is designed to work seamlessly with shell customizations like Oh-My-Posh by:

1. Starting shells in both login and interactive modes
2. Setting proper terminal environment variables (TERM, COLORTERM)
3. Inheriting all parent environment variables
4. Allowing custom environment variables
5. Supporting all major shells (Bash, Zsh, PowerShell, etc.)

With proper font and shell profile configuration, your terminal should render prompts and themes exactly as they appear in your regular terminal.
