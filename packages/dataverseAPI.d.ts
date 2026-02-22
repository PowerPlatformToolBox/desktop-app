/**
 * Power Platform ToolBox - Dataverse API Type Definitions
 *
 * Dataverse Web API exposed to tools via window.dataverseAPI
 */

declare namespace DataverseAPI {
    /**
     * FetchXML query result
     */
    export interface FetchXmlResult {
        value: Record<string, unknown>[];
        "@odata.context"?: string;
        "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"?: string;
    }

    /**
     * Entity metadata response
     */
    export interface EntityMetadata {
        MetadataId: string;
        LogicalName: string;
        DisplayName?: {
            LocalizedLabels: Array<{ Label: string; LanguageCode: number }>;
        };
        [key: string]: unknown;
    }

    export type EntityRelatedMetadataBasePath = "Attributes" | "Keys" | "ManyToOneRelationships" | "OneToManyRelationships" | "ManyToManyRelationships" | "Privileges";

    export type EntityRelatedMetadataPath =
        | EntityRelatedMetadataBasePath
        | `${EntityRelatedMetadataBasePath}/${string}`
        | `${EntityRelatedMetadataBasePath}(${string})`
        | `${EntityRelatedMetadataBasePath}(${string})/${string}`;

    type EntityRelatedMetadataRecordPath = `${EntityRelatedMetadataBasePath}/${string}` | `${EntityRelatedMetadataBasePath}(${string})` | `${EntityRelatedMetadataBasePath}(${string})/${string}`;

    export type EntityRelatedMetadataResponse<P extends EntityRelatedMetadataPath> = P extends EntityRelatedMetadataRecordPath ? Record<string, unknown> : { value: Record<string, unknown>[] };

    /**
     * Entity metadata collection response
     */
    export interface EntityMetadataCollection {
        value: EntityMetadata[];
    }

    /**
     * Supported inputs for solution deployment payloads
     */
    export type SolutionContentInput = string | ArrayBuffer | ArrayBufferView;

    /**
     * Record creation result
     */
    export interface CreateResult {
        id: string;
        [key: string]: unknown;
    }

    /**
     * EntityReference for Function parameters
     * User-friendly format that accepts entity logical name instead of requiring manual entity set name pluralization
     *
     * @example
     * // User-friendly format (recommended)
     * const target: EntityReference = {
     *     entityLogicalName: 'account',
     *     id: 'guid-here'
     * };
     *
     * @example
     * // Advanced format (also supported)
     * const target = {
     *     '@odata.id': 'accounts(guid-here)'
     * };
     */
    export interface EntityReference {
        /**
         * Logical name of the entity (e.g., 'account', 'contact', 'systemuser')
         * Will be automatically converted to entity set name (e.g., 'accounts', 'contacts', 'systemusers')
         */
        entityLogicalName: string;

        /**
         * GUID of the record
         */
        id: string;
    }

    /**
     * Execute operation request
     */
    export interface ExecuteRequest {
        /**
         * Name of the action or function to execute
         */
        operationName: string;

        /**
         * Type of operation - action or function
         */
        operationType: "action" | "function";

        /**
         * Entity logical name for bound operations
         */
        entityName?: string;

        /**
         * Record ID for bound operations
         */
        entityId?: string;

        /**
         * Parameters to pass to the operation
         *
         * ## For Functions (GET requests):
         * Parameters are passed in the URL query string using parameter aliases.
         *
         * ### Parameter Types:
         * - **Primitives**:
         *   - Strings: Automatically wrapped in single quotes (e.g., 'Pacific Standard Time')
         *   - Numbers: Passed as-is (e.g., 1033)
         *   - Booleans: Lowercase true/false
         *   - null: Passed as null
         *
         * - **EntityReference**:
         *   - Recommended: `{ entityLogicalName: 'account', id: 'guid' }`
         *   - Advanced: `{ '@odata.id': 'accounts(guid)' }`
         *
         * - **Enum values**:
         *   - Must use Microsoft.Dynamics.CRM prefix format
         *   - Single value: `"Microsoft.Dynamics.CRM.EntityFilters'Entity'"`
         *   - Multiple values: `"Microsoft.Dynamics.CRM.EntityFilters'Entity,Attributes,Relationships'"`
         *
         * - **Complex objects**: Will be JSON serialized (e.g., PagingInfo)
         * - **Arrays**: Will be JSON serialized
         *
         * ## For Actions (POST requests):
         * All parameters are passed in the request body as JSON.
         *
         * @example
         * // WhoAmI - Unbound function with no parameters
         * {
         *   operationName: 'WhoAmI',
         *   operationType: 'function'
         *   // No parameters needed
         * }
         *
         * @example
         * // RetrieveUserQueues - Bound function with boolean parameter
         * {
         *   entityName: 'systemuser',
         *   entityId: 'user-guid-here',
         *   operationName: 'RetrieveUserQueues',
         *   operationType: 'function',
         *   parameters: {
         *     IncludePublic: true
         *   }
         * }
         *
         * @example
         * // CalculateRollupField - Unbound function with EntityReference and string
         * {
         *   operationName: 'CalculateRollupField',
         *   operationType: 'function',
         *   parameters: {
         *     Target: { entityLogicalName: 'account', id: 'account-guid-here' },
         *     FieldName: 'new_totalrevenue'
         *   }
         * }
         *
         * @example
         * // GetTimeZoneCodeByLocalizedName - Unbound function with string and number
         * {
         *   operationName: 'GetTimeZoneCodeByLocalizedName',
         *   operationType: 'function',
         *   parameters: {
         *     LocalizedStandardName: 'Pacific Standard Time',
         *     LocaleId: 1033
         *   }
         * }
         *
         * @example
         * // RetrieveAllEntities - Unbound function with enum and boolean
         * {
         *   operationName: 'RetrieveAllEntities',
         *   operationType: 'function',
         *   parameters: {
         *     EntityFilters: "Microsoft.Dynamics.CRM.EntityFilters'Entity,Attributes,Relationships'",
         *     RetrieveAsIfPublished: false
         *   }
         * }
         *
         * @example
         * // RetrieveAttributeChangeHistory - Unbound function with EntityReference, string, and complex object
         * {
         *   operationName: 'RetrieveAttributeChangeHistory',
         *   operationType: 'function',
         *   parameters: {
         *     Target: { entityLogicalName: 'account', id: 'account-guid-here' },
         *     AttributeLogicalName: 'name',
         *     PagingInfo: {
         *       PageNumber: 1,
         *       Count: 10,
         *       ReturnTotalRecordCount: true
         *     }
         *   }
         * }
         *
         * @example
         * // ImportSolution - Unbound action with parameters in body
         * {
         *   operationName: 'ImportSolution',
         *   operationType: 'action',
         *   parameters: {
         *     CustomizationFile: 'base64-encoded-solution-zip',
         *     PublishWorkflows: true,
         *     OverwriteUnmanagedCustomizations: false
         *   }
         * }
         */
        parameters?: Record<string, unknown>;
    }

    /**
     * Localized label for metadata display names and descriptions
     */
    export interface LocalizedLabel {
        "@odata.type"?: "Microsoft.Dynamics.CRM.LocalizedLabel";
        Label: string;
        LanguageCode: number;
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
     * Used with getAttributeODataType() to generate full Microsoft.Dynamics.CRM.*AttributeMetadata type strings
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

    /**
     * Dataverse Web API for CRUD operations, queries, and metadata
     */
    export interface API {
        /**
         * Create a new record in Dataverse
         *
         * @param entityLogicalName - Logical name of the entity (e.g., 'account', 'contact')
         * @param record - Record data to create
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the created record ID and any returned fields
         *
         * @example
         * const result = await dataverseAPI.create('account', {
         *     name: 'Contoso Ltd',
         *     emailaddress1: 'info@contoso.com',
         *     telephone1: '555-0100'
         * });
         * console.log('Created account ID:', result.id);
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const result = await dataverseAPI.create('account', {
         *     name: 'Contoso Ltd'
         * }, 'secondary');
         */
        create: (entityLogicalName: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<CreateResult>;

        /**
         * Retrieve a single record by ID
         *
         * @param entityLogicalName - Logical name of the entity
         * @param id - GUID of the record
         * @param columns - Optional array of column names to retrieve (retrieves all if not specified)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the requested record
         *
         * @example
         * const account = await dataverseAPI.retrieve(
         *     'account',
         *     'guid-here',
         *     ['name', 'emailaddress1', 'telephone1']
         * );
         * console.log('Account name:', account.name);
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const account = await dataverseAPI.retrieve('account', 'guid-here', ['name'], 'secondary');
         */
        retrieve: (entityLogicalName: string, id: string, columns?: string[], connectionTarget?: "primary" | "secondary") => Promise<Record<string, unknown>>;

        /**
         * Update an existing record
         *
         * @param entityLogicalName - Logical name of the entity
         * @param id - GUID of the record
         * @param record - Fields to update
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * await dataverseAPI.update('account', 'guid-here', {
         *     name: 'Updated Account Name',
         *     description: 'Updated description'
         * });
         *
         * @example
         * // Multi-connection tool using secondary connection
         * await dataverseAPI.update('account', 'guid-here', { name: 'Updated' }, 'secondary');
         */
        update: (entityLogicalName: string, id: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<void>;

        /**
         * Delete a record
         *
         * @param entityLogicalName - Logical name of the entity
         * @param id - GUID of the record
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * await dataverseAPI.delete('account', 'guid-here');
         *
         * @example
         * // Multi-connection tool using secondary connection
         * await dataverseAPI.delete('account', 'guid-here', 'secondary');
         */
        delete: (entityLogicalName: string, id: string, connectionTarget?: "primary" | "secondary") => Promise<void>;

        /**
         * Execute a FetchXML query
         *
         * @param fetchXml - FetchXML query string
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object with value array containing matching records
         *
         * @example
         * const fetchXml = `
         * <fetch top="10">
         *   <entity name="account">
         *     <attribute name="name" />
         *     <attribute name="emailaddress1" />
         *     <filter>
         *       <condition attribute="statecode" operator="eq" value="0" />
         *     </filter>
         *     <order attribute="name" />
         *   </entity>
         * </fetch>
         * `;
         *
         * const result = await dataverseAPI.fetchXmlQuery(fetchXml);
         * console.log(`Found ${result.value.length} records`);
         * result.value.forEach(record => {
         *     console.log(record.name);
         * });
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const result = await dataverseAPI.fetchXmlQuery(fetchXml, 'secondary');
         */
        fetchXmlQuery: (fetchXml: string, connectionTarget?: "primary" | "secondary") => Promise<FetchXmlResult>;

        /**
         * Retrieve multiple records (alias for fetchXmlQuery for backward compatibility)
         *
         * @param fetchXml - FetchXML query string
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object with value array containing matching records
         */
        retrieveMultiple: (fetchXml: string, connectionTarget?: "primary" | "secondary") => Promise<FetchXmlResult>;

        /**
         * Execute a Dataverse Web API action or function
         *
         * @param request - Execute request configuration
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the operation result
         *
         * @example
         * // Execute WhoAmI function
         * const result = await dataverseAPI.execute({
         *     operationName: 'WhoAmI',
         *     operationType: 'function'
         * });
         * console.log('User ID:', result.UserId);
         *
         * @example
         * // Execute bound action
         * const result = await dataverseAPI.execute({
         *     entityName: 'account',
         *     entityId: 'guid-here',
         *     operationName: 'CalculateRollupField',
         *     operationType: 'action',
         *     parameters: {
         *         FieldName: 'total_revenue'
         *     }
         * });
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const result = await dataverseAPI.execute({
         *     operationName: 'WhoAmI',
         *     operationType: 'function'
         * }, 'secondary');
         */
        execute: (request: ExecuteRequest, connectionTarget?: "primary" | "secondary") => Promise<Record<string, unknown>>;

        /**
         * Get metadata for a specific entity
         *
         * @param entityLogicalName - Logical name of the entity
         * @param searchByLogicalName - Whether to search by logical name (true) or metadata ID (false)
         * @param selectColumns - Optional array of column names to retrieve (retrieves all if not specified)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing entity metadata
         *
         * @example
         * const metadata = await dataverseAPI.getEntityMetadata('account', true, ['LogicalName', 'DisplayName', 'EntitySetName']);
         * console.log('Logical Name:', metadata.LogicalName);
         * console.log('Display Name:', metadata.DisplayName?.LocalizedLabels[0]?.Label);
         *
         * @example
         * // Get entity metadata by metadata ID
         * const metadata = await dataverseAPI.getEntityMetadata('00000000-0000-0000-0000-000000000001', false, ['LogicalName', 'DisplayName']);
         * console.log('Entity Metadata ID:', metadata.MetadataId);
         * console.log('Logical Name:', metadata.LogicalName);
         * console.log('Display Name:', metadata.DisplayName?.LocalizedLabels[0]?.Label);
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const metadata = await dataverseAPI.getEntityMetadata('account', true, ['LogicalName'], 'secondary');
         */
        getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[], connectionTarget?: "primary" | "secondary") => Promise<EntityMetadata>;

        /**
         * Get metadata for all entities
         * @param selectColumns - Optional array of column names to retrieve (retrieves LogicalName, DisplayName, MetadataId by default)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object with value array containing all entity metadata
         *
         * @example
         * const allEntities = await dataverseAPI.getAllEntitiesMetadata(['LogicalName', 'DisplayName', 'EntitySetName'] );
         * console.log(`Total entities: ${allEntities.value.length}`);
         * allEntities.value.forEach(entity => {
         *     console.log(`${entity.LogicalName} - ${entity.DisplayName?.LocalizedLabels[0]?.Label}`);
         * });
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const allEntities = await dataverseAPI.getAllEntitiesMetadata(['LogicalName'], 'secondary');
         */
        getAllEntitiesMetadata: (selectColumns?: string[], connectionTarget?: "primary" | "secondary") => Promise<EntityMetadataCollection>;

        /**
         * Get related metadata for a specific entity (attributes, relationships, etc.)
         *
         * @param entityLogicalName - Logical name of the entity
         * @param relatedPath - Path after EntityDefinitions(LogicalName='name') (e.g., 'Attributes', 'OneToManyRelationships', 'ManyToOneRelationships', 'ManyToManyRelationships', 'Keys')
         * @param selectColumns - Optional array of column names to retrieve (retrieves all if not specified)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the related metadata
         *
         * @example
         * // Get all attributes for an entity
         * const attributes = await dataverseAPI.getEntityRelatedMetadata('account', 'Attributes');
         * console.log('Attributes:', attributes.value);
         *
         * @example
         * // Get specific attributes with select
         * const attributes = await dataverseAPI.getEntityRelatedMetadata(
         *     'account',
         *     'Attributes',
         *     ['LogicalName', 'DisplayName', 'AttributeType']
         * );
         * console.log('Filtered attributes:', attributes.value);
         *
         * @example
         * // Get a single attribute definition (returns an object, not a collection)
         * const nameAttribute = await dataverseAPI.getEntityRelatedMetadata(
         *     'account',
         *     "Attributes(LogicalName='name')"
         * );
         * console.log('Attribute type:', nameAttribute.AttributeType);
         *
         * @example
         * // Drill into an attribute's option set
         * const industryOptions = await dataverseAPI.getEntityRelatedMetadata(
         *     'account',
         *     "Attributes(LogicalName='industrycode')/OptionSet"
         * );
         * console.log('Industry options:', industryOptions.Options);
         *
         * @example
         * // Retrieve keys defined on the entity
         * const keys = await dataverseAPI.getEntityRelatedMetadata('account', 'Keys');
         * console.log('Entity keys:', keys.value);
         *
         * @example
         * // Retrieve many-to-one relationships (collection)
         * const m2oRelationships = await dataverseAPI.getEntityRelatedMetadata('account', 'ManyToOneRelationships');
         * console.log('Many-to-one count:', m2oRelationships.value.length);
         *
         * @example
         * // Retrieve one-to-many relationships (collection)
         * const o2mRelationships = await dataverseAPI.getEntityRelatedMetadata('account', 'OneToManyRelationships');
         * console.log('One-to-many relationships:', o2mRelationships.value.map((rel) => rel.SchemaName));
         *
         * @example
         * // Retrieve many-to-many relationships (collection)
         * const m2mRelationships = await dataverseAPI.getEntityRelatedMetadata('account', 'ManyToManyRelationships');
         * console.log('Many-to-many relationships:', m2mRelationships.value.map((rel) => rel.SchemaName));
         *
         * @example
         * // Retrieve privileges (collection)
         * const privileges = await dataverseAPI.getEntityRelatedMetadata('account', 'Privileges');
         * console.log('Privilege names:', privileges.value.map((priv) => priv.Name));
         *
         * @example
         * // Get one-to-many relationships
         * const relationships = await dataverseAPI.getEntityRelatedMetadata(
         *     'account',
         *     'OneToManyRelationships'
         * );
         * console.log('One-to-many relationships:', relationships.value);
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const attributes = await dataverseAPI.getEntityRelatedMetadata('account', 'Attributes', ['LogicalName'], 'secondary');
         */
        getEntityRelatedMetadata: <P extends EntityRelatedMetadataPath>(
            entityLogicalName: string,
            relatedPath: P,
            selectColumns?: string[],
            connectionTarget?: "primary" | "secondary",
        ) => Promise<EntityRelatedMetadataResponse<P>>;

        /**
         * Get solutions from the environment
         *
         * @param selectColumns - Required array of column names to retrieve (must contain at least one column)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object with value array containing solutions
         *
         * @example
         * const solutions = await dataverseAPI.getSolutions([
         *     'solutionid',
         *     'uniquename',
         *     'friendlyname',
         *     'version',
         *     'ismanaged'
         * ]);
         * console.log(`Total solutions: ${solutions.value.length}`);
         * solutions.value.forEach(solution => {
         *     console.log(`${solution.friendlyname} (${solution.uniquename}) - v${solution.version}`);
         * });
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const solutions = await dataverseAPI.getSolutions(['uniquename'], 'secondary');
         */
        getSolutions: (selectColumns: string[], connectionTarget?: "primary" | "secondary") => Promise<{ value: Record<string, unknown>[] }>;

        /**
         * Query data from Dataverse using OData query parameters
         *
         * @param odataQuery - OData query string with parameters like $select, $filter, $orderby, $top, $skip, $expand
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object with value array containing matching records
         *
         * @example
         * // Get top 10 active accounts with specific fields
         * const result = await dataverseAPI.queryData(
         *     'accounts?$select=name,emailaddress1,telephone1&$filter=statecode eq 0&$orderby=name&$top=10'
         * );
         * console.log(`Found ${result.value.length} records`);
         * result.value.forEach(record => {
         *     console.log(`${record.name} - ${record.emailaddress1}`);
         * });
         *
         * @example
         * // Query with expand to include related records
         * const result = await dataverseAPI.queryData(
         *     'accounts?$select=name,accountid&$expand=contact_customer_accounts($select=fullname,emailaddress1)&$top=5'
         * );
         *
         * @example
         * // Simple query with just a filter
         * const result = await dataverseAPI.queryData(
         *     '$filter=contains(fullname, \'Smith\')&$top=20'
         * );
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const result = await dataverseAPI.queryData('contacts?$filter=statecode eq 0', 'secondary');
         */
        queryData: (odataQuery: string, connectionTarget?: "primary" | "secondary") => Promise<{ value: Record<string, unknown>[] }>;

        /**
         * Publish customizations for the current environment.
         *
         * When `tableLogicalName` is provided, this method publishes only that table by executing the PublishXml action with a generated payload.
         * When no table name is provided, it runs PublishAllXml (equivalent to "Publish All Customizations").
         *
         * @param tableLogicalName - Optional table (entity) logical name to publish. If omitted, all pending customizations are published.
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * // Publish all customizations
         * await dataverseAPI.publishCustomizations();
         *
         * @example
         * // Publish only the account table
         * await dataverseAPI.publishCustomizations('account');
         */
        publishCustomizations: (tableLogicalName?: string, connectionTarget?: "primary" | "secondary") => Promise<void>;

        /**
         * Create multiple records in Dataverse
         *
         * @param entityLogicalName - Logical name of the entity (e.g., 'account', 'contact')
         * @param records - Array of record data to create, including the "@odata.type" property for each record
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Array of strings representing the created record IDs
         *
         * @example
         * const results = await dataverseAPI.createMultiple('account', [
         *     { name: 'Contoso Ltd', "@odata.type": "Microsoft.Dynamics.CRM.account" },
         *     { name: 'Fabrikam Inc', "@odata.type": "Microsoft.Dynamics.CRM.account" }
         * ]);
         */
        createMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") => Promise<string[]>;

        /**
         * Update multiple records in Dataverse
         * @param entityLogicalName - Logical name of the entity
         * @param records - Array of record data to update, each including the "id" property and the "odata.type" property
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * await dataverseAPI.updateMultiple('account', [
         *     { accountid: 'guid-1', name: 'Updated Name 1', "@odata.type": "Microsoft.Dynamics.CRM.account" },
         *     { accountid: 'guid-2', name: 'Updated Name 2', "@odata.type": "Microsoft.Dynamics.CRM.account" }
         * ]);
         */
        updateMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") => Promise<void>;

        /**
         * Gets the Dataverse entity set (collection) name for the specified table.
         *
         * This is typically used when building OData queries where the collection name
         * (entity set name) is required instead of the logical table name.
         *
         * Note: This is a utility method that applies pluralization rules and does not
         * require an active connection to Dataverse.
         *
         * @param entityLogicalName - The logical name of the Dataverse table (for example, "account").
         * @returns The corresponding entity set name (for example, "accounts").
         *
         * @example
         * const entitySetName = await dataverseAPI.getEntitySetName('account');
         * console.log(entitySetName); // Output: "accounts"
         *
         * @example
         * const entitySetName = await dataverseAPI.getEntitySetName('opportunity');
         * console.log(entitySetName); // Output: "opportunities"
         */
        getEntitySetName: (entityLogicalName: string) => Promise<string>;

        /**
         * Associate two records in a many-to-many relationship
         *
         * @param primaryEntityName - Logical name of the primary entity (e.g., 'systemuser', 'team')
         * @param primaryEntityId - GUID of the primary record
         * @param relationshipName - Logical name of the N-to-N relationship (e.g., 'systemuserroles_association', 'teammembership_association')
         * @param relatedEntityName - Logical name of the related entity (e.g., 'role', 'systemuser')
         * @param relatedEntityId - GUID of the related record
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * // Assign a security role to a user
         * await dataverseAPI.associate(
         *     'systemuser',
         *     'user-guid-here',
         *     'systemuserroles_association',
         *     'role',
         *     'role-guid-here'
         * );
         *
         * @example
         * // Add a user to a team
         * await dataverseAPI.associate(
         *     'team',
         *     'team-guid-here',
         *     'teammembership_association',
         *     'systemuser',
         *     'user-guid-here'
         * );
         *
         * @example
         * // Multi-connection tool using secondary connection
         * await dataverseAPI.associate(
         *     'systemuser',
         *     'user-guid',
         *     'systemuserroles_association',
         *     'role',
         *     'role-guid',
         *     'secondary'
         * );
         */
        associate: (
            primaryEntityName: string,
            primaryEntityId: string,
            relationshipName: string,
            relatedEntityName: string,
            relatedEntityId: string,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<void>;

        /**
         * Disassociate two records in a many-to-many relationship
         *
         * @param primaryEntityName - Logical name of the primary entity (e.g., 'systemuser', 'team')
         * @param primaryEntityId - GUID of the primary record
         * @param relationshipName - Logical name of the N-to-N relationship (e.g., 'systemuserroles_association', 'teammembership_association')
         * @param relatedEntityId - GUID of the related record to disassociate
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * // Remove a security role from a user
         * await dataverseAPI.disassociate(
         *     'systemuser',
         *     'user-guid-here',
         *     'systemuserroles_association',
         *     'role-guid-here'
         * );
         *
         * @example
         * // Remove a user from a team
         * await dataverseAPI.disassociate(
         *     'team',
         *     'team-guid-here',
         *     'teammembership_association',
         *     'user-guid-here'
         * );
         *
         * @example
         * // Multi-connection tool using secondary connection
         * await dataverseAPI.disassociate(
         *     'systemuser',
         *     'user-guid',
         *     'systemuserroles_association',
         *     'role-guid',
         *     'secondary'
         * );
         */
        disassociate: (primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") => Promise<void>;

        /**
         * Deploy (import) a solution to the Dataverse environment
         *
         * @param solutionContent - Base64-encoded solution zip string or binary data (Buffer, Uint8Array, ArrayBuffer)
         * @param options - Optional import settings to customize the deployment
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the ImportJobId for tracking the import progress
         *
         * @example
         * // Read solution file and deploy with default options
         * const solutionFile = await toolboxAPI.fileSystem.readBinary('/path/to/solution.zip');
         * const result = await dataverseAPI.deploySolution(solutionFile);
         * console.log('Import Job ID:', result.ImportJobId);
         *
         * @example
         * // Deploy solution with custom options
         * const result = await dataverseAPI.deploySolution(solutionFile, {
         *     publishWorkflows: true,
         *     overwriteUnmanagedCustomizations: false,
         *     skipProductUpdateDependencies: false,
         *     convertToManaged: false
         * });
         * console.log('Solution deployment started. Import Job ID:', result.ImportJobId);
         *
         * @example
         * // Deploy solution using a manually encoded base64 string with specific import job ID
         * const importJobId = crypto.randomUUID();
         * const base64Content = btoa(String.fromCharCode(...new Uint8Array(solutionFile)));
         * const result = await dataverseAPI.deploySolution(base64Content, {
         *     importJobId: importJobId,
         *     publishWorkflows: true
         * });
         * console.log('Tracking import with job ID:', result.ImportJobId);
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const result = await dataverseAPI.deploySolution(solutionFile, {
         *     publishWorkflows: true
         * }, 'secondary');
         */
        deploySolution: (
            solutionContent: SolutionContentInput,
            options?: {
                /**
                 * Optional GUID to track the import job. If not provided, Dataverse generates one.
                 */
                importJobId?: string;
                /**
                 * Whether to publish workflows after import. Defaults to false when omitted.
                 */
                publishWorkflows?: boolean;
                /**
                 * Whether to overwrite existing unmanaged customizations. Defaults to false when omitted.
                 */
                overwriteUnmanagedCustomizations?: boolean;
                /**
                 * Whether to skip dependency checks for product updates. Default is undefined (Dataverse decides).
                 */
                skipProductUpdateDependencies?: boolean;
                /**
                 * Whether to convert the solution to managed. Default is undefined (Dataverse decides).
                 */
                convertToManaged?: boolean;
            },
            connectionTarget?: "primary" | "secondary",
        ) => Promise<{ ImportJobId: string }>;

        /**
         * Get the status of a solution import job
         *
         * @param importJobId - GUID of the import job to track (returned from deploySolution)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing import job details including progress, status, and error information
         *
         * @example
         * // Deploy and track solution import
         * const deployResult = await dataverseAPI.deploySolution(base64Content);
         * const importJobId = deployResult.ImportJobId;
         *
         * // Poll for status
         * const status = await dataverseAPI.getImportJobStatus(importJobId);
         * console.log('Import progress:', status.progress + '%');
         * console.log('Started:', status.startedon);
         * console.log('Completed:', status.completedon);
         * if (status.data) {
         *     console.log('Import details:', status.data);
         * }
         *
         * @example
         * // Check import status with polling
         * async function waitForImport(importJobId: string) {
         *     while (true) {
         *         const status = await dataverseAPI.getImportJobStatus(importJobId);
         *         console.log(`Progress: ${status.progress}%`);
         *
         *         if (status.completedon) {
         *             console.log('Import completed!');
         *             break;
         *         }
         *
         *         // Wait 2 seconds before checking again
         *         await new Promise(resolve => setTimeout(resolve, 2000));
         *     }
         * }
         *
         * @example
         * // Multi-connection tool using secondary connection
         * const status = await dataverseAPI.getImportJobStatus(importJobId, 'secondary');
         */
        getImportJobStatus: (importJobId: string, connectionTarget?: "primary" | "secondary") => Promise<Record<string, unknown>>;

        // ========================================
        // Metadata Helper Utilities
        // ========================================

        /**
         * Build a Label structure for metadata display names and descriptions
         * Helper utility to simplify creating localized labels for metadata operations
         *
         * @param text - Display text for the label
         * @param languageCode - Optional language code (defaults to 1033 for English)
         * @returns Label object with properly formatted LocalizedLabels array
         *
         * @example
         * const label = dataverseAPI.buildLabel("Account Name");
         * // Returns: { LocalizedLabels: [{ Label: "Account Name", LanguageCode: 1033 }] }
         *
         * @example
         * // Create label with specific language code
         * const frenchLabel = dataverseAPI.buildLabel("Nom du compte", 1036);
         */
        buildLabel: (text: string, languageCode?: number) => Label;

        /**
         * Retrieve the CSDL/EDMX metadata document for the Dataverse environment
         *
         * Returns the complete OData service document as raw XML containing metadata for:
         * - EntityType definitions (tables/entities)
         * - Property elements (attributes/columns)
         * - NavigationProperty elements (relationships)
         * - ComplexType definitions (return types for actions/functions)
         * - EnumType definitions (picklist/choice enumerations)
         * - Action definitions (OData Actions - POST operations)
         * - Function definitions (OData Functions - GET operations)
         * - EntityContainer metadata
         *
         * The response is automatically compressed with gzip during transfer for optimal performance,
         * then decompressed and returned as a raw XML string.
         *
         * @param connectionTarget - Optional connection target for multi-connection tools
         * @returns Raw CSDL/EDMX XML document as string (typically 1-5MB)
         */
        getCSDLDocument: (connectionTarget?: "primary" | "secondary") => Promise<string>;

        /**
         * Get the OData type string for an attribute metadata type
         * Converts AttributeMetadataType enum to full Microsoft.Dynamics.CRM type path
         *
         * @param attributeType - Attribute metadata type enum value
         * @returns Full OData type string (e.g., "Microsoft.Dynamics.CRM.StringAttributeMetadata")
         *
         * @example
         * const odataType = dataverseAPI.getAttributeODataType(DataverseAPI.AttributeMetadataType.String);
         * // Returns: "Microsoft.Dynamics.CRM.StringAttributeMetadata"
         *
         * @example
         * // Use in attribute definition
         * const attributeDef = {
         *   "@odata.type": dataverseAPI.getAttributeODataType(DataverseAPI.AttributeMetadataType.Integer),
         *   "SchemaName": "new_priority",
         *   "DisplayName": dataverseAPI.buildLabel("Priority")
         * };
         */
        getAttributeODataType: (attributeType: AttributeMetadataType) => string;

        // ========================================
        // Entity (Table) Metadata CRUD Operations
        // ========================================

        /**
         * Create a new entity (table) definition in Dataverse
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param entityDefinition - Entity metadata payload (must include SchemaName, DisplayName, OwnershipType, and at least one Attribute with IsPrimaryName=true)
         * @param options - Optional metadata operation options (solution assignment, etc.)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the created entity's MetadataId
         *
         * @example
         * // Create a new custom table
         * const result = await dataverseAPI.createEntityDefinition({
         *   "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
         *   "SchemaName": "new_project",
         *   "DisplayName": dataverseAPI.buildLabel("Project"),
         *   "DisplayCollectionName": dataverseAPI.buildLabel("Projects"),
         *   "Description": dataverseAPI.buildLabel("Project tracking table"),
         *   "OwnershipType": "UserOwned",
         *   "HasActivities": true,
         *   "HasNotes": true,
         *   "Attributes": [{
         *     "@odata.type": dataverseAPI.getAttributeODataType(DataverseAPI.AttributeMetadataType.String),
         *     "SchemaName": "new_name",
         *     "RequiredLevel": { "Value": "None" },
         *     "MaxLength": 100,
         *     "FormatName": { "Value": "Text" },
         *     "IsPrimaryName": true,
         *     "DisplayName": dataverseAPI.buildLabel("Project Name"),
         *     "Description": dataverseAPI.buildLabel("The name of the project")
         *   }]
         * }, {
         *   solutionUniqueName: "MySolution"
         * });
         *
         * console.log("Created entity with MetadataId:", result.id);
         *
         * // IMPORTANT: Publish customizations to make changes active
         * await dataverseAPI.publishCustomizations("new_project");
         */
        createEntityDefinition: (entityDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => Promise<{ id: string }>;

        /**
         * Update an entity (table) definition
         * NOTE: Uses PUT method which requires the FULL entity definition (retrieve-modify-PUT pattern)
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param entityIdentifier - Entity LogicalName or MetadataId
         * @param entityDefinition - Complete entity metadata payload with all properties
         * @param options - Optional metadata operation options (mergeLabels defaults to true to preserve translations)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * // Retrieve-Modify-PUT Pattern for updating entity metadata
         *
         * // Step 1: Retrieve current entity definition
         * const currentDef = await dataverseAPI.getEntityMetadata("new_project", true);
         *
         * // Step 2: Modify desired properties (must include ALL properties, not just changes)
         * currentDef.DisplayName = dataverseAPI.buildLabel("Updated Project Name");
         * currentDef.Description = dataverseAPI.buildLabel("Updated description");
         *
         * // Step 3: PUT the entire definition back (mergeLabels=true preserves other language translations)
         * await dataverseAPI.updateEntityDefinition("new_project", currentDef, {
         *   mergeLabels: true,  // Preserve existing translations
         *   solutionUniqueName: "MySolution"
         * });
         *
         * // Step 4: Publish customizations to activate changes
         * await dataverseAPI.publishCustomizations("new_project");
         *
         * @example
         * // Update using MetadataId instead of LogicalName
         * await dataverseAPI.updateEntityDefinition(
         *   "70816501-edb9-4740-a16c-6a5efbc05d84",
         *   updatedDefinition,
         *   { mergeLabels: true }
         * );
         */
        updateEntityDefinition: (entityIdentifier: string, entityDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => Promise<void>;

        /**
         * Delete an entity (table) definition
         * WARNING: This is a destructive operation that removes the table and all its data
         *
         * @param entityIdentifier - Entity LogicalName or MetadataId
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * // Delete a custom table (will fail if dependencies exist)
         * await dataverseAPI.deleteEntityDefinition("new_project");
         *
         * @example
         * // Delete using MetadataId
         * await dataverseAPI.deleteEntityDefinition("70816501-edb9-4740-a16c-6a5efbc05d84");
         */
        deleteEntityDefinition: (entityIdentifier: string, connectionTarget?: "primary" | "secondary") => Promise<void>;

        // ========================================
        // Attribute (Column) Metadata CRUD Operations
        // ========================================

        /**
         * Create a new attribute (column) on an existing entity
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param entityLogicalName - Logical name of the entity to add the attribute to
         * @param attributeDefinition - Attribute metadata payload (must include @odata.type, SchemaName, DisplayName)
         * @param options - Optional metadata operation options
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the created attribute's MetadataId
         *
         * @example
         * // Create a text column
         * const result = await dataverseAPI.createAttribute("new_project", {
         *   "@odata.type": dataverseAPI.getAttributeODataType(DataverseAPI.AttributeMetadataType.String),
         *   "SchemaName": "new_description",
         *   "DisplayName": dataverseAPI.buildLabel("Description"),
         *   "Description": dataverseAPI.buildLabel("Project description"),
         *   "RequiredLevel": { "Value": "None" },
         *   "MaxLength": 500,
         *   "FormatName": { "Value": "Text" }
         * }, {
         *   solutionUniqueName: "MySolution"
         * });
         *
         * console.log("Created attribute with MetadataId:", result.id);
         * await dataverseAPI.publishCustomizations("new_project");
         *
         * @example
         * // Create a whole number column
         * await dataverseAPI.createAttribute("new_project", {
         *   "@odata.type": dataverseAPI.getAttributeODataType(DataverseAPI.AttributeMetadataType.Integer),
         *   "SchemaName": "new_priority",
         *   "DisplayName": dataverseAPI.buildLabel("Priority"),
         *   "RequiredLevel": { "Value": "None" },
         *   "MinValue": 1,
         *   "MaxValue": 100
         * });
         * await dataverseAPI.publishCustomizations("new_project");
         *
         * @example
         * // Create a choice (picklist) column
         * await dataverseAPI.createAttribute("new_project", {
         *   "@odata.type": dataverseAPI.getAttributeODataType(DataverseAPI.AttributeMetadataType.Picklist),
         *   "SchemaName": "new_status",
         *   "DisplayName": dataverseAPI.buildLabel("Status"),
         *   "RequiredLevel": { "Value": "None" },
         *   "OptionSet": {
         *     "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
         *     "OptionSetType": "Picklist",
         *     "Options": [
         *       { "Value": 1, "Label": dataverseAPI.buildLabel("Active") },
         *       { "Value": 2, "Label": dataverseAPI.buildLabel("On Hold") },
         *       { "Value": 3, "Label": dataverseAPI.buildLabel("Completed") }
         *     ]
         *   }
         * });
         * await dataverseAPI.publishCustomizations("new_project");
         */
        createAttribute: (
            entityLogicalName: string,
            attributeDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<{ id: string }>;

        /**
         * Update an attribute (column) definition
         * NOTE: Uses PUT method which requires the FULL attribute definition (retrieve-modify-PUT pattern)
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param entityLogicalName - Logical name of the entity
         * @param attributeIdentifier - Attribute LogicalName or MetadataId
         * @param attributeDefinition - Complete attribute metadata payload
         * @param options - Optional metadata operation options (mergeLabels defaults to true)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * // Retrieve-Modify-PUT Pattern for updating attribute metadata
         *
         * // Step 1: Retrieve current attribute definition
         * const currentAttr = await dataverseAPI.getEntityRelatedMetadata(
         *   "new_project",
         *   "Attributes(LogicalName='new_description')"
         * );
         *
         * // Step 2: Modify desired properties
         * currentAttr.DisplayName = dataverseAPI.buildLabel("Updated Description");
         * currentAttr.MaxLength = 1000;  // Increase max length
         *
         * // Step 3: PUT entire definition back
         * await dataverseAPI.updateAttribute(
         *   "new_project",
         *   "new_description",
         *   currentAttr,
         *   { mergeLabels: true }
         * );
         *
         * // Step 4: Publish customizations
         * await dataverseAPI.publishCustomizations("new_project");
         */
        updateAttribute: (
            entityLogicalName: string,
            attributeIdentifier: string,
            attributeDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<void>;

        /**
         * Delete an attribute (column) from an entity
         * WARNING: This is a destructive operation that removes the column and all its data
         *
         * @param entityLogicalName - Logical name of the entity
         * @param attributeIdentifier - Attribute LogicalName or MetadataId
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * await dataverseAPI.deleteAttribute("new_project", "new_description");
         *
         * @example
         * // Delete using MetadataId
         * await dataverseAPI.deleteAttribute("new_project", "00aa00aa-bb11-cc22-dd33-44ee44ee44ee");
         */
        deleteAttribute: (entityLogicalName: string, attributeIdentifier: string, connectionTarget?: "primary" | "secondary") => Promise<void>;

        /**
         * Create a polymorphic lookup attribute (Customer/Regarding field)
         * Creates a lookup that can reference multiple entity types
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param entityLogicalName - Logical name of the entity to add the attribute to
         * @param attributeDefinition - Lookup attribute metadata with Targets array
         * @param options - Optional metadata operation options
         * @returns Object containing the created attribute's MetadataId
         * @param connectionTarget - Optional connection target ("primary" or "secondary")
         *
         * @example
         * // Create a Customer lookup (Account or Contact)
         * const result = await dataverseAPI.createPolymorphicLookupAttribute("new_order", {
         *   "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
         *   "SchemaName": "new_CustomerId",
         *   "LogicalName": "new_customerid",
         *   "DisplayName": buildLabel("Customer"),
         *   "Description": buildLabel("Customer for this order"),
         *   "RequiredLevel": { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
         *   "AttributeType": "Lookup",
         *   "AttributeTypeName": { Value: "LookupType" },
         *   "Targets": ["account", "contact"]
         * });
         * await dataverseAPI.publishCustomizations();
         */
        createPolymorphicLookupAttribute: (
            entityLogicalName: string,
            attributeDefinition: Record<string, unknown>,
            options?: Record<string, unknown>,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<{ AttributeId: string }>;

        // ========================================
        // Relationship Metadata CRUD Operations
        // ========================================

        /**
         * Create a new relationship (1:N or N:N)
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param relationshipDefinition - Relationship metadata payload (must include @odata.type for OneToManyRelationshipMetadata or ManyToManyRelationshipMetadata)
         * @param options - Optional metadata operation options
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the created relationship's MetadataId
         *
         * @example
         * // Create 1:N relationship (Project -> Tasks)
         * const result = await dataverseAPI.createRelationship({
         *   "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
         *   "SchemaName": "new_project_tasks",
         *   "ReferencedEntity": "new_project",
         *   "ReferencedAttribute": "new_projectid",
         *   "ReferencingEntity": "task",
         *   "CascadeConfiguration": {
         *     "Assign": "NoCascade",
         *     "Delete": "RemoveLink",
         *     "Merge": "NoCascade",
         *     "Reparent": "NoCascade",
         *     "Share": "NoCascade",
         *     "Unshare": "NoCascade"
         *   },
         *   "Lookup": {
         *     "@odata.type": dataverseAPI.getAttributeODataType(DataverseAPI.AttributeMetadataType.Lookup),
         *     "SchemaName": "new_projectid",
         *     "DisplayName": dataverseAPI.buildLabel("Project"),
         *     "RequiredLevel": { "Value": "None" }
         *   }
         * }, {
         *   solutionUniqueName: "MySolution"
         * });
         *
         * await dataverseAPI.publishCustomizations();
         *
         * @example
         * // Create N:N relationship (Projects <-> Users)
         * await dataverseAPI.createRelationship({
         *   "@odata.type": "Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata",
         *   "SchemaName": "new_project_systemuser",
         *   "Entity1LogicalName": "new_project",
         *   "Entity2LogicalName": "systemuser",
         *   "IntersectEntityName": "new_project_systemuser"
         * });
         * await dataverseAPI.publishCustomizations();
         */
        createRelationship: (relationshipDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => Promise<{ id: string }>;

        /**
         * Update a relationship definition
         * NOTE: Uses PUT method which requires the FULL relationship definition (retrieve-modify-PUT pattern)
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param relationshipIdentifier - Relationship SchemaName or MetadataId
         * @param relationshipDefinition - Complete relationship metadata payload
         * @param options - Optional metadata operation options (mergeLabels defaults to true)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         */
        updateRelationship: (
            relationshipIdentifier: string,
            relationshipDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<void>;

        /**
         * Delete a relationship
         * WARNING: This removes the relationship and any associated lookup columns
         *
         * @param relationshipIdentifier - Relationship SchemaName or MetadataId
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * await dataverseAPI.deleteRelationship("new_project_tasks");
         */
        deleteRelationship: (relationshipIdentifier: string, connectionTarget?: "primary" | "secondary") => Promise<void>;

        // ========================================
        // Global Option Set (Choice) CRUD Operations
        // ========================================

        /**
         * Create a new global option set (global choice)
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param optionSetDefinition - Global option set metadata payload
         * @param options - Optional metadata operation options
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Object containing the created option set's MetadataId
         *
         * @example
         * const result = await dataverseAPI.createGlobalOptionSet({
         *   "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
         *   "Name": "new_projectstatus",
         *   "DisplayName": dataverseAPI.buildLabel("Project Status"),
         *   "Description": dataverseAPI.buildLabel("Global choice for project status"),
         *   "OptionSetType": "Picklist",
         *   "IsGlobal": true,
         *   "Options": [
         *     { "Value": 1, "Label": dataverseAPI.buildLabel("Active") },
         *     { "Value": 2, "Label": dataverseAPI.buildLabel("On Hold") },
         *     { "Value": 3, "Label": dataverseAPI.buildLabel("Completed") },
         *     { "Value": 4, "Label": dataverseAPI.buildLabel("Cancelled") }
         *   ]
         * }, {
         *   solutionUniqueName: "MySolution"
         * });
         *
         * await dataverseAPI.publishCustomizations();
         */
        createGlobalOptionSet: (optionSetDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => Promise<{ id: string }>;

        /**
         * Update a global option set definition
         * NOTE: Uses PUT method which requires the FULL option set definition (retrieve-modify-PUT pattern)
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param optionSetIdentifier - Option set Name or MetadataId
         * @param optionSetDefinition - Complete option set metadata payload
         * @param options - Optional metadata operation options (mergeLabels defaults to true)
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         */
        updateGlobalOptionSet: (
            optionSetIdentifier: string,
            optionSetDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<void>;

        /**
         * Delete a global option set
         * WARNING: This will fail if any attributes reference this global option set
         *
         * @param optionSetIdentifier - Option set Name or MetadataId
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         *
         * @example
         * await dataverseAPI.deleteGlobalOptionSet("new_projectstatus");
         */
        deleteGlobalOptionSet: (optionSetIdentifier: string, connectionTarget?: "primary" | "secondary") => Promise<void>;

        // ========================================
        // Option Value Modification Actions
        // ========================================

        /**
         * Insert a new option value into a local or global option set
         * NOTE: Works for both local option sets (specify EntityLogicalName + AttributeLogicalName)
         * and global option sets (specify OptionSetName)
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param params - Parameters for inserting the option value
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Result of the insert operation
         *
         * @example
         * // Insert into local option set on an entity
         * await dataverseAPI.insertOptionValue({
         *   EntityLogicalName: "new_project",
         *   AttributeLogicalName: "new_priority",
         *   Value: 4,
         *   Label: dataverseAPI.buildLabel("Critical"),
         *   Description: dataverseAPI.buildLabel("Highest priority level")
         * });
         * await dataverseAPI.publishCustomizations("new_project");
         *
         * @example
         * // Insert into global option set
         * await dataverseAPI.insertOptionValue({
         *   OptionSetName: "new_projectstatus",
         *   Value: 5,
         *   Label: dataverseAPI.buildLabel("Archived"),
         *   SolutionUniqueName: "MySolution"
         * });
         * await dataverseAPI.publishCustomizations();
         */
        insertOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<Record<string, unknown>>;

        /**
         * Update an existing option value in a local or global option set
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param params - Parameters for updating the option value
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Result of the update operation
         *
         * @example
         * // Update option label in local option set
         * await dataverseAPI.updateOptionValue({
         *   EntityLogicalName: "new_project",
         *   AttributeLogicalName: "new_priority",
         *   Value: 4,
         *   Label: dataverseAPI.buildLabel("High Priority"),
         *   MergeLabels: true  // Preserve other language translations
         * });
         * await dataverseAPI.publishCustomizations("new_project");
         *
         * @example
         * // Update option in global option set
         * await dataverseAPI.updateOptionValue({
         *   OptionSetName: "new_projectstatus",
         *   Value: 5,
         *   Label: dataverseAPI.buildLabel("Closed"),
         *   MergeLabels: true
         * });
         * await dataverseAPI.publishCustomizations();
         */
        updateOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<Record<string, unknown>>;

        /**
         * Delete an option value from a local or global option set
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param params - Parameters for deleting the option value
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Result of the delete operation
         *
         * @example
         * // Delete option from local option set
         * await dataverseAPI.deleteOptionValue({
         *   EntityLogicalName: "new_project",
         *   AttributeLogicalName: "new_priority",
         *   Value: 4
         * });
         * await dataverseAPI.publishCustomizations("new_project");
         *
         * @example
         * // Delete option from global option set
         * await dataverseAPI.deleteOptionValue({
         *   OptionSetName: "new_projectstatus",
         *   Value: 5
         * });
         * await dataverseAPI.publishCustomizations();
         */
        deleteOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<Record<string, unknown>>;

        /**
         * Reorder options in a local or global option set
         * NOTE: Metadata changes require explicit publishCustomizations() call to become active
         *
         * @param params - Parameters for ordering options
         * @param connectionTarget - Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @returns Result of the order operation
         *
         * @example
         * // Reorder options in local option set
         * await dataverseAPI.orderOption({
         *   EntityLogicalName: "new_project",
         *   AttributeLogicalName: "new_priority",
         *   Values: [3, 1, 2, 4]  // Reorder by option values
         * });
         * await dataverseAPI.publishCustomizations("new_project");
         *
         * @example
         * // Reorder global option set
         * await dataverseAPI.orderOption({
         *   OptionSetName: "new_projectstatus",
         *   Values: [1, 2, 3, 5, 4]
         * });
         * await dataverseAPI.publishCustomizations();
         */
        orderOption: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<Record<string, unknown>>;
    }
}

/**
 * Global window interface extension for Dataverse API
 */
declare global {
    interface Window {
        /**
         * Dataverse Web API for interacting with Microsoft Dataverse
         */
        dataverseAPI: DataverseAPI.API;
    }
}

export = DataverseAPI;
export as namespace DataverseAPI;
