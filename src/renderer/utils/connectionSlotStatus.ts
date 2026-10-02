import type { Connection } from "../../common/types/connection";

export interface ConnectionSlotSquarePresentation {
    label: string;
    ariaLabel: string;
    title: string;
    className: string;
    environmentToken: string;
    environmentColor: string | null;
}

export function getConnectionSlotSquarePresentation(slotIndex: number, connection: Connection, isExpired: boolean, impersonatedUserName?: string): ConnectionSlotSquarePresentation {
    const slotNumber = slotIndex + 1;
    const environmentToken = connection.environment.toLowerCase() === "production" ? "prod" : connection.environment.toLowerCase();
    const environmentColor = connection.environmentColor && /^#[0-9A-Fa-f]{6}$/.test(connection.environmentColor) ? connection.environmentColor : null;
    const states = [isExpired ? "token expired" : null, impersonatedUserName ? `impersonating ${impersonatedUserName}` : null].filter((state): state is string => Boolean(state));
    const stateSuffix = states.length ? `, ${states.join(", ")}` : "";

    return {
        label: String(slotNumber),
        ariaLabel: `Connection ${slotNumber}: ${connection.name}, ${connection.environment}${stateSuffix}`,
        title: `Connection ${slotNumber}: ${connection.name} (${connection.environment})${stateSuffix ? ` - ${states.join(", ")}` : ""}`,
        className: `connection-slot-square${isExpired ? " expired" : ""}`,
        environmentToken,
        environmentColor,
    };
}
