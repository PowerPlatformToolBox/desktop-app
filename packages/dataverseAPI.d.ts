/**
 * Power Platform Tool Box - Dataverse API Type Definitions
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
        Attributes?: unknown[];
        [key: string]: unknown;
    }

    /**
     * Entity metadata collection response
     */
    export interface EntityMetadataCollection {
        value: EntityMetadata[];
    }

    /**
     * Record creation result
     */
    export interface CreateResult {
        id: string;
        [key: string]: unknown;
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
         */
        parameters?: Record<string, unknown>;
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
        getEntityRelatedMetadata: (entityLogicalName: string, relatedPath: string, selectColumns?: string[], connectionTarget?: "primary" | "secondary") => Promise<Record<string, unknown>>;

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
         *     '$select=name,emailaddress1,telephone1&$filter=statecode eq 0&$orderby=name&$top=10'
         * );
         * console.log(`Found ${result.value.length} records`);
         * result.value.forEach(record => {
         *     console.log(`${record.name} - ${record.emailaddress1}`);
         * });
         *
         * @example
         * // Query with expand to include related records
         * const result = await dataverseAPI.queryData(
         *     '$select=name,accountid&$expand=contact_customer_accounts($select=fullname,emailaddress1)&$top=5'
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
         * const result = await dataverseAPI.queryData('$filter=statecode eq 0', 'secondary');
         */
        queryData: (odataQuery: string, connectionTarget?: "primary" | "secondary") => Promise<{ value: Record<string, unknown>[] }>;

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
