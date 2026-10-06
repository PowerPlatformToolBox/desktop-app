export interface WorkerQuitDependencies {
    confirm(): boolean;
    stopWorkers(): Promise<void>;
    cleanup(): Promise<void>;
    quit(): void;
    cancelled(): void;
    failed(error: unknown): void;
}

export class WorkerQuitCoordinator {
    private pending = false;
    private committed = false;
    private action: (() => void) | undefined;

    constructor(private readonly dependencies: WorkerQuitDependencies) {}

    restart(relaunch: () => void): void {
        this.request(() => {
            relaunch();
            this.dependencies.quit();
        });
    }

    installUpdate(quitAndInstall: () => void): void {
        this.request(() => {
            quitAndInstall();
            setImmediate(() => this.dependencies.quit());
        });
    }

    request(action: () => void): void {
        if (this.pending || this.committed) return;
        this.action = action;
        this.handle({ preventDefault() {} });
    }

    handle(event: { preventDefault(): void }): void {
        if (this.committed && !this.pending) return;
        event.preventDefault();
        if (this.pending) return;
        if (!this.dependencies.confirm()) {
            this.action = undefined;
            this.dependencies.cancelled();
            return;
        }
        this.pending = true;
        void this.finish();
    }

    private async finish(): Promise<void> {
        try {
            await this.dependencies.stopWorkers();
        } catch (error) {
            this.pending = false;
            this.action = undefined;
            this.dependencies.cancelled();
            this.dependencies.failed(error);
            return;
        }
        this.committed = true;
        try {
            await this.dependencies.cleanup();
        } catch (error) {
            this.dependencies.failed(error);
        }
        this.pending = false;
        try {
            if (this.action) this.action();
            else this.dependencies.quit();
        } catch (error) {
            this.dependencies.failed(error);
            this.dependencies.quit();
        }
    }
}
