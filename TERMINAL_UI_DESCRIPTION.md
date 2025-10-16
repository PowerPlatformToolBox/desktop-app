# Terminal Feature - UI Visual Description

Since we cannot run the Electron GUI in this environment, this document describes what the terminal UI looks like when running the application.

## Terminal Panel Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                     Main Application Window                      │
├─────────────────────────────────────────────────────────────────┤
│ Activity Bar │ Sidebar │      Main Content Area                 │
│              │         │                                         │
│   [Tools]    │         │    (Tools, Connections, Settings)       │
│   [Connect]  │         │                                         │
│   [Market]   │         │                                         │
│              │         │                                         │
│   [Settings] │         │                                         │
├──────────────┴─────────┴─────────────────────────────────────────┤
│ ═══════════════════ RESIZE HANDLE ═══════════════════════════  │ ← Drag to resize
├─────────────────────────────────────────────────────────────────┤
│ TERMINAL PANEL                                                   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ Terminal    [Shell: Bash ▼]  [+]  [×]                    │   │ ← Header
│ ├───────────────────────────────────────────────────────────┤   │
│ │ [Terminal 1] [Terminal 2] [Terminal 3]                    │   │ ← Tabs
│ ├───────────────────────────────────────────────────────────┤   │
│ │ runner@host:~$ echo "Hello Terminal"                      │   │
│ │ Hello Terminal                                             │   │
│ │ runner@host:~$ _                                          │   │ ← Terminal content
│ │                                                            │   │
│ │                                                            │   │
│ └───────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ Connection: Not Connected              [📟 Terminal]         │   │ ← Footer
└─────────────────────────────────────────────────────────────────┘
```

## UI Components Breakdown

### 1. Terminal Toggle Button (Footer)
- **Location**: Bottom-right corner of footer
- **Icon**: Terminal icon (📟) with "Terminal" text
- **Action**: Toggles terminal panel visibility
- **Style**: Hover effect, clean button design

### 2. Terminal Panel
- **Location**: Bottom of window, above footer
- **Height**: 300px by default, resizable
- **Style**: Dark background matching VSCode terminal
- **Behavior**: Slides up from bottom when toggled

### 3. Terminal Header
- **Components**:
  - "Terminal" title (left)
  - Shell selector dropdown (middle)
  - "+" button to create new terminal
  - "×" button to hide panel
- **Style**: Light gray background, clean modern design

### 4. Shell Selector
- **Type**: Dropdown select
- **Options**: Lists available shells (PowerShell, Bash, Zsh, etc.)
- **Default**: System default shell pre-selected
- **Action**: Creates new terminal with selected shell

### 5. Terminal Tabs
- **Layout**: Horizontal tabs below header
- **Style**: VSCode-like tab design
- **Features**:
  - Active tab highlighted
  - Each tab shows terminal name
  - Close button (×) on each tab
  - Hover effects

### 6. Terminal Content Area
- **Technology**: xterm.js terminal emulator
- **Features**:
  - Full color support (256 colors)
  - Cursor blinking
  - Scrollback buffer
  - Text selection
  - Keyboard input
- **Font**: Monospace (Consolas, Courier New)
- **Theme**: Dark background with light text

### 7. Resize Handle
- **Location**: Above terminal panel
- **Width**: Full width of window
- **Height**: 4px
- **Style**: Transparent by default, highlighted on hover
- **Cursor**: North-south resize cursor
- **Action**: Drag to adjust terminal height

## Color Scheme

### Terminal Panel
- Background: `#1e1e1e` (dark gray)
- Text: `#cccccc` (light gray)
- Accent: Theme accent color

### Header/Tabs
- Background: Slightly lighter than content
- Active tab: Matches terminal background
- Inactive tabs: Semi-transparent

### Borders
- Color: `#454545` (medium gray)
- Style: 1px solid

## Interactions

### Opening Terminal
1. User clicks "Terminal" button in footer
2. Terminal panel slides up with smooth animation
3. If no terminals exist, one is created automatically
4. Terminal is focused and ready for input

### Creating New Terminal
1. User clicks "+" button OR selects shell from dropdown
2. New tab appears in tab bar
3. New terminal instance opens in content area
4. New terminal becomes active
5. Previous terminals remain in background

### Switching Terminals
1. User clicks on terminal tab
2. Active tab is highlighted
3. Corresponding terminal content shows
4. Inactive tabs become semi-transparent

### Resizing Terminal
1. User hovers over resize handle (appears above panel)
2. Cursor changes to resize cursor
3. User drags up/down
4. Terminal height adjusts in real-time
5. Terminal content re-fits to new size

### Closing Terminal
1. User clicks "×" on terminal tab
2. Tab fades out and removes
3. Terminal process terminates
4. If last terminal: panel remains open with no content
5. User can create new terminal or hide panel

### Hiding Terminal
1. User clicks "×" in header
2. Panel slides down with animation
3. All terminals remain active in background
4. Click footer button to show again

## Responsive Behavior

### Window Resize
- Terminal automatically re-fits to available width
- Height maintained unless panel is too large
- Scrollback preserved during resize

### Content Adjustment
- When terminal shown: main content area shrinks
- When terminal hidden: main content expands
- Smooth transitions between states

## Keyboard Shortcuts

While terminal has focus:
- All standard terminal keyboard shortcuts work
- Ctrl+C, Ctrl+V, Ctrl+Z, etc.
- Tab completion
- Arrow keys for history
- Copy/paste with terminal-specific behavior

## Accessibility

- Focus indicators on interactive elements
- Keyboard navigation support
- Screen reader compatible labels
- Clear visual feedback for actions
- Sufficient color contrast

## Example Use Cases

### 1. Running Build Commands
```
Terminal 1: npm run build
Terminal 2: npm run test
Terminal 3: npm run lint
```

### 2. Multiple Environments
```
Terminal 1 (PowerShell): Windows commands
Terminal 2 (Bash): Unix commands
Terminal 3 (PowerShell 7): Modern PowerShell
```

### 3. Tool Development
```
Terminal 1: cd tool-directory && npm run dev
Terminal 2: npm run test -- --watch
Terminal 3: git status
```

## Tool Integration Example

When a tool executes a command programmatically:
1. Tool calls `pptoolbox.terminal.executeCommand()`
2. Command appears in terminal (if visible)
3. Output streams to terminal in real-time
4. Tool receives completion event with results
5. User can see what the tool did

This transparency helps users understand what tools are doing and trust the automation.

---

**Note**: To see the actual terminal in action, run `npm start` in the repository and click the Terminal button in the footer.
