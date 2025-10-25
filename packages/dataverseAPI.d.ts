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
         * @returns Object containing the created record ID and any returned fields
         *
         * @example
         * const result = await dataverseAPI.create('account', {
         *     name: 'Contoso Ltd',
         *     emailaddress1: 'info@contoso.com',
         *     telephone1: '555-0100'
         * });
         * console.log('Created account ID:', result.id);
         */
        create: (entityLogicalName: string, record: Record<string, unknown>) => Promise<CreateResult>;

        /**
         * Retrieve a single record by ID
         *
         * @param entityLogicalName - Logical name of the entity
         * @param id - GUID of the record
         * @param columns - Optional array of column names to retrieve (retrieves all if not specified)
         * @returns Object containing the requested record
         *
         * @example
         * const account = await dataverseAPI.retrieve(
         *     'account',
         *     'guid-here',
         *     ['name', 'emailaddress1', 'telephone1']
         * );
         * console.log('Account name:', account.name);
         */
        retrieve: (entityLogicalName: string, id: string, columns?: string[]) => Promise<Record<string, unknown>>;

        /**
         * Update an existing record
         *
         * @param entityLogicalName - Logical name of the entity
         * @param id - GUID of the record
         * @param record - Fields to update
         *
         * @example
         * await dataverseAPI.update('account', 'guid-here', {
         *     name: 'Updated Account Name',
         *     description: 'Updated description'
         * });
         */
        update: (entityLogicalName: string, id: string, record: Record<string, unknown>) => Promise<void>;

        /**
         * Delete a record
         *
         * @param entityLogicalName - Logical name of the entity
         * @param id - GUID of the record
         *
         * @example
         * await dataverseAPI.delete('account', 'guid-here');
         */
        delete: (entityLogicalName: string, id: string) => Promise<void>;

        /**
         * Execute a FetchXML query
         *
         * @param fetchXml - FetchXML query string
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
         */
        fetchXmlQuery: (fetchXml: string) => Promise<FetchXmlResult>;

        /**
         * Retrieve multiple records (alias for fetchXmlQuery for backward compatibility)
         *
         * @param fetchXml - FetchXML query string
         * @returns Object with value array containing matching records
         */
        retrieveMultiple: (fetchXml: string) => Promise<FetchXmlResult>;

        /**
         * Execute a Dataverse Web API action or function
         *
         * @param request - Execute request configuration
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
         */
        execute: (request: ExecuteRequest) => Promise<Record<string, unknown>>;

        /**
         * Get metadata for a specific entity
         *
         * @param entityLogicalName - Logical name of the entity
         * @returns Object containing entity metadata
         *
         * @example
         * const metadata = await dataverseAPI.getEntityMetadata('account');
         * console.log('Display Name:', metadata.DisplayName?.LocalizedLabels[0]?.Label);
         * console.log('Attributes:', metadata.Attributes?.length);
         */
        getEntityMetadata: (entityLogicalName: string) => Promise<EntityMetadata>;

        /**
         * Get metadata for all entities
         *
         * @returns Object with value array containing all entity metadata
         *
         * @example
         * const allEntities = await dataverseAPI.getAllEntitiesMetadata();
         * console.log(`Total entities: ${allEntities.value.length}`);
         * allEntities.value.forEach(entity => {
         *     console.log(`${entity.LogicalName} - ${entity.DisplayName?.LocalizedLabels[0]?.Label}`);
         * });
         */
        getAllEntitiesMetadata: () => Promise<EntityMetadataCollection>;
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
