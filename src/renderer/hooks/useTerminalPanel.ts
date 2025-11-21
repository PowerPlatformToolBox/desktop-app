import AnsiToHtml from "ansi-to-html";
import { useEffect, useRef } from "react";
import { useTerminal } from "../contexts/TerminalContext";

interface TerminalTab {
    id: string;
    name: string;
    toolId: string;
    element: HTMLButtonElement;
    outputElement: HTMLPreElement;
}

interface Terminal {
    id: string;
    name: string;
    toolId: string;
}

type TerminalEventData = Terminal | { terminalId: string } | { terminalId: string; data: string } | { terminalId: string; error: string };
interface TerminalEventPayload {
    event: string;
    data: TerminalEventData;
}

interface UserSettings {
    terminalFont?: string;
    terminalFontCustom?: string;
}

// ANSI to HTML converter for terminal output
const ansiConverter = new AnsiToHtml({
    fg: "#CCCCCC",
    bg: "#1E1E1E",
    newline: false,
    escapeXML: true,
    stream: false,
});

// Terminal tab state (module-level, persists across renders)

const openTerminals: Map<string, TerminalTab> = new Map();
let activeTerminalId: string | null = null;

export function useTerminalPanel(): void {
    const { showTerminal, hideTerminal } = useTerminal();
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        // DEBUG: Log when useTerminalPanel runs
        // eslint-disable-next-line no-console
        console.log("[useTerminalPanel] Initializing terminal panel hook");

        // Set up resize handle for terminal panel
        const terminalPanel = document.getElementById("terminal-panel");
        const resizeHandle = document.getElementById("terminal-resize-handle");
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const handleMouseDown = (e: MouseEvent): void => {
            isResizing = true;
            startY = e.clientY;
            startHeight = terminalPanel?.offsetHeight || 0;
            document.body.style.cursor = "ns-resize";
            e.preventDefault();
        };
        const handleMouseMove = (e: MouseEvent): void => {
            if (!isResizing || !terminalPanel) return;
            const deltaY = startY - e.clientY;
            const newHeight = Math.max(100, Math.min(startHeight + deltaY, window.innerHeight * 0.8));
            terminalPanel.style.height = `${newHeight}px`;
        };
        const handleMouseUp = (): void => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
            }
        };
        if (resizeHandle && terminalPanel) {
            resizeHandle.addEventListener("mousedown", handleMouseDown);
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        }

        // Load any existing terminals on mount
        (async () => {
            try {
                // DEBUG: Log window.api availability
                // eslint-disable-next-line no-console
                console.log("[useTerminalPanel] window.api exists:", typeof window.api !== "undefined");
                // eslint-disable-next-line no-console
                console.log("[useTerminalPanel] Calling get-all-terminals...");
                const existingTerminals = (await window.api.invoke("get-all-terminals")) as Terminal[];
                // DEBUG: Log what terminals are restored
                // eslint-disable-next-line no-console
                console.log("[useTerminalPanel] existingTerminals:", existingTerminals);
                if (Array.isArray(existingTerminals) && existingTerminals.length > 0) {
                    setTimeout(() => {
                        existingTerminals.forEach((terminal: Terminal) => createTerminalTab(terminal));
                        showTerminal();
                    }, 200);
                } else {
                    // eslint-disable-next-line no-console
                    console.log("[useTerminalPanel] No existing terminals to restore");
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error("[useTerminalPanel] Failed to load existing terminals:", error);
            }
        })();

        // Terminal event handlers
        const handleTerminalCreated = (_event: unknown, payload: { data: Terminal }): void => {
            // DEBUG: Log terminal created event
            // eslint-disable-next-line no-console
            console.log("[useTerminalPanel] terminal:created", payload.data);
            setTimeout(() => {
                createTerminalTab(payload.data);
                showTerminal();
            }, 100);
        };
        const handleTerminalClosed = (_event: unknown, payload: { data: { terminalId: string } }): void => {
            // DEBUG: Log terminal closed event
            // eslint-disable-next-line no-console
            console.log("[useTerminalPanel] terminal:closed", payload.data);
            removeTerminalTab(payload.data.terminalId, hideTerminal);
        };
        const handleTerminalOutput = (_event: unknown, payload: { data: { terminalId: string; data: string } }): void => {
            // DEBUG: Log terminal output event
            // eslint-disable-next-line no-console
            console.log("[useTerminalPanel] terminal:output", payload.data);
            appendTerminalOutput(payload.data.terminalId, payload.data.data);
        };
        const handleTerminalError = (_event: unknown, payload: { data: { terminalId: string; error: string } }): void => {
            // DEBUG: Log terminal error event
            // eslint-disable-next-line no-console
            console.log("[useTerminalPanel] terminal:error", payload.data);
            appendTerminalOutput(payload.data.terminalId, `\x1b[31mError: ${payload.data.error}\x1b[0m\n`);
        };
        // Listen for toolbox events
        window.toolboxAPI.events.on((_event: unknown, payload: unknown) => {
            // DEBUG: Log all terminal events
            // eslint-disable-next-line no-console
            console.log("[useTerminalPanel] toolboxAPI.events payload:", payload);
            if (typeof payload === "object" && payload !== null && "event" in payload && "data" in payload) {
                const eventPayload = payload as TerminalEventPayload;
                switch (eventPayload.event) {
                    case "terminal:created":
                        handleTerminalCreated(_event, { data: eventPayload.data as Terminal });
                        break;
                    case "terminal:closed":
                        handleTerminalClosed(_event, { data: eventPayload.data as { terminalId: string } });
                        break;
                    case "terminal:output":
                        handleTerminalOutput(_event, { data: eventPayload.data as { terminalId: string; data: string } });
                        break;
                    case "terminal:error":
                        handleTerminalError(_event, { data: eventPayload.data as { terminalId: string; error: string } });
                        break;
                    default:
                        break;
                }
            }
        });

        // Cleanup function
        return () => {
            if (resizeHandle && terminalPanel) {
                resizeHandle.removeEventListener("mousedown", handleMouseDown);
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            }
        };
    }, []);
} // Close useTerminalPanel
// --- Helper functions ---
function createTerminalTab(terminal: Terminal): void {
    // Only one terminal per tool
    const existingTerminal = Array.from(openTerminals.values()).find((t) => t.toolId === terminal.toolId);
    if (existingTerminal) {
        switchTerminalTab(existingTerminal.id);
        return;
    }
    const terminalTabs = document.getElementById("terminal-tabs");
    const terminalPanelContent = document.getElementById("terminal-panel-content");
    if (!terminalTabs || !terminalPanelContent) return;
    // Tab
    const tabElement = document.createElement("button");
    tabElement.className = "terminal-tab";
    tabElement.dataset.terminalId = terminal.id;
    const tabLabel = document.createElement("span");
    tabLabel.textContent = terminal.name;
    tabElement.appendChild(tabLabel);
    const closeBtn = document.createElement("button");
    closeBtn.className = "terminal-tab-close";
    closeBtn.innerHTML = "\u00d7";
    closeBtn.addEventListener("click", async (e: MouseEvent) => {
        e.stopPropagation();
        await window.toolboxAPI.terminal.close(terminal.id);
    });
    tabElement.appendChild(closeBtn);
    tabElement.addEventListener("click", () => switchTerminalTab(terminal.id));
    terminalTabs.appendChild(tabElement);
    // Output
    const outputContainer = document.createElement("div");
    outputContainer.className = "terminal-output";
    outputContainer.dataset.terminalId = terminal.id;
    const outputContent = document.createElement("pre");
    outputContent.className = "terminal-output-content";
    outputContainer.appendChild(outputContent);
    terminalPanelContent.appendChild(outputContainer);
    // Font
    window.toolboxAPI
        .getUserSettings()
        .then((settings: UserSettings) => {
            if (settings && settings.terminalFont) {
                const fontFamily =
                    settings.terminalFont === "custom" && settings.terminalFontCustom ? settings.terminalFontCustom : settings.terminalFont || "'Cascadia Code', 'Consolas', 'Courier New', monospace";
                outputContent.style.fontFamily = fontFamily;
            }
        })
        .catch(() => {});
    openTerminals.set(terminal.id, {
        id: terminal.id,
        name: terminal.name,
        toolId: terminal.toolId,
        element: tabElement,
        outputElement: outputContent,
    });
    switchTerminalTab(terminal.id);
}
function removeTerminalTab(terminalId: string, hideTerminalFn?: () => void): void {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;
    terminal.element.remove();
    const outputContainer = document.querySelector(`.terminal-output[data-terminal-id="${terminalId}"]`);
    if (outputContainer) (outputContainer as HTMLElement).remove();
    openTerminals.delete(terminalId);
    if (activeTerminalId === terminalId) {
        const remaining = Array.from(openTerminals.keys());
        if (remaining.length > 0) {
            switchTerminalTab(remaining[0]);
        } else {
            activeTerminalId = null;
            if (hideTerminalFn) hideTerminalFn();
        }
    }
}
function switchTerminalTab(terminalId: string): void {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;
    openTerminals.forEach((t) => t.element.classList.remove("active"));
    terminal.element.classList.add("active");
    document.querySelectorAll(".terminal-output").forEach((output) => (output as HTMLElement).classList.remove("active"));
    const outputContainer = document.querySelector(`.terminal-output[data-terminal-id="${terminalId}"]`);
    if (outputContainer) (outputContainer as HTMLElement).classList.add("active");
    activeTerminalId = terminalId;
}
function appendTerminalOutput(terminalId: string, output: string): void {
    const terminal = openTerminals.get(terminalId);
    if (!terminal) return;
    const htmlOutput = ansiConverter.toHtml(output);
    terminal.outputElement.insertAdjacentHTML("beforeend", htmlOutput);
    terminal.outputElement.scrollTop = terminal.outputElement.scrollHeight;
}
