interface InstallationTarget {
    id: string;
    npmPackageName?: string;
}

interface InstallationSender {
    isDestroyed(): boolean;
}

export interface ToolInstallationDependencies {
    mainSender(): InstallationSender | undefined;
    installed(): InstallationTarget[];
    registry(): Promise<InstallationTarget[]>;
    mutate<Result>(toolId: string, action: () => Promise<Result>): Promise<Result>;
}

export class ToolInstallationCoordinator {
    constructor(private readonly dependencies: ToolInstallationDependencies) {}

    async install<Result>(sender: InstallationSender, identifier: string, source: "registry" | "npm", action: (canonicalIdentifier: string) => Promise<Result>): Promise<Result> {
        this.requireMainSender(sender);
        if (typeof identifier !== "string" || !identifier) throw new Error("Tool installation identity is required");
        let canonicalIdentifier = identifier;
        if (source === "npm") {
            const packageMatch = /^(?:(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)|([a-z0-9][a-z0-9._-]*))(?:@([a-zA-Z0-9*^~<>=|.+_-]+))?$/.exec(identifier);
            if (!packageMatch) throw new Error("Tool installation requires a named npm package");
            canonicalIdentifier = packageMatch[1] ?? packageMatch[2];
        }
        const installed = this.dependencies.installed();
        const matches = installed.filter((tool) => (source === "registry" ? tool.id === canonicalIdentifier : tool.npmPackageName === canonicalIdentifier || tool.id === canonicalIdentifier));
        if (source === "registry" && matches.length > 1) throw new Error("Tool installation identity is ambiguous");
        let target = matches[0];
        if (!target && source === "registry") {
            const registry = await this.dependencies.registry();
            const entries = registry.filter((tool) => tool.id === canonicalIdentifier);
            if (entries.length > 1) throw new Error("Tool installation identity is ambiguous");
            target = entries[0];
            if (!target) throw new Error("Tool installation target was not found");
        }
        this.requireMainSender(sender);
        const targetIds = source === "registry" ? [target!.id] : [...new Set([...matches.map((tool) => tool.id), `npm-${canonicalIdentifier.replace(/@/g, "").replace(/\//g, "-")}`])].sort();
        const mutateNext = async (index: number): Promise<Result> => {
            this.requireMainSender(sender);
            if (index < targetIds.length) return this.dependencies.mutate(targetIds[index], () => mutateNext(index + 1));
            return action(canonicalIdentifier);
        };
        return mutateNext(0);
    }

    private requireMainSender(sender: InstallationSender): void {
        if (sender !== this.dependencies.mainSender() || sender.isDestroyed()) throw new Error("Tool mutation requires the trusted main window");
    }
}
