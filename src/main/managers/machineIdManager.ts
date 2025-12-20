import { SettingsManager } from "./settingsManager";

/**
 * Manages a unique machine identifier for analytics purposes
 * The machine ID is generated once and persisted across app sessions
 */
export class MachineIdManager {
    private settingsManager: SettingsManager;
    private machineId: string | null = null;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
    }

    /**
     * Get the unique machine ID, generating it if it doesn't exist
     * The ID is persisted in settings and remains constant for this installation
     */
    getMachineId(): string {
        if (this.machineId) {
            return this.machineId;
        }

        // Try to retrieve from settings
        const stored = this.settingsManager.getSetting("machineId");

        if (stored) {
            this.machineId = stored;
            console.log("[MachineId] Retrieved existing machine ID");
            return this.machineId;
        }

        // Generate new machine ID using crypto.randomUUID (Node 18+)
        this.machineId = crypto.randomUUID();
        this.settingsManager.setSetting("machineId", this.machineId);
        console.log("[MachineId] Generated new machine ID");

        return this.machineId;
    }
}
