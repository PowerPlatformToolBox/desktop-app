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
    /**
     * Parameters to pass to the operation
     *
     * For Functions (GET requests):
     * - Parameters are passed in URL query string using parameter aliases
     * - Primitives: strings (wrapped in quotes), numbers, booleans (lowercase)
     * - EntityReference: { entityLogicalName: 'entity', id: 'guid' } or { '@odata.id': 'entities(guid)' }
     * - Enums: "Microsoft.Dynamics.CRM.EnumType'Value'" or "Microsoft.Dynamics.CRM.EnumType'Value1,Value2'"
     * - Complex objects/arrays: JSON serialized
     *
     * For Actions (POST requests):
     * - All parameters passed in request body as JSON
     *
     * @example
     * // Function with EntityReference
     * parameters: {
     *   Target: { entityLogicalName: 'account', id: 'guid' },
     *   FieldName: 'new_totalrevenue'
     * }
     *
     * @example
     * // Function with enum and boolean
     * parameters: {
     *   EntityFilters: "Microsoft.Dynamics.CRM.EntityFilters'Entity,Attributes'",
     *   RetrieveAsIfPublished: false
     * }
     *
     * @example
     * // Function with complex object
     * parameters: {
     *   Target: { entityLogicalName: 'account', id: 'guid' },
     *   AttributeLogicalName: 'name',
     *   PagingInfo: { PageNumber: 1, Count: 10 }
     * }
     */
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

/**
 * Localized label for metadata display names and descriptions
 */
export interface LocalizedLabel {
    "@odata.type"?: "Microsoft.Dynamics.CRM.LocalizedLabel";
    Label: string;
    LanguageCode: number;
    IsManaged?: boolean;
}

/**
 * Label structure for metadata properties
 */
export interface Label {
    "@odata.type"?: "Microsoft.Dynamics.CRM.Label";
    LocalizedLabels: LocalizedLabel[];
    UserLocalizedLabel?: LocalizedLabel;
}

/**
 * Attribute metadata types for Dataverse columns
 * Maps to Microsoft.Dynamics.CRM.*AttributeMetadata OData types
 */
export enum AttributeMetadataType {
    /** Single-line text field */
    String = "String",
    /** Multi-line text field */
    Memo = "Memo",
    /** Whole number */
    Integer = "Integer",
    /** Big integer (large whole number) */
    BigInt = "BigInt",
    /** Decimal number */
    Decimal = "Decimal",
    /** Floating point number */
    Double = "Double",
    /** Currency field */
    Money = "Money",
    /** Yes/No (boolean) field */
    Boolean = "Boolean",
    /** Date and time */
    DateTime = "DateTime",
    /** Lookup (foreign key reference) */
    Lookup = "Lookup",
    /** Choice (option set/picklist) */
    Picklist = "Picklist",
    /** Multi-select choice */
    MultiSelectPicklist = "MultiSelectPicklist",
    /** State field (active/inactive) */
    State = "State",
    /** Status field (status reason) */
    Status = "Status",
    /** Owner field */
    Owner = "Owner",
    /** Customer field (Account or Contact lookup) */
    Customer = "Customer",
    /** File attachment field */
    File = "File",
    /** Image field */
    Image = "Image",
    /** Unique identifier (GUID) */
    UniqueIdentifier = "UniqueIdentifier",
}

/**
 * Options for metadata CRUD operations
 */
export interface MetadataOperationOptions {
    /**
     * Associate metadata changes with a specific solution
     * Uses MSCRM.SolutionUniqueName header
     */
    solutionUniqueName?: string;

    /**
     * Preserve existing localized labels during PUT operations
     * Uses MSCRM.MergeLabels header (defaults to true for updates)
     */
    mergeLabels?: boolean;

    /**
     * Force fresh metadata read after create/update operations
     * Uses Consistency: Strong header to bypass cache
     */
    consistencyStrong?: boolean;
}
