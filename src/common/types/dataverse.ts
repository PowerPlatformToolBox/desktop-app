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

/**
 * Navigation properties available on EntityDefinition
 * Used by getEntityRelatedMetadata to provide compile-time safety
 */
export type EntityRelatedMetadataBasePath = "Attributes" | "Keys" | "ManyToOneRelationships" | "OneToManyRelationships" | "ManyToManyRelationships" | "Privileges";

/**
 * Allowed related metadata paths. Supports nested lookups such as Attributes(LogicalName='accountnumber')/OptionSet
 */
export type EntityRelatedMetadataPath =
    | EntityRelatedMetadataBasePath
    | `${EntityRelatedMetadataBasePath}/${string}`
    | `${EntityRelatedMetadataBasePath}(${string})`
    | `${EntityRelatedMetadataBasePath}(${string})/${string}`;

/**
 * Runtime-safe list of supported base segments for related metadata retrieval
 */
export const ENTITY_RELATED_METADATA_BASE_PATHS: ReadonlyArray<EntityRelatedMetadataBasePath> = Object.freeze([
    "Attributes",
    "Keys",
    "ManyToOneRelationships",
    "OneToManyRelationships",
    "ManyToManyRelationships",
    "Privileges",
]);

type EntityRelatedMetadataRecordPath = `${EntityRelatedMetadataBasePath}/${string}` | `${EntityRelatedMetadataBasePath}(${string})` | `${EntityRelatedMetadataBasePath}(${string})/${string}`;

export type EntityRelatedMetadataResponse<P extends EntityRelatedMetadataPath> = P extends EntityRelatedMetadataRecordPath ? Record<string, unknown> : { value: Record<string, unknown>[] };
