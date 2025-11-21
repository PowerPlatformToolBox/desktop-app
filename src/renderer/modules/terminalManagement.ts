/**
 * Terminal management module
 * Handles terminal panel, tabs, and output
 */

import AnsiToHtml from "ansi-to-html";
import { ANSI_CONVERTER_CONFIG, TERMINAL_RESIZE_CONFIG } from "../constants";
import type { TerminalTab } from "../types/index";

// Create ANSI to HTML converter instance
const ansiConverter = new AnsiToHtml(ANSI_CONVERTER_CONFIG);

// Terminal state
const openTerminals = new Map<string, TerminalTab>();
let activeTerminalId: string | null = null;

/**
 * Set up terminal panel UI and event handlers
 */
export function setupTerminalPanel(): void {
    const toggleBtn = document.getElementById("footer-toggle-terminal-btn");
    const terminalPanel = document.getElementById("terminal-panel");
    const terminalPanelClose = document.getElementById("terminal-panel-close");
    const resizeHandle = document.getElementById("terminal-resize-handle");

    if (toggleBtn && terminalPanel) {
        toggleBtn.addEventListener("click", () => {
            const isVisible = terminalPanel.style.display !== "none";
            if (isVisible) {
                terminalPanel.style.display = "none";
                if (resizeHandle) resizeHandle.style.display = "none";
                // Notify main process to adjust BrowserView bounds for full height
                window.api.send("terminal-visibility-changed", false);
            } else {
                terminalPanel.style.display = "flex";
                if (resizeHandle) resizeHandle.style.display = "block";
                // Notify main process to adjust BrowserView bounds for terminal
                window.api.send("terminal-visibility-changed", true);
            }
        });
    }

    if (terminalPanelClose && terminalPanel) {
        terminalPanelClose.addEventListener("click", () => {
            terminalPanel.style.display = "none";
            if (resizeHandle) resizeHandle.style.display = "none";
            // Notify main process to adjust BrowserView bounds for full height
            window.api.send("terminal-visibility-changed", false);
        });
    }

    // Set up resize handle for terminal panel
    if (resizeHandle && terminalPanel) {
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        resizeHandle.addEventListener("mousedown", (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = terminalPanel.offsetHeight;
            document.body.style.cursor = "ns-resize";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const deltaY = startY - e.clientY;
            const newHeight = Math.max(
                TERMINAL_RESIZE_CONFIG.MIN_HEIGHT,
                Math.min(startHeight + deltaY, window.innerHeight * TERMINAL_RESIZE_CONFIG.MAX_HEIGHT_RATIO)
            );
            terminalPanel.style.height = `${newHeight}px`;
        });

        document.addEventListener("mouseup", () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
            }
        });
    }
}

/**
 * Handle terminal created event
 */
export function handleTerminalCreated(terminal: any): void {
    console.log("Terminal created:", terminal);
    createTerminalTab(terminal);
    showTerminalPanel();
}

/**
 * Handle terminal closed event
 */
export function handleTerminalClosed(data: any): void {
    console.log("Terminal closed:", data);
    removeTerminalTab(data.terminalId);
}

/**
 * Handle terminal output event
 */
export function handleTerminalOutput(data: any): void {
    const { terminalId, data: output } = data;
    appendTerminalOutput(terminalId, output);
}

/**
 * Handle terminal command completed event
 */
export function handleTerminalCommandCompleted(result: any): void {
    console.log("Terminal command completed:", result);
    // Output is already displayed via terminal:output events
}

/**
 * Handle terminal error event
 */
export function handleTerminalError(data: any): void {
    const { terminalId, error } = data;
    appendTerminalOutput(terminalId, `\x1b[31mError: ${error}\x1b[0m\n`);
}

/**
 * Create a terminal tab
 */
function createTerminalTab(terminal: any): void {
    const terminalTabs = document.getElementById("terminal-tabs");
    const terminalPanelContent = document.getElementById("terminal-panel-content");

    if (!terminalTabs || !terminalPanelContent) return;

    // Create tab element
    const tabElement = document.createElement("button");
    tabElement.className = "terminal-tab";
    tabElement.dataset.terminalId = terminal.id;

    const tabLabel = document.createElement("span");
    tabLabel.textContent = terminal.name;
    tabElement.appendChild(tabLabel);

    const closeBtn = document.createElement("button");
    closeBtn.className = "terminal-tab-close";
    closeBtn.innerHTML = "×";
    closeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await window.toolboxAPI.terminal.close(terminal.id);
    });
    tabElement.appendChild(closeBtn);

    tabElement.addEventListener("click", () => {
        switchTerminalTab(terminal.id);
    });

    terminalTabs.appendChild(tabElement);

    // Create output element
    const outputContainer = document.createElement("div");
    outputContainer.className = "terminal-output";
    outputContainer.dataset.terminalId = terminal.id;

    const outputContent = document.createElement("pre");
    outputContent.className = "terminal-output-content";
    outputContainer.appendChild(outputContent);

    terminalPanelContent.appendChild(outputContainer);

    // Apply terminal font from settings
    window.toolboxAPI
        .getUserSettings()
        .then((settings: any) => {
            if (settings && settings.terminalFont) {
                const fontFamily =
                    settings.terminalFont === "custom" && settings.terminalFontCustom ? settings.terminalFontCustom : settings.terminalFont || "'Cascadia Code', 'Consolas', 'Courier New', monospace";
                outputContent.style.fontFamily = fontFamily;
            }
        })
        .catch((error: Error) => {
            console.error("Failed to apply terminal font:", error);
        });

    // Store terminal tab
    openTerminals.set(terminal.id, {
        id: terminal.id,
        name: terminal.name,
        toolId: terminal.toolId,
        element: tabElement,
        outputElement: outputContent,
    });

    // Activate this terminal
    switchTerminalTab(terminal.id);
}

/**
 * Remove a terminal tab
 */
function removeTerminalTab(terminalId: string): void {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;

    // Remove tab element
    terminal.element.remove();

    // Remove output container
    const outputContainer = document.querySelector(`.terminal-output[data-terminal-id="${terminalId}"]`);
    if (outputContainer) {
        outputContainer.remove();
    }

    openTerminals.delete(terminalId);

    // If this was the active terminal, switch to another
    if (activeTerminalId === terminalId) {
        const remainingTerminals = Array.from(openTerminals.keys());
        if (remainingTerminals.length > 0) {
            switchTerminalTab(remainingTerminals[0]);
        } else {
            activeTerminalId = null;
            hideTerminalPanel();
        }
    }
}

/**
 * Switch to a terminal tab
 */
function switchTerminalTab(terminalId: string): void {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;

    // Update active state for tabs
    openTerminals.forEach((t) => {
        t.element.classList.remove("active");
    });
    terminal.element.classList.add("active");

    // Update active state for output containers
    document.querySelectorAll(".terminal-output").forEach((output) => {
        output.classList.remove("active");
    });
    const outputContainer = document.querySelector(`.terminal-output[data-terminal-id="${terminalId}"]`);
    if (outputContainer) {
        outputContainer.classList.add("active");
    }

    activeTerminalId = terminalId;
}

/**
 * Append output to a terminal
 */
function appendTerminalOutput(terminalId: string, output: string): void {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;

    // Convert ANSI escape codes to HTML
    const htmlOutput = ansiConverter.toHtml(output);

    // Append HTML content (using insertAdjacentHTML to preserve formatting)
    terminal.outputElement.insertAdjacentHTML("beforeend", htmlOutput);

    // Auto-scroll to bottom
    terminal.outputElement.scrollTop = terminal.outputElement.scrollHeight;
}

/**
 * Show terminal panel
 */
function showTerminalPanel(): void {
    const terminalPanel = document.getElementById("terminal-panel");
    const resizeHandle = document.getElementById("terminal-resize-handle");

    if (terminalPanel) {
        terminalPanel.style.display = "flex";
    }
    if (resizeHandle) {
        resizeHandle.style.display = "block";
    }

    // Notify main process to adjust BrowserView bounds for terminal
    window.api.send("terminal-visibility-changed", true);
}

/**
 * Hide terminal panel
 */
function hideTerminalPanel(): void {
    const terminalPanel = document.getElementById("terminal-panel");
    const resizeHandle = document.getElementById("terminal-resize-handle");

    if (terminalPanel) {
        terminalPanel.style.display = "none";
    }
    if (resizeHandle) {
        resizeHandle.style.display = "none";
    }

    // Notify main process to adjust BrowserView bounds for full height
    window.api.send("terminal-visibility-changed", false);
}
