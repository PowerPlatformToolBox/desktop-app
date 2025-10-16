/**
 * Terminal management for the renderer process
 * Handles terminal UI, xterm instances, and communication with main process
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="types.d.ts" />

interface TerminalInstance {
    id: string;
    name: string;
    terminal: any; // xterm Terminal instance
    element: HTMLElement;
    fitAddon: any;
}

class TerminalManager {
    private terminals: Map<string, TerminalInstance> = new Map();
    private activeTerminalId: string | null = null;
    private isVisible: boolean = false;
    private resizing: boolean = false;
    private terminalHeight: number = 300;

    async initialize(): Promise<void> {
        // xterm libraries are loaded via script tags in index.html
        // They are available as window.Terminal and window.FitAddon
        
        this.setupEventListeners();
        this.setupTerminalListeners();
        await this.loadShells();
    }

    private setupEventListeners(): void {
        // Toggle terminal visibility
        const toggleBtn = document.getElementById('footer-terminal-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.toggleVisibility();
            });
        }

        // New terminal button
        const newTerminalBtn = document.getElementById('new-terminal-btn');
        if (newTerminalBtn) {
            newTerminalBtn.addEventListener('click', async () => {
                await this.createTerminal();
            });
        }

        // Close terminal panel button
        const closeBtn = document.getElementById('close-terminal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }

        // Terminal resize handle
        const resizeHandle = document.getElementById('terminal-resize-handle');
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => {
                this.startResize(e);
            });
        }

        // Shell selection change
        const shellSelect = document.getElementById('terminal-shell-select') as HTMLSelectElement;
        if (shellSelect) {
            shellSelect.addEventListener('change', async () => {
                const shellPath = shellSelect.value;
                if (shellPath) {
                    await this.createTerminal({ shellPath });
                }
            });
        }
    }

    private setupTerminalListeners(): void {
        // Listen for terminal data from main process
        window.toolboxAPI.onToolboxEvent((_event: any, payload: any) => {
            if (payload.event === 'terminal:data') {
                const { terminalId, data } = payload.data;
                const instance = this.terminals.get(terminalId);
                if (instance && instance.terminal) {
                    instance.terminal.write(data);
                }
            } else if (payload.event === 'terminal:disposed') {
                const { terminalId } = payload.data;
                this.removeTerminal(terminalId);
            }
        });
    }

    private async loadShells(): Promise<void> {
        try {
            const shells = await window.toolboxAPI.getAvailableShells();
            const shellSelect = document.getElementById('terminal-shell-select') as HTMLSelectElement;
            if (shellSelect && shells && shells.length > 0) {
                shellSelect.innerHTML = shells.map((shell: any) => 
                    `<option value="${shell.path}" ${shell.isDefault ? 'selected' : ''}>${shell.name}</option>`
                ).join('');
            }
        } catch (error) {
            console.error('Failed to load shells:', error);
        }
    }

    async createTerminal(options: any = {}): Promise<void> {
        try {
            const Terminal = (window as any).Terminal;
            const FitAddon = (window as any).FitAddon;
            
            if (!Terminal || !FitAddon) {
                console.error('Terminal or FitAddon not loaded');
                return;
            }

            // Create terminal in main process
            const terminalInfo = await window.toolboxAPI.createTerminal(options);
            
            // Create xterm instance
            const term = new Terminal({
                cursorBlink: true,
                fontSize: 13,
                fontFamily: 'Consolas, "Courier New", monospace',
                theme: {
                    background: '#1e1e1e',
                    foreground: '#cccccc',
                },
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            // Create DOM element
            const terminalElement = document.createElement('div');
            terminalElement.className = 'terminal-instance';
            terminalElement.id = `terminal-${terminalInfo.id}`;

            const terminalContent = document.getElementById('terminal-content');
            if (terminalContent) {
                terminalContent.appendChild(terminalElement);
            }

            // Open terminal and fit
            term.open(terminalElement);
            fitAddon.fit();

            // Handle user input
            term.onData((data: string) => {
                window.toolboxAPI.writeToTerminal(terminalInfo.id, data);
            });

            // Handle resize
            term.onResize((size: any) => {
                window.toolboxAPI.resizeTerminal(terminalInfo.id, size.cols, size.rows);
            });

            // Store instance
            const instance: TerminalInstance = {
                id: terminalInfo.id,
                name: terminalInfo.name,
                terminal: term,
                element: terminalElement,
                fitAddon,
            };
            this.terminals.set(terminalInfo.id, instance);

            // Create tab
            this.createTab(instance);

            // Switch to new terminal
            this.switchToTerminal(terminalInfo.id);

            // Show terminal panel if hidden
            if (!this.isVisible) {
                this.show();
            }

            // Fit after showing
            setTimeout(() => {
                fitAddon.fit();
            }, 100);
        } catch (error) {
            console.error('Failed to create terminal:', error);
        }
    }

    private createTab(instance: TerminalInstance): void {
        const tabsContainer = document.getElementById('terminal-tabs');
        if (!tabsContainer) return;

        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.id = `terminal-tab-${instance.id}`;
        tab.innerHTML = `
            <span class="terminal-tab-name">${instance.name}</span>
            <button class="terminal-tab-close" data-terminal-id="${instance.id}">✕</button>
        `;

        tab.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).classList.contains('terminal-tab-close')) {
                return; // Let close button handler deal with it
            }
            this.switchToTerminal(instance.id);
        });

        const closeBtn = tab.querySelector('.terminal-tab-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.closeTerminal(instance.id);
            });
        }

        tabsContainer.appendChild(tab);
    }

    private switchToTerminal(terminalId: string): void {
        // Deactivate all terminals and tabs
        this.terminals.forEach((instance, id) => {
            instance.element.classList.remove('active');
            const tab = document.getElementById(`terminal-tab-${id}`);
            if (tab) {
                tab.classList.remove('active');
            }
        });

        // Activate selected terminal
        const instance = this.terminals.get(terminalId);
        if (instance) {
            instance.element.classList.add('active');
            const tab = document.getElementById(`terminal-tab-${terminalId}`);
            if (tab) {
                tab.classList.add('active');
            }
            this.activeTerminalId = terminalId;

            // Focus the terminal
            instance.terminal.focus();

            // Fit the terminal
            if (instance.fitAddon) {
                setTimeout(() => {
                    instance.fitAddon.fit();
                }, 50);
            }
        }
    }

    private async closeTerminal(terminalId: string): Promise<void> {
        const instance = this.terminals.get(terminalId);
        if (!instance) return;

        try {
            // Dispose in main process
            await window.toolboxAPI.disposeTerminal(terminalId);
            
            // Remove from UI
            this.removeTerminal(terminalId);
        } catch (error) {
            console.error('Failed to close terminal:', error);
        }
    }

    private removeTerminal(terminalId: string): void {
        const instance = this.terminals.get(terminalId);
        if (!instance) return;

        // Dispose xterm instance
        if (instance.terminal) {
            instance.terminal.dispose();
        }

        // Remove DOM elements
        instance.element.remove();
        const tab = document.getElementById(`terminal-tab-${terminalId}`);
        if (tab) {
            tab.remove();
        }

        // Remove from map
        this.terminals.delete(terminalId);

        // If this was the active terminal, switch to another
        if (this.activeTerminalId === terminalId) {
            const remaining = Array.from(this.terminals.keys());
            if (remaining.length > 0) {
                this.switchToTerminal(remaining[0]);
            } else {
                this.activeTerminalId = null;
                // Hide terminal panel if no terminals left
                this.hide();
            }
        }
    }

    toggleVisibility(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    async show(): Promise<void> {
        this.isVisible = true;
        const container = document.querySelector('.app-container');
        if (container) {
            container.classList.add('terminal-visible');
        }

        // If no terminals exist, create one
        if (this.terminals.size === 0) {
            await this.createTerminal();
        } else {
            // Fit all terminals
            this.terminals.forEach(instance => {
                if (instance.fitAddon) {
                    setTimeout(() => {
                        instance.fitAddon.fit();
                    }, 100);
                }
            });
        }
    }

    hide(): void {
        this.isVisible = false;
        const container = document.querySelector('.app-container');
        if (container) {
            container.classList.remove('terminal-visible');
        }
    }

    private startResize(e: MouseEvent): void {
        this.resizing = true;
        const startY = e.clientY;
        const startHeight = this.terminalHeight;

        const onMouseMove = (e: MouseEvent) => {
            if (!this.resizing) return;
            
            const deltaY = startY - e.clientY;
            const newHeight = Math.max(100, Math.min(600, startHeight + deltaY));
            this.setTerminalHeight(newHeight);
        };

        const onMouseUp = () => {
            this.resizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // Fit all terminals after resize
            this.terminals.forEach(instance => {
                if (instance.fitAddon) {
                    setTimeout(() => {
                        instance.fitAddon.fit();
                    }, 50);
                }
            });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    private setTerminalHeight(height: number): void {
        this.terminalHeight = height;
        const panel = document.getElementById('terminal-panel');
        const resizeHandle = document.getElementById('terminal-resize-handle');
        const mainContent = document.querySelector('.main-content') as HTMLElement;

        if (panel) {
            panel.style.height = `${height}px`;
        }
        if (resizeHandle) {
            resizeHandle.style.bottom = `calc(var(--footer-height, 30px) + ${height}px)`;
        }
        if (mainContent) {
            mainContent.style.bottom = `calc(var(--footer-height, 30px) + ${height}px)`;
        }
    }

    async executeCommand(command: string, timeout?: number): Promise<any> {
        if (!this.activeTerminalId) {
            throw new Error('No active terminal');
        }
        return await window.toolboxAPI.executeCommand(this.activeTerminalId, command, timeout);
    }
}

// Export for use in renderer.ts
(window as any).terminalManager = new TerminalManager();
