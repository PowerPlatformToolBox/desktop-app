import { randomUUID } from "crypto";
import { logInfo } from "../../common/sentryHelper";
import { SettingsManager } from "./settingsManager";

/**
 * Manages a unique install identifier for analytics purposes
 * The install ID is generated once and persisted across app sessions
 */
export class InstallIdManager {
    private settingsManager: SettingsManager;
    private installId: string | null = null;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
    }

    /**
     * Get the unique install ID, generating it if it doesn't exist
     * The ID is persisted in settings and remains constant for this installation
     */
    getInstallId(): string {
        if (this.installId) {
            return this.installId;
        }

        // Try to retrieve from settings
        const storedInstallId = this.settingsManager.getSetting("installId");

        if (storedInstallId) {
            this.installId = storedInstallId;
            logInfo("[InstallId] Retrieved existing install ID");
            return this.installId;
        }

        // Fallback to legacy machineId if present to preserve telemetry continuity
        const legacyMachineId = this.settingsManager.getSetting("machineId");
        if (legacyMachineId) {
            this.installId = legacyMachineId;
            this.settingsManager.setSetting("installId", legacyMachineId);
            logInfo("[InstallId] Migrated legacy machine ID to install ID");
            return this.installId;
        }

        // Generate new install ID using randomUUID from crypto module (Node 18+)
        this.installId = randomUUID();
        this.settingsManager.setSetting("installId", this.installId);
        logInfo("[InstallId] Generated new install ID");

        return this.installId;
    }
}
