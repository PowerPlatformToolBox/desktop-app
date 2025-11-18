/**
 * Dataverse API-related type definitions
 */

/**
 * Dataverse execute request
 */
export interface DataverseExecuteRequest {
    entityName?: string;
    entityId?: string;
    operationName: string;
    operationType: "action" | "function";
    parameters?: Record<string, unknown>;
}
