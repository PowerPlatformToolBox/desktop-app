import * as https from "https";
import * as zlib from "zlib";
import { promisify } from "util";
import {
    DataverseConnection,
    ENTITY_RELATED_METADATA_BASE_PATHS,
    EntityRelatedMetadataPath,
    EntityRelatedMetadataResponse,
    AttributeMetadataType,
    Label,
    LocalizedLabel,
    MetadataOperationOptions,
} from "../../common/types";
import { captureMessage } from "../../common/sentryHelper";
import { DATAVERSE_API_VERSION } from "../constants";
import { AuthManager } from "./authManager";
import { ConnectionsManager } from "./connectionsManager";

/**
 * Dataverse API response type
 */
interface DataverseResponse {
    [key: string]: unknown;
}

/**
 * Dataverse error response
 */
interface DataverseError {
    error: {
        code: string;
        message: string;
    };
}

/**
 * FetchXML query result
 */
interface FetchXmlResult {
    value: Record<string, unknown>[];
    "@odata.context"?: string;
    "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"?: string;
}

/**
 * Entity metadata response
 */
interface EntityMetadata {
    MetadataId: string;
    LogicalName: string;
    DisplayName?: {
        LocalizedLabels: Array<{ Label: string; LanguageCode: number }>;
    };
    [key: string]: unknown;
}

const ENTITY_RELATED_METADATA_BASE_PATH_SET: Set<string> = new Set(ENTITY_RELATED_METADATA_BASE_PATHS);

/**
 * Manages Dataverse Web API operations
 * Provides CRUD operations, FetchXML queries, and metadata retrieval
 */
export class DataverseManager {
    private connectionsManager: ConnectionsManager;
    private authManager: AuthManager;

    constructor(connectionsManager: ConnectionsManager, authManager: AuthManager) {
        this.connectionsManager = connectionsManager;
        this.authManager = authManager;
    }

    /**
     * Allowed custom headers for metadata operations based on Microsoft Dataverse Web API documentation.
     * These headers are validated before being passed to HTTP requests for metadata operations.
     *
     * Reference documentation:
     * - https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/retrieve-metadata-name-metadataid
     * - https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api
     * - https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api
     * - https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api
     * - https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/multitable-lookup
     * - https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-optionsets
     */
    private static readonly ALLOWED_METADATA_HEADERS: ReadonlySet<string> = new Set<string>([
        "mscrm.solutionuniquename", // Associates metadata changes with a specific solution (used in CREATE/UPDATE)
        "mscrm.mergelabels", // Controls label merging: "true" (merge) or "false" (replace) in UPDATE operations
        "consistency", // Forces reading latest version: "Strong" value (used in GET operations after changes)
        "if-match", // Standard HTTP header for optimistic concurrency control
        "if-none-match", // Standard HTTP header for caching control (commonly "null" in examples)
    ]);

    /**
     * Headers that must never be passed as custom headers because they are controlled by makeHttpRequest.
     * Attempting to override these headers will result in validation errors.
     */
    private static readonly PROTECTED_HEADERS: ReadonlySet<string> = new Set<string>(["authorization", "accept", "content-type", "odata-maxversion", "odata-version", "prefer", "content-length"]);

    /**
     * Validates custom headers for metadata operations against the allowed headers list.
     * Case-insensitive matching per HTTP specification (RFC 2616).
     *
     * @param customHeaders - The custom headers to validate
     * @param operationName - Optional name of the operation for more descriptive error messages
     * @returns Validated headers object
     * @throws Error if any header is not in the allowed list or attempts to override protected headers
     *
     * @example
     * ```typescript
     * // Valid headers
     * const headers = this.validateMetadataHeaders({
     *     "MSCRM.SolutionUniqueName": "examplesolution",
     *     "MSCRM.MergeLabels": "true"
     * }, "updateEntityDefinition");
     *
     * // Invalid header - throws error
     * this.validateMetadataHeaders({
     *     "X-Custom-Header": "value" // Not in allowed list
     * });
     *
     * // Protected header - throws error
     * this.validateMetadataHeaders({
     *     "Authorization": "Bearer token" // Protected header
     * });
     * ```
     */
    private validateMetadataHeaders(customHeaders: Record<string, string> | undefined, operationName?: string): Record<string, string> {
        if (!customHeaders || Object.keys(customHeaders).length === 0) {
            return {};
        }

        const validatedHeaders: Record<string, string> = {};
        const invalidHeaders: string[] = [];
        const protectedHeaders: string[] = [];

        for (const [headerName, headerValue] of Object.entries(customHeaders)) {
            const normalizedHeaderName = headerName.toLowerCase();

            // Check if attempting to override protected headers
            if (DataverseManager.PROTECTED_HEADERS.has(normalizedHeaderName)) {
                protectedHeaders.push(headerName);
                continue;
            }

            // Check if header is in allowed list
            if (DataverseManager.ALLOWED_METADATA_HEADERS.has(normalizedHeaderName)) {
                validatedHeaders[headerName] = headerValue;
            } else {
                invalidHeaders.push(headerName);
            }
        }

        // Build detailed error message if validation failed
        if (protectedHeaders.length > 0 || invalidHeaders.length > 0) {
            const errorParts: string[] = [];
            const operation = operationName ? ` in ${operationName}` : "";

            if (protectedHeaders.length > 0) {
                errorParts.push(`Protected headers cannot be overridden: ${protectedHeaders.join(", ")}`);
            }

            if (invalidHeaders.length > 0) {
                errorParts.push(`Invalid headers for metadata operations: ${invalidHeaders.join(", ")}. ` + `Allowed headers: ${Array.from(DataverseManager.ALLOWED_METADATA_HEADERS).join(", ")}`);
            }

            throw new Error(`Header validation failed${operation}. ${errorParts.join(". ")}`);
        }

        return validatedHeaders;
    }

    /**
     * Build a properly formatted API URL by combining base URL and path
     * Ensures no double slashes between base URL and path
     */
    private buildApiUrl(connection: DataverseConnection, path: string): string {
        // Ensure base URL doesn't end with slash and path doesn't start with slash
        const baseUrl = connection.url.replace(/\/$/, "");
        const cleanPath = path.replace(/^\//, "");
        return `${baseUrl}/${cleanPath}`;
    }

    /**
     * Helper method to ensure MSAL account exists in cache, clearing tokens if not
     * @param connection The connection to validate
     * @param connectionId The connection ID
     * @param errorMessage The error message to throw if cache is invalid
     * @throws Error if MSAL cache is empty (tokens are cleared before throwing)
     */
    private async ensureMsalCacheOrClearTokens(connection: DataverseConnection, connectionId: string, errorMessage: string): Promise<void> {
        const hasAccount = await this.authManager.hasAccountInCache(connection);
        if (!hasAccount) {
            // MSAL cache is empty (e.g., after app restart), clear stored tokens to force re-authentication
            this.connectionsManager.clearConnectionTokens(connectionId);
            captureMessage("MSAL account not found in cache - tokens cleared", "warning", {
                extra: { connectionId, connectionName: connection.name },
            });
            throw new Error(errorMessage);
        }
    }

    /**
     * Get a connection by ID and ensure it has a valid access token
     * Uses MSAL's automatic token refresh - no manual expiry checking needed
     * @param connectionId The ID of the connection to use
     */
    private async getConnectionWithToken(connectionId: string): Promise<{ connection: DataverseConnection; accessToken: string }> {
        const connection = this.connectionsManager.getConnectionById(connectionId);
        if (!connection) {
            throw new Error(`Connection ${connectionId} not found. Please ensure the connection exists.`);
        }

        // Strategy 1: Interactive auth with MSAL account - use silent token acquisition
        // MSAL automatically handles token refresh if expired (no local server needed for refresh)
        if (connection.authenticationType === "interactive" && connection.msalAccountId) {
            // Check if MSAL account exists in cache (cache is cleared when app restarts)
            await this.ensureMsalCacheOrClearTokens(connection, connectionId, `Authentication expired for connection '${connection.name}'. Please reconnect to continue.`);

            try {
                const tokenResult = await this.authManager.acquireTokenSilently(connection);

                // Update connection with new token
                connection.accessToken = tokenResult.accessToken;
                connection.tokenExpiry = tokenResult.expiresOn.toISOString();
                this.connectionsManager.updateConnection(connection.id, connection);

                return { connection, accessToken: tokenResult.accessToken };
            } catch (error) {
                // Silent acquisition failed - re-auth required
                const errorMessage = `Authentication expired for connection '${connection.name}'. Please reconnect to continue.`;
                captureMessage("MSAL silent token acquisition failed", "error", {
                    extra: { connectionId, connectionName: connection.name, error },
                });
                throw new Error(errorMessage);
            }
        }

        // Strategy 2: Client secret flow - use MSAL's automatic token caching
        // ConfidentialClientApplication handles token refresh automatically
        if (connection.authenticationType === "clientSecret") {
            // Check if token is expired or about to expire (within 5 minutes)
            const needsRefresh = this.connectionsManager.isConnectionTokenExpired(connectionId) || this.isTokenExpiringWithin(connection.tokenExpiry, 5 * 60 * 1000);

            if (needsRefresh || !connection.accessToken) {
                try {
                    // MSAL will return cached token if still valid, or acquire new one if expired
                    const authResult = await this.authManager.authenticateClientSecret(connection);

                    // Update connection with new token
                    connection.accessToken = authResult.accessToken;
                    connection.tokenExpiry = authResult.expiresOn.toISOString();
                    this.connectionsManager.updateConnection(connection.id, connection);

                    return { connection, accessToken: authResult.accessToken };
                } catch (error) {
                    const errorMessage = `Client secret authentication failed for '${connection.name}'. Please verify your credentials.`;
                    captureMessage("Client secret authentication failed", "error", {
                        extra: { connectionId, connectionName: connection.name, error },
                    });
                    throw new Error(errorMessage);
                }
            }
        }

        // Strategy 3: Username/Password flow - use MSAL silent token acquisition if msalAccountId is available
        // With MSAL-based username/password auth, we can use acquireTokenSilently just like interactive flow
        if (connection.authenticationType === "usernamePassword") {
            // If we have MSAL account ID, use silent token acquisition (MSAL handles token refresh internally)
            if (connection.msalAccountId) {
                // Check if MSAL account exists in cache (cache is cleared when app restarts)
                await this.ensureMsalCacheOrClearTokens(connection, connectionId, `Token refresh failed for '${connection.name}'. Please re-enter your credentials.`);

                try {
                    const authResult = await this.authManager.acquireTokenSilently(connection);

                    // Update connection with new tokens
                    this.connectionsManager.updateConnectionTokens(connectionId, {
                        accessToken: authResult.accessToken,
                        refreshToken: undefined, // MSAL handles refresh internally
                        expiresOn: authResult.expiresOn,
                        msalAccountId: connection.msalAccountId,
                    });

                    return { connection, accessToken: authResult.accessToken };
                } catch (error) {
                    // Silent token acquisition failed - user needs to re-authenticate
                    const errorMessage = `Token refresh failed for '${connection.name}'. Please re-enter your credentials.`;
                    captureMessage("Username/password silent token acquisition failed", "error", {
                        extra: { connectionId, connectionName: connection.name, error },
                    });
                    throw new Error(errorMessage);
                }
            }

            // Fallback: Legacy username/password connections without MSAL account ID
            // Check if token is expired or about to expire (within 5 minutes)
            const needsRefresh = this.connectionsManager.isConnectionTokenExpired(connectionId) || this.isTokenExpiringWithin(connection.tokenExpiry, 5 * 60 * 1000);

            if (needsRefresh && connection.refreshToken) {
                try {
                    const authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken);

                    // Update connection with new tokens
                    this.connectionsManager.updateConnectionTokens(connectionId, {
                        accessToken: authResult.accessToken,
                        refreshToken: authResult.refreshToken,
                        expiresOn: authResult.expiresOn,
                    });

                    return { connection, accessToken: authResult.accessToken };
                } catch (error) {
                    const errorMessage = `Token refresh failed for '${connection.name}'. Please re-enter your credentials.`;
                    captureMessage("Username/password token refresh failed", "error", {
                        extra: { connectionId, connectionName: connection.name, error },
                    });
                    throw new Error(errorMessage);
                }
            }
        }

        // Strategy 4: Legacy interactive connections without MSAL account ID
        // Try to use existing refresh token via manual refresh
        if (connection.authenticationType === "interactive" && !connection.msalAccountId && connection.refreshToken) {
            const needsRefresh = this.connectionsManager.isConnectionTokenExpired(connectionId) || this.isTokenExpiringWithin(connection.tokenExpiry, 5 * 60 * 1000);

            if (needsRefresh) {
                try {
                    const authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken);

                    // Update connection with new tokens
                    this.connectionsManager.updateConnectionTokens(connectionId, {
                        accessToken: authResult.accessToken,
                        refreshToken: authResult.refreshToken,
                        expiresOn: authResult.expiresOn,
                    });

                    return { connection, accessToken: authResult.accessToken };
                } catch (error) {
                    const errorMessage = `Token refresh failed for '${connection.name}'. Please sign in again.`;
                    captureMessage("Legacy interactive token refresh failed", "warning", {
                        extra: { connectionId, connectionName: connection.name, error },
                    });
                    throw new Error(errorMessage);
                }
            }
        }

        // Fallback: use existing token if still valid
        if (!connection.accessToken) {
            throw new Error(`No access token found for '${connection.name}'. Please reconnect to the environment.`);
        }

        return { connection, accessToken: connection.accessToken };
    }

    /**
     * Check if a token is expiring within the specified time window
     */
    private isTokenExpiringWithin(tokenExpiry: string | undefined, milliseconds: number): boolean {
        if (!tokenExpiry) return false;

        const expiryDate = new Date(tokenExpiry);
        const now = new Date();

        return expiryDate.getTime() - now.getTime() < milliseconds;
    }

    /**
     * Create a new record in Dataverse
     */
    async create(connectionId: string, entityLogicalName: string, record: Record<string, unknown>): Promise<{ id: string; [key: string]: unknown }> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const entitySetName = this.getEntitySetName(entityLogicalName);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${entitySetName}`);

        const response = await this.makeHttpRequest(url, "POST", accessToken, record);

        // Extract the ID from the OData-EntityId header or response
        const responseData = response.data as DataverseResponse;
        const entityId = response.headers["odata-entityid"] || (responseData[`${entityLogicalName}id`] as string);

        return {
            id: entityId ? this.extractIdFromUrl(entityId as string) : "",
            ...responseData,
        };
    }

    /**
     * Retrieve a record from Dataverse
     */
    async retrieve(connectionId: string, entityLogicalName: string, id: string, columns?: string[]): Promise<Record<string, unknown>> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const entitySetName = this.getEntitySetName(entityLogicalName);

        let url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${entitySetName}(${id})`);
        if (columns && columns.length > 0) {
            url += `?$select=${columns.join(",")}`;
        }

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as Record<string, unknown>;
    }

    /**
     * Update a record in Dataverse
     */
    async update(connectionId: string, entityLogicalName: string, id: string, record: Record<string, unknown>): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const entitySetName = this.getEntitySetName(entityLogicalName);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${entitySetName}(${id})`);

        await this.makeHttpRequest(url, "PATCH", accessToken, record);
    }

    /**
     * Delete a record from Dataverse
     */
    async delete(connectionId: string, entityLogicalName: string, id: string): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const entitySetName = this.getEntitySetName(entityLogicalName);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${entitySetName}(${id})`);

        await this.makeHttpRequest(url, "DELETE", accessToken);
    }

    /**
     * Convert entity logical name to entity set name (pluralization)
     * Handles common Dataverse entity pluralization rules
     */
    getEntitySetName(entityLogicalName: string): string {
        // Common irregular plurals in Dataverse
        const irregularPlurals: Record<string, string> = {
            opportunity: "opportunities",
            territory: "territories",
            currency: "currencies",
            businessunit: "businessunits",
            systemuser: "systemusers",
            usersettingscollection: "usersettingscollection",
            principalobjectaccess: "principalobjectaccessset",
            webresource: "webresourceset",
        };

        const lowerName = entityLogicalName.toLowerCase();

        // Check for irregular plurals
        if (irregularPlurals[lowerName]) {
            return irregularPlurals[lowerName];
        }

        // Handle entities ending in 'y' (e.g., opportunity -> opportunities)
        if (lowerName.endsWith("y") && lowerName.length > 1 && !"aeiou".includes(lowerName[lowerName.length - 2])) {
            return lowerName.slice(0, -1) + "ies";
        }

        // Handle entities ending in 's', 'x', 'z', 'ch', 'sh' (add 'es')
        if (lowerName.endsWith("s") || lowerName.endsWith("x") || lowerName.endsWith("z") || lowerName.endsWith("ch") || lowerName.endsWith("sh")) {
            return lowerName + "es";
        }

        // Default: add 's'
        return lowerName + "s";
    }

    /**
     * Execute a FetchXML query
     */
    async fetchXmlQuery(connectionId: string, fetchXml: string): Promise<FetchXmlResult> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        // Encode the FetchXML for URL
        const encodedFetchXml = encodeURIComponent(fetchXml);

        // Extract entity name from FetchXML
        const entityMatch = fetchXml.match(/<entity\s+name=["']([^"']+)["']/i);
        if (!entityMatch) {
            throw new Error("Invalid FetchXML: Could not determine entity name");
        }
        const entityName = entityMatch[1];

        // Convert entity name to entity set name (pluralized)
        const entitySetName = this.getEntitySetName(entityName);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${entitySetName}?fetchXml=${encodedFetchXml}`);

        // Request formatted values and all annotations (for lookups, aliases, etc.)
        const response = await this.makeHttpRequest(url, "GET", accessToken, undefined, ['odata.include-annotations="*"']);
        return response.data as FetchXmlResult;
    }

    /**
     * Retrieve multiple records (alias for fetchXmlQuery for backward compatibility)
     */
    async retrieveMultiple(connectionId: string, fetchXml: string): Promise<FetchXmlResult> {
        return this.fetchXmlQuery(connectionId, fetchXml);
    }

    /**
     * Execute a Dataverse Web API action or function
     *
     * This is a generic method that can execute any standard or custom action/function.
     * Supports both bound operations (on specific entity records) and unbound operations.
     *
     * @param connectionId - Connection ID to use
     * @param request - Operation request details
     * @param request.operationName - Name of the action or function to execute
     * @param request.operationType - "action" (POST) or "function" (GET)
     * @param request.parameters - Parameters to pass to the operation
     * @param request.entityName - (For bound operations) Entity logical name
     * @param request.entityId - (For bound operations) Entity record ID
     * @returns Response object from the operation
     *
     * @example
     * // CreateCustomerRelationships - Create customer lookup attribute (returns HTTP 200 with body)
     * const customerResult = await dataverseManager.execute(connectionId, {
     *   operationName: "CreateCustomerRelationships",
     *   operationType: "action",
     *   parameters: {
     *     Lookup: {
     *       "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
     *       SchemaName: "new_CustomerId",
     *       DisplayName: dataverseManager.buildLabel("Customer"),
     *       RequiredLevel: { Value: "None" },
     *       Targets: ["account", "contact"]
     *     },
     *     OneToManyRelationships: [
     *       {
     *         "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
     *         SchemaName: "new_order_customer_account",
     *         ReferencedEntity: "account",
     *         ReferencingEntity: "new_order"
     *       },
     *       {
     *         "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
     *         SchemaName: "new_order_customer_contact",
     *         ReferencedEntity: "contact",
     *         ReferencingEntity: "new_order"
     *       }
     *     ]
     *   }
     * });
     * // Returns: { AttributeId: "guid", RelationshipIds: ["guid1", "guid2"] }
     *
     * @example
     * // InsertStatusValue - Add status value to status choice column
     * await dataverseManager.execute(connectionId, {
     *   operationName: "InsertStatusValue",
     *   operationType: "action",
     *   parameters: {
     *     EntityLogicalName: "new_project",
     *     AttributeLogicalName: "statuscode",
     *     Value: 100000000,
     *     Label: dataverseManager.buildLabel("Custom Status"),
     *     StateCode: 0 // Active state
     *   }
     * });
     *
     * @example
     * // UpdateStateValue - Update state value metadata
     * await dataverseManager.execute(connectionId, {
     *   operationName: "UpdateStateValue",
     *   operationType: "action",
     *   parameters: {
     *     EntityLogicalName: "new_project",
     *     AttributeLogicalName: "statecode",
     *     Value: 1,
     *     Label: dataverseManager.buildLabel("Inactive"),
     *     DefaultStatus: 2
     *   }
     * });
     *
     * @example
     * // Bound action - Execute on specific record
     * await dataverseManager.execute(connectionId, {
     *   entityName: "account",
     *   entityId: "guid",
     *   operationName: "CustomAction",
     *   operationType: "action",
     *   parameters: { param1: "value" }
     * });
     *
     * @example
     * // Function call - Uses GET with parameters in URL
     * const result = await dataverseManager.execute(connectionId, {
     *   operationName: "WhoAmI",
     *   operationType: "function"
     * });
     */
    async execute(
        connectionId: string,
        request: {
            entityName?: string;
            entityId?: string;
            operationName: string;
            operationType: "action" | "function";
            parameters?: Record<string, unknown>;
        },
    ): Promise<Record<string, unknown>> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        let url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/`);

        // Build URL based on operation type
        if (request.entityName && request.entityId) {
            // Bound operation - use entity set name
            const entitySetName = this.getEntitySetName(request.entityName);
            url += `${entitySetName}(${request.entityId})/Microsoft.Dynamics.CRM.${request.operationName}`;
        } else {
            // Unbound operation
            url += request.operationName;
        }

        const method = request.operationType === "function" ? "GET" : "POST";

        // For functions, parameters go in the URL using parameter aliases
        // Format: FunctionName(Param1=@p0,Param2=@p1)?@p0=value1&@p1=value2
        if (request.operationType === "function" && request.parameters) {
            const paramNames = Object.keys(request.parameters);

            if (paramNames.length > 0) {
                // Build parameter aliases for function signature: Param1=@p0,Param2=@p1
                const paramAliases = paramNames.map((name, index) => `${name}=@p${index}`);

                // Append function signature with aliases to URL
                url += `(${paramAliases.join(",")})`;

                // Build query string with parameter values: @p0=value1&@p1=value2
                const queryParams: string[] = [];
                paramNames.forEach((name, index) => {
                    const value = request.parameters![name];
                    const alias = `@p${index}`;
                    const formattedValue = this.formatFunctionParameter(value);
                    queryParams.push(`${alias}=${formattedValue}`);
                });

                // Append query string to URL
                url += `?${queryParams.join("&")}`;
            } else {
                // No parameters - just add empty parentheses for function call
                url += "()";
            }
        }

        const body = request.operationType === "action" ? request.parameters : undefined;
        const response = await this.makeHttpRequest(url, method, accessToken, body);

        return response.data as Record<string, unknown>;
    }

    /**
     * Get metadata for a specific entity
     */
    async getEntityMetadata(connectionId: string, entityLogicalNameOrId: string, searchByLogicalName: boolean, selectColumns?: string[]): Promise<EntityMetadata> {
        if (!entityLogicalNameOrId || !entityLogicalNameOrId.trim()) {
            throw new Error("entityLogicalName parameter cannot be empty");
        }

        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const encodedLogicalName = encodeURIComponent(entityLogicalNameOrId);
        let url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(${searchByLogicalName ? `LogicalName='${encodedLogicalName}'` : encodedLogicalName})`);

        if (selectColumns && selectColumns.length > 0) {
            const encodedColumns = selectColumns.map((col) => encodeURIComponent(col)).join(",");
            url += `?$select=${encodedColumns}`;
        }

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as EntityMetadata;
    }

    /**
     * Get metadata for all entities
     * @param selectColumns - Optional array of column names to select (defaults to ["LogicalName", "DisplayName", "MetadataId"])
     * @returns Promise containing array of EntityMetadata objects
     */
    async getAllEntitiesMetadata(connectionId: string, selectColumns?: string[]): Promise<{ value: EntityMetadata[] }> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        // Default to lightweight columns if selectColumns is not provided or empty
        const columns = selectColumns && selectColumns.length > 0 ? selectColumns : ["LogicalName", "DisplayName", "MetadataId"];
        const encodedColumns = columns.map((col) => encodeURIComponent(col)).join(",");
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions?$select=${encodedColumns}`);
        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as { value: EntityMetadata[] };
    }

    /**
     * Get related metadata for a specific entity (attributes, relationships, etc.)
     * @param entityLogicalName - Logical name of the entity
     * @param relatedPath - Path after EntityDefinitions(LogicalName='name') (e.g., 'Attributes', 'OneToManyRelationships', 'ManyToOneRelationships')
     * @param selectColumns - Optional array of column names to select
     */
    async getEntityRelatedMetadata<P extends EntityRelatedMetadataPath>(
        connectionId: string,
        entityLogicalName: string,
        relatedPath: P,
        selectColumns?: string[],
    ): Promise<EntityRelatedMetadataResponse<P>> {
        if (!entityLogicalName || !entityLogicalName.trim()) {
            throw new Error("entityLogicalName parameter cannot be empty");
        }
        const sanitizedPath = relatedPath.trim();
        if (!sanitizedPath) {
            throw new Error("relatedPath parameter cannot be empty");
        }
        const baseSegment = sanitizedPath.split(/[(/]/)[0];
        if (!ENTITY_RELATED_METADATA_BASE_PATH_SET.has(baseSegment)) {
            throw new Error(`Unsupported relatedPath segment: ${baseSegment}. Allowed segments: ${ENTITY_RELATED_METADATA_BASE_PATHS.join(", ")}`);
        }

        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const encodedLogicalName = encodeURIComponent(entityLogicalName);
        // Encode individual path segments but preserve forward slashes for URL structure
        // Filter out empty or whitespace-only segments to prevent double slashes
        const encodedPath = sanitizedPath
            .split("/")
            .filter((segment) => segment.trim().length > 0)
            .map((segment) => encodeURIComponent(segment))
            .join("/");
        let url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(LogicalName='${encodedLogicalName}')/${encodedPath}`);

        if (selectColumns && selectColumns.length > 0) {
            const encodedColumns = selectColumns.map((col) => encodeURIComponent(col)).join(",");
            url += `?$select=${encodedColumns}`;
        }

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as EntityRelatedMetadataResponse<P>;
    }

    /**
     * Get solutions from the environment
     * @param selectColumns - Required array of column names to select
     */
    async getSolutions(connectionId: string, selectColumns: string[]): Promise<{ value: Record<string, unknown>[] }> {
        if (!selectColumns || selectColumns.length === 0) {
            throw new Error("selectColumns parameter is required and must contain at least one column");
        }

        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const encodedColumns = selectColumns.map((col) => encodeURIComponent(col)).join(",");
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/solutions?$select=${encodedColumns}`);

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as { value: Record<string, unknown>[] };
    }

    /**
     * Query data from Dataverse using OData query parameters
     *
     * This method can query any Dataverse endpoint including entity data, metadata (EntityDefinitions,
     * GlobalOptionSetDefinitions, etc.), and system entities.
     *
     * @param connectionId - Connection ID to use
     * @param odataQuery - OData query string with parameters like $select, $filter, $orderby, $top, $skip, $expand
     * @returns Query result with value array
     *
     * @example
     * // Query entity records
     * const accounts = await dataverseManager.queryData(connectionId,
     *   "accounts?$select=name,accountnumber&$filter=statecode eq 0&$top=10"
     * );
     *
     * @example
     * // Retrieve a global option set by name
     * const optionSet = await dataverseManager.queryData(connectionId,
     *   "GlobalOptionSetDefinitions(Name='new_projectstatus')"
     * );
     *
     * @example
     * // Retrieve all global option sets
     * const allOptionSets = await dataverseManager.queryData(connectionId,
     *   "GlobalOptionSetDefinitions?$select=Name,DisplayName,OptionSetType"
     * );
     *
     * @example
     * // Retrieve global option set by MetadataId
     * const optionSetById = await dataverseManager.queryData(connectionId,
     *   "GlobalOptionSetDefinitions(guid)?$select=Name,Options"
     * );
     */
    async queryData(connectionId: string, odataQuery: string): Promise<{ value: Record<string, unknown>[] }> {
        if (!odataQuery || !odataQuery.trim()) {
            throw new Error("odataQuery parameter cannot be empty");
        }

        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        // Remove leading '?' if present in the query string
        const query = odataQuery.trim();
        const cleanQuery = query.startsWith("?") ? query.substring(1) : query;

        let url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}`);
        if (cleanQuery) {
            url += `/${cleanQuery}`;
        }

        const response = await this.makeHttpRequest(url, "GET", accessToken, undefined, ['odata.include-annotations="*"']);
        return response.data as { value: Record<string, unknown>[] };
    }

    /**
     * Retrieve CSDL/EDMX metadata document for the Dataverse environment
     *
     * Returns the complete OData service document containing metadata for all:
     * - EntityType definitions (tables/entities)
     * - Property elements (attributes/columns)
     * - NavigationProperty elements (relationships)
     * - ComplexType definitions (return types for actions/functions)
     * - EnumType definitions (picklist/choice enumerations)
     * - Action definitions (OData Actions - POST operations)
     * - Function definitions (OData Functions - GET operations)
     * - EntityContainer metadata
     *
     * NOTE: Returns raw XML (1-5MB typical). Response is compressed with gzip for optimal transfer.
     * The response is automatically decompressed and returned as a string.
     *
     * @param connectionId - Connection ID to use
     * @returns Raw CSDL/EDMX XML document as string
     *
     * @throws Error if connection not found, token expired, or request fails
     */
    async getCSDLDocument(connectionId: string): Promise<string> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/$metadata`);

        const gunzipAsync = promisify(zlib.gunzip);
        const inflateAsync = promisify(zlib.inflate);

        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);

            const options: https.RequestOptions = {
                hostname: urlObj.hostname,
                port: 443,
                path: urlObj.pathname,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/xml",
                    "Accept-Encoding": "gzip, deflate",
                },
            };

            const req = https.request(options, (res) => {
                const chunks: Buffer[] = [];

                res.on("data", (chunk: Buffer) => {
                    chunks.push(chunk);
                });

                res.on("end", async () => {
                    if (res.statusCode === 200) {
                        try {
                            const buffer = Buffer.concat(chunks);
                            const encoding = res.headers["content-encoding"];

                            let decompressed: Buffer;
                            if (encoding === "gzip") {
                                decompressed = await gunzipAsync(buffer);
                            } else if (encoding === "deflate") {
                                decompressed = await inflateAsync(buffer);
                            } else {
                                decompressed = buffer;
                            }

                            resolve(decompressed.toString("utf-8"));
                        } catch (error) {
                            reject(new Error(`Failed to decompress metadata response: ${(error as Error).message}`));
                        }
                    } else {
                        // Error responses may also be compressed - decompress before reading body
                        try {
                            const buffer = Buffer.concat(chunks);
                            const encoding = res.headers["content-encoding"];
                            let decompressed: Buffer;

                            if (encoding === "gzip") {
                                decompressed = await gunzipAsync(buffer);
                            } else if (encoding === "deflate") {
                                decompressed = await inflateAsync(buffer);
                            } else {
                                decompressed = buffer;
                            }

                            const body = decompressed.toString("utf-8");
                            reject(new Error(`Failed to retrieve CSDL document. Status: ${res.statusCode}, Body: ${body}`));
                        } catch (decompressError) {
                            reject(new Error(`Failed to process error response: ${(decompressError as Error).message}`));
                        }
                    }
                });
            });

            req.on("error", (error) => {
                reject(new Error(`Metadata request failed: ${error.message}`));
            });

            req.end();
        });
    }

    /**
     * Make an HTTP request to Dataverse Web API
     */
    private makeHttpRequest(
        url: string,
        method: string,
        accessToken: string,
        body?: Record<string, unknown>,
        preferOptions?: string[],
        customHeaders?: Record<string, string>,
    ): Promise<{ data: unknown; headers: Record<string, string> }> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const bodyData = body ? JSON.stringify(body) : undefined;

            // Build Prefer header with multiple comma-separated values
            const preferValues = ["return=representation"];
            if (preferOptions && preferOptions.length > 0) {
                preferValues.push(...preferOptions);
            }
            const preferHeader = preferValues.join(",");

            const options: https.RequestOptions = {
                hostname: urlObj.hostname,
                port: 443,
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: {
                    // Spread custom headers first, then override with required headers to prevent accidental overwrites
                    ...(customHeaders || {}),
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/json",
                    "OData-MaxVersion": "4.0",
                    "OData-Version": "4.0",
                    "Content-Type": "application/json; charset=utf-8",
                    Prefer: preferHeader,
                    "Content-Length": bodyData ? Buffer.byteLength(bodyData) : 0,
                },
            };

            const req = https.request(options, (res) => {
                let data = "";

                res.on("data", (chunk) => {
                    data += chunk;
                });

                res.on("end", () => {
                    // Collect response headers
                    const responseHeaders: Record<string, string> = {};
                    if (res.headers) {
                        Object.entries(res.headers).forEach(([key, value]) => {
                            if (typeof value === "string") {
                                responseHeaders[key.toLowerCase()] = value;
                            } else if (Array.isArray(value)) {
                                responseHeaders[key.toLowerCase()] = value[0];
                            }
                        });
                    }

                    // Handle success responses
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        // Parse JSON response if there is data
                        let parsedData: unknown = {};
                        if (data && data.trim()) {
                            try {
                                parsedData = JSON.parse(data);
                            } catch (error) {
                                // For DELETE operations, response might be empty
                                parsedData = {};
                            }
                        }
                        resolve({ data: parsedData, headers: responseHeaders });
                    } else {
                        // Handle error responses
                        let errorMessage = `HTTP ${res.statusCode}`;
                        try {
                            const errorData = JSON.parse(data) as DataverseError;
                            if (errorData.error) {
                                errorMessage = `${errorData.error.code}: ${errorData.error.message}`;
                            }
                        } catch {
                            errorMessage += `: ${data}`;
                        }

                        reject(new Error(errorMessage));
                    }
                });
            });

            req.on("error", (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            if (bodyData) {
                req.write(bodyData);
            }
            req.end();
        });
    }

    /**
     * Extract GUID from OData entity URL
     * Example: https://org.crm.dynamics.com/api/data/${DATAVERSE_API_VERSION}/contacts(guid) -> guid
     */
    private extractIdFromUrl(url: string): string {
        const match = url.match(/\(([a-f0-9-]+)\)/i);
        return match ? match[1] : url;
    }

    /**
     * Format a parameter value for Dataverse Function URL query string
     * Handles primitives, EntityReferences, complex objects, collections, and enum values
     *
     * @param value - The parameter value to format
     * @returns URL-encoded formatted parameter value
     *
     * @example
     * // String parameter
     * formatFunctionParameter('Pacific Standard Time') // Returns: '%27Pacific%20Standard%20Time%27'
     *
     * @example
     * // Number parameter
     * formatFunctionParameter(1033) // Returns: '1033'
     *
     * @example
     * // Boolean parameter
     * formatFunctionParameter(true) // Returns: 'true'
     *
     * @example
     * // EntityReference with entityLogicalName (user-friendly format)
     * formatFunctionParameter({ entityLogicalName: 'account', id: 'guid-here' })
     * // Returns: '%7B%22%40odata.id%22%3A%22accounts(guid-here)%22%7D'
     *
     * @example
     * // EntityReference with @odata.id (advanced format)
     * formatFunctionParameter({ '@odata.id': 'accounts(guid-here)' })
     * // Returns: '%7B%22%40odata.id%22%3A%22accounts(guid-here)%22%7D'
     *
     * @example
     * // Enum value (single or multiple)
     * formatFunctionParameter("Microsoft.Dynamics.CRM.EntityFilters'Entity'")
     * // Returns: "Microsoft.Dynamics.CRM.EntityFilters'Entity'" (no quotes, URL-encoded)
     *
     * @example
     * // Complex object
     * formatFunctionParameter({ PageNumber: 1, Count: 10 })
     * // Returns: '%7B%22PageNumber%22%3A1%2C%22Count%22%3A10%7D'
     */
    private formatFunctionParameter(value: unknown): string {
        // Handle null/undefined
        if (value === null || value === undefined) {
            return "null";
        }

        // Handle EntityReference with entityLogicalName and id (user-friendly format)
        // Convert to @odata.id format internally
        if (typeof value === "object" && "entityLogicalName" in value && "id" in value) {
            const ref = value as { entityLogicalName: unknown; id: unknown };
            if (typeof ref.entityLogicalName !== "string" || typeof ref.id !== "string") {
                throw new Error("EntityReference must have string entityLogicalName and id properties");
            }
            const entitySetName = this.getEntitySetName(ref.entityLogicalName);
            const odataRef = { "@odata.id": `${entitySetName}(${ref.id})` };
            return encodeURIComponent(JSON.stringify(odataRef));
        }

        // Handle already-formatted EntityReference with @odata.id (advanced users)
        if (value && typeof value === "object" && "@odata.id" in value) {
            return encodeURIComponent(JSON.stringify(value));
        }

        // Handle boolean - lowercase without quotes
        if (typeof value === "boolean") {
            return value ? "true" : "false";
        }

        // Handle number - no quotes
        if (typeof value === "number") {
            return value.toString();
        }

        // Handle string
        if (typeof value === "string") {
            // Check if it's a Dataverse enum value with Microsoft.Dynamics.CRM prefix
            // Enum format: Microsoft.Dynamics.CRM.EntityFilters'Entity'
            // Multi-value enum format: Microsoft.Dynamics.CRM.EntityFilters'Entity,Attributes,Relationships'
            // These should NOT be wrapped in quotes, just URL-encoded
            if (/^Microsoft\.Dynamics\.CRM\.\w+'.+'$/.test(value)) {
                return encodeURIComponent(value);
            }

            // Check if it's already a properly formatted EntityReference string
            if (value.startsWith("{'@odata.id':") || value.startsWith('{"@odata.id":')) {
                return encodeURIComponent(value);
            }

            // Regular string - wrap in single quotes, escape internal single quotes by doubling them, then URL encode
            const escapedValue = value.replace(/'/g, "''");
            return encodeURIComponent(`'${escapedValue}'`);
        }

        // Handle complex objects and arrays - JSON encode and URL encode
        if (typeof value === "object") {
            return encodeURIComponent(JSON.stringify(value));
        }

        // Fallback - convert to string and URL encode
        return encodeURIComponent(String(value));
    }

    /**
     * Publish customizations for the current environment.
     * When tableLogicalName is provided, publishes only that table via PublishXml.
     * Otherwise, runs PublishAllXml to publish all pending customizations.
     */
    async publishCustomizations(connectionId: string, tableLogicalName?: string): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const trimmedName = tableLogicalName?.trim();
        const publishSingleTable = Boolean(trimmedName);
        const actionName = publishSingleTable ? "PublishXml" : "PublishAllXml";
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${actionName}`);
        const body = publishSingleTable ? { ParameterXml: this.buildEntityPublishXml(trimmedName!) } : undefined;

        await this.makeHttpRequest(url, "POST", accessToken, body);
    }

    /** Build the PublishXml payload for a single table */
    private escapeXml(value: string): string {
        return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    }

    private buildEntityPublishXml(entityLogicalName: string): string {
        const safeName = entityLogicalName.trim();
        if (!safeName) {
            throw new Error("tableName parameter cannot be empty");
        }

        const escapedName = this.escapeXml(safeName);
        return `<importexportxml><entities><entity>${escapedName}</entity></entities></importexportxml>`;
    }

    /**
     * Deploy (import) a solution to the Dataverse environment
     * @param connectionId - Connection ID to use
     * @param base64SolutionContent - Base64-encoded solution zip file content
     * @param options - Optional import settings
     * @returns Promise containing the ImportJobId for tracking the import progress
     */
    async deploySolution(
        connectionId: string,
        base64SolutionContent: string | ArrayBuffer | ArrayBufferView,
        options?: {
            importJobId?: string;
            publishWorkflows?: boolean;
            overwriteUnmanagedCustomizations?: boolean;
            skipProductUpdateDependencies?: boolean;
            convertToManaged?: boolean;
        },
    ): Promise<{ ImportJobId: string }> {
        const normalizedContent = this.normalizeSolutionContent(base64SolutionContent);
        const resolvedPublishWorkflows = options?.publishWorkflows ?? false;
        const resolvedOverwriteCustomizations = options?.overwriteUnmanagedCustomizations ?? false;
        const parameters: Record<string, unknown> = {
            CustomizationFile: normalizedContent,
            PublishWorkflows: resolvedPublishWorkflows,
            OverwriteUnmanagedCustomizations: resolvedOverwriteCustomizations,
        };

        // Add optional parameters if provided
        if (options?.importJobId) {
            const trimmedJobId = options.importJobId.trim();
            if (trimmedJobId) {
                parameters.ImportJobId = trimmedJobId;
            }
        }
        if (options?.skipProductUpdateDependencies !== undefined) {
            parameters.SkipProductUpdateDependencies = options.skipProductUpdateDependencies;
        }
        if (options?.convertToManaged !== undefined) {
            parameters.ConvertToManaged = options.convertToManaged;
        }

        const result = await this.execute(connectionId, {
            operationName: "ImportSolution",
            operationType: "action",
            parameters,
        });

        return result as { ImportJobId: string };
    }

    /** Normalize solution payload input to a base64 string accepted by Dataverse */
    private normalizeSolutionContent(content: string | ArrayBuffer | ArrayBufferView): string {
        if (typeof content === "string") {
            const trimmed = content.trim();
            if (!trimmed) {
                throw new Error("base64SolutionContent parameter cannot be empty");
            }
            return trimmed;
        }

        if (ArrayBuffer.isView(content)) {
            if (content.byteLength === 0) {
                throw new Error("base64SolutionContent parameter cannot be empty");
            }
            return Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString("base64");
        }

        if (content instanceof ArrayBuffer) {
            if (content.byteLength === 0) {
                throw new Error("base64SolutionContent parameter cannot be empty");
            }
            return Buffer.from(content).toString("base64");
        }

        throw new Error("base64SolutionContent must be a base64 string, ArrayBuffer, or ArrayBufferView");
    }

    /**
     * Get the status of a solution import job
     * @param connectionId - Connection ID to use
     * @param importJobId - GUID of the import job to track
     * @returns Promise containing the import job details including progress, status, and error information
     */
    async getImportJobStatus(connectionId: string, importJobId: string): Promise<Record<string, unknown>> {
        if (!importJobId || !importJobId.trim()) {
            throw new Error("importJobId parameter cannot be empty");
        }

        return this.retrieve(connectionId, "importjob", importJobId.trim(), ["importjobid", "progress", "completedon", "startedon", "data", "solutionname", "createdon", "modifiedon"]);
    }

    /** Create multiple records in Dataverse */
    async createMultiple(connectionId: string, entityLogicalName: string, records: Record<string, unknown>[]): Promise<string[]> {
        if (!records || records.length === 0) {
            throw new Error("records parameter is required and must contain at least one record");
        }

        // Validate that each record has the required @odata.type property
        const recordsWithoutODataType = records.filter((record) => !record["@odata.type"]);
        if (recordsWithoutODataType.length > 0) {
            throw new Error(
                `All records must contain the "@odata.type" property for create operations. ${recordsWithoutODataType.length} of ${records.length} record(s) are missing this field. Example: "@odata.type": "Microsoft.Dynamics.CRM.${entityLogicalName}"`,
            );
        }

        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const entitySetName = this.getEntitySetName(entityLogicalName);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${entitySetName}/Microsoft.Dynamics.CRM.CreateMultiple`);
        const response = await this.makeHttpRequest(url, "POST", accessToken, { Targets: records });
        const responseData = response.data as Record<string, unknown>;
        return responseData.Ids as string[];
    }

    /** Update multiple records in Dataverse */
    async updateMultiple(connectionId: string, entityLogicalName: string, records: Record<string, unknown>[]): Promise<void> {
        if (!records || records.length === 0) {
            throw new Error("records parameter is required and must contain at least one record");
        }

        // Validate that each record has an ID field (required for updates)
        const primaryKey = `${entityLogicalName}id`;
        const recordsWithoutId = records.filter((record) => !record[primaryKey]);
        if (recordsWithoutId.length > 0) {
            throw new Error(`All records must contain the primary key field '${primaryKey}' for update operations. ${recordsWithoutId.length} of ${records.length} record(s) are missing this field.`);
        }

        // Validate that each record has the required @odata.type property
        const recordsWithoutODataType = records.filter((record) => !record["@odata.type"]);
        if (recordsWithoutODataType.length > 0) {
            throw new Error(
                `All records must contain the "@odata.type" property for update operations. ${recordsWithoutODataType.length} of ${records.length} record(s) are missing this field. Example: "@odata.type": "Microsoft.Dynamics.CRM.${entityLogicalName}"`,
            );
        }

        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const entitySetName = this.getEntitySetName(entityLogicalName);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${entitySetName}/Microsoft.Dynamics.CRM.UpdateMultiple`);
        await this.makeHttpRequest(url, "POST", accessToken, { Targets: records });
    }

    /**
     * Associate two records in a many-to-many relationship
     * @param connectionId - Connection ID to use
     * @param primaryEntityName - Logical name of the primary entity
     * @param primaryEntityId - GUID of the primary record
     * @param relationshipName - Logical name of the N-to-N relationship
     * @param relatedEntityName - Logical name of the related entity
     * @param relatedEntityId - GUID of the related record
     */
    async associate(connectionId: string, primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityName: string, relatedEntityId: string): Promise<void> {
        if (!primaryEntityName || !primaryEntityName.trim()) {
            throw new Error("primaryEntityName parameter cannot be empty");
        }
        if (!primaryEntityId || !primaryEntityId.trim()) {
            throw new Error("primaryEntityId parameter cannot be empty");
        }
        if (!relationshipName || !relationshipName.trim()) {
            throw new Error("relationshipName parameter cannot be empty");
        }
        if (!relatedEntityName || !relatedEntityName.trim()) {
            throw new Error("relatedEntityName parameter cannot be empty");
        }
        if (!relatedEntityId || !relatedEntityId.trim()) {
            throw new Error("relatedEntityId parameter cannot be empty");
        }

        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const primaryEntitySetName = this.getEntitySetName(primaryEntityName);
        const relatedEntitySetName = this.getEntitySetName(relatedEntityName);

        // Build the URL for the association
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${primaryEntitySetName}(${primaryEntityId})/${relationshipName}/$ref`);

        // Build the reference to the related record
        const body = {
            "@odata.id": this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${relatedEntitySetName}(${relatedEntityId})`),
        };

        await this.makeHttpRequest(url, "POST", accessToken, body);
    }

    /**
     * Disassociate two records in a many-to-many relationship
     * @param connectionId - Connection ID to use
     * @param primaryEntityName - Logical name of the primary entity
     * @param primaryEntityId - GUID of the primary record
     * @param relationshipName - Logical name of the N-to-N relationship
     * @param relatedEntityId - GUID of the related record to disassociate
     */
    async disassociate(connectionId: string, primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityId: string): Promise<void> {
        if (!primaryEntityName || !primaryEntityName.trim()) {
            throw new Error("primaryEntityName parameter cannot be empty");
        }
        if (!primaryEntityId || !primaryEntityId.trim()) {
            throw new Error("primaryEntityId parameter cannot be empty");
        }
        if (!relationshipName || !relationshipName.trim()) {
            throw new Error("relationshipName parameter cannot be empty");
        }
        if (!relatedEntityId || !relatedEntityId.trim()) {
            throw new Error("relatedEntityId parameter cannot be empty");
        }

        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const primaryEntitySetName = this.getEntitySetName(primaryEntityName);

        // Build the URL for the disassociation
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/${primaryEntitySetName}(${primaryEntityId})/${relationshipName}(${relatedEntityId})/$ref`);

        await this.makeHttpRequest(url, "DELETE", accessToken);
    }

    // ========================================
    // Metadata Helper Utilities
    // ========================================

    /**
     * Build a Label structure for metadata properties
     * @param text - Display text for the label
     * @param languageCode - Language code (defaults to 1033 for English)
     * @returns Label object with LocalizedLabels array
     *
     * @example
     * const label = dataverseManager.buildLabel("Account Name");
     * // Returns: { LocalizedLabels: [{ Label: "Account Name", LanguageCode: 1033, IsManaged: false }], UserLocalizedLabel: { Label: "Account Name", LanguageCode: 1033, IsManaged: false } }
     */
    buildLabel(text: string, languageCode: number = 1033): Label {
        const localizedLabel: LocalizedLabel = {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: text,
            LanguageCode: languageCode,
            IsManaged: false,
        };

        return {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [localizedLabel],
            UserLocalizedLabel: localizedLabel,
        };
    }

    /**
     * Get the OData type string for an attribute metadata type
     * @param attributeType - Attribute metadata type enum value
     * @returns Full OData type string (e.g., "Microsoft.Dynamics.CRM.StringAttributeMetadata")
     *
     * @example
     * const odataType = dataverseManager.getAttributeODataType(AttributeMetadataType.String);
     * // Returns: "Microsoft.Dynamics.CRM.StringAttributeMetadata"
     */
    getAttributeODataType(attributeType: AttributeMetadataType): string {
        return `Microsoft.Dynamics.CRM.${attributeType}AttributeMetadata`;
    }

    /**
     * Build custom headers for metadata operations
     */
    private buildMetadataHeaders(options?: MetadataOperationOptions): Record<string, string> {
        const headers: Record<string, string> = {};

        if (options?.solutionUniqueName) {
            headers["MSCRM.SolutionUniqueName"] = options.solutionUniqueName;
        }

        if (options?.mergeLabels !== undefined) {
            headers["MSCRM.MergeLabels"] = String(options.mergeLabels);
        }

        if (options?.consistencyStrong) {
            headers["Consistency"] = "Strong";
        }

        // Validate headers against allowed list (defensive programming - ensures type-safe options produce valid headers)
        return this.validateMetadataHeaders(headers);
    }

    /**
     * Detect if a string is a GUID (MetadataId) or a logical name
     */
    private isGuid(value: string): boolean {
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return guidRegex.test(value);
    }

    // ========================================
    // Entity (Table) Metadata CRUD Operations
    // ========================================

    /**
     * Create a new entity (table) definition
     * @param connectionId - Connection ID to use
     * @param entityDefinition - Entity metadata payload (must include SchemaName, DisplayName, OwnershipType, and at least one Attribute with IsPrimaryName=true)
     * @param options - Optional metadata operation options
     * @returns Object containing the created entity's MetadataId
     *
     * @example
     * const result = await dataverseManager.createEntityDefinition(connectionId, {
     *   "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
     *   "SchemaName": "new_project",
     *   "DisplayName": dataverseManager.buildLabel("Project"),
     *   "OwnershipType": "UserOwned",
     *   "HasActivities": true,
     *   "Attributes": [{
     *     "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
     *     "SchemaName": "new_name",
     *     "IsPrimaryName": true,
     *     "MaxLength": 100,
     *     "DisplayName": dataverseManager.buildLabel("Project Name")
     *   }]
     * }, { solutionUniqueName: "MySolution" });
     *
     * // Remember to publish customizations after creating metadata
     * await dataverseManager.publishCustomizations(connectionId, "new_project");
     */
    async createEntityDefinition(connectionId: string, entityDefinition: Record<string, unknown>, options?: MetadataOperationOptions): Promise<{ id: string }> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions`);
        const headers = this.buildMetadataHeaders(options);

        const response = await this.makeHttpRequest(url, "POST", accessToken, entityDefinition, undefined, headers);

        // Extract MetadataId from OData-EntityId header
        // Metadata operations return 204 No Content with no body, header is the only source
        const entityId = response.headers["odata-entityid"];
        if (!entityId) {
            throw new Error("Failed to retrieve MetadataId from response. The OData-EntityId header was missing.");
        }
        return {
            id: this.extractIdFromUrl(entityId),
        };
    }

    /**
     * Update an entity (table) definition
     * NOTE: This uses PUT which requires the FULL entity definition (retrieve-modify-PUT pattern)
     * @param connectionId - Connection ID to use
     * @param entityIdentifier - Entity LogicalName or MetadataId
     * @param entityDefinition - Complete entity metadata payload with all properties
     * @param options - Optional metadata operation options (mergeLabels defaults to true)
     *
     * @example
     * // Step 1: Retrieve current definition
     * const currentDef = await dataverseManager.getEntityMetadata(connectionId, "new_project", true);
     *
     * // Step 2: Modify desired properties
     * currentDef.DisplayName = dataverseManager.buildLabel("Updated Project Name");
     *
     * // Step 3: PUT the entire definition back (mergeLabels preserves other language labels)
     * await dataverseManager.updateEntityDefinition(connectionId, "new_project", currentDef, { mergeLabels: true });
     *
     * // Step 4: Publish customizations
     * await dataverseManager.publishCustomizations(connectionId, "new_project");
     */
    async updateEntityDefinition(connectionId: string, entityIdentifier: string, entityDefinition: Record<string, unknown>, options?: MetadataOperationOptions): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        // Auto-detect MetadataId vs LogicalName
        const isMetadataId = this.isGuid(entityIdentifier);
        const identifier = isMetadataId ? entityIdentifier : `LogicalName='${encodeURIComponent(entityIdentifier)}'`;

        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(${identifier})`);

        // Default mergeLabels to true for updates to preserve localized labels
        const headers = this.buildMetadataHeaders({
            ...options,
            mergeLabels: options?.mergeLabels !== undefined ? options.mergeLabels : true,
        });

        await this.makeHttpRequest(url, "PUT", accessToken, entityDefinition, undefined, headers);
    }

    /**
     * Delete an entity (table) definition
     * @param connectionId - Connection ID to use
     * @param entityIdentifier - Entity LogicalName or MetadataId
     *
     * @example
     * await dataverseManager.deleteEntityDefinition(connectionId, "new_project");
     */
    async deleteEntityDefinition(connectionId: string, entityIdentifier: string): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        // Auto-detect MetadataId vs LogicalName
        const isMetadataId = this.isGuid(entityIdentifier);
        const identifier = isMetadataId ? entityIdentifier : `LogicalName='${encodeURIComponent(entityIdentifier)}'`;

        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(${identifier})`);

        await this.makeHttpRequest(url, "DELETE", accessToken);
    }

    // ========================================
    // Attribute (Column) Metadata CRUD Operations
    // ========================================

    /**
     * Create a new attribute (column) on an existing entity
     * @param connectionId - Connection ID to use
     * @param entityLogicalName - Logical name of the entity to add the attribute to
     * @param attributeDefinition - Attribute metadata payload (must include @odata.type, SchemaName, DisplayName)
     * @param options - Optional metadata operation options
     * @returns Object containing the created attribute's MetadataId
     *
     * @example
     * const result = await dataverseManager.createAttribute(connectionId, "new_project", {
     *   "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
     *   "SchemaName": "new_description",
     *   "DisplayName": dataverseManager.buildLabel("Description"),
     *   "MaxLength": 500,
     *   "FormatName": { "Value": "Text" }
     * }, { solutionUniqueName: "MySolution" });
     *
     * await dataverseManager.publishCustomizations(connectionId, "new_project");
     */
    async createAttribute(connectionId: string, entityLogicalName: string, attributeDefinition: Record<string, unknown>, options?: MetadataOperationOptions): Promise<{ id: string }> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const encodedLogicalName = encodeURIComponent(entityLogicalName);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(LogicalName='${encodedLogicalName}')/Attributes`);
        const headers = this.buildMetadataHeaders(options);

        const response = await this.makeHttpRequest(url, "POST", accessToken, attributeDefinition, undefined, headers);

        // Extract MetadataId from OData-EntityId header
        // Metadata operations return 204 No Content with no body, header is the only source
        const entityId = response.headers["odata-entityid"];
        if (!entityId) {
            throw new Error("Failed to retrieve attribute MetadataId from response. The OData-EntityId header was missing.");
        }
        return {
            id: this.extractIdFromUrl(entityId),
        };
    }

    /**
     * Update an attribute (column) definition
     * NOTE: This uses PUT which requires the FULL attribute definition (retrieve-modify-PUT pattern)
     * @param connectionId - Connection ID to use
     * @param entityLogicalName - Logical name of the entity
     * @param attributeIdentifier - Attribute LogicalName or MetadataId
     * @param attributeDefinition - Complete attribute metadata payload
     * @param options - Optional metadata operation options (mergeLabels defaults to true)
     *
     * @example
     * // Retrieve current attribute definition
     * const currentAttr = await dataverseManager.getEntityRelatedMetadata(
     *   connectionId, "new_project", "Attributes(LogicalName='new_description')"
     * );
     *
     * // Modify properties
     * currentAttr.DisplayName = dataverseManager.buildLabel("Updated Description");
     *
     * // PUT entire definition back
     * await dataverseManager.updateAttribute(connectionId, "new_project", "new_description", currentAttr, { mergeLabels: true });
     * await dataverseManager.publishCustomizations(connectionId, "new_project");
     */
    async updateAttribute(
        connectionId: string,
        entityLogicalName: string,
        attributeIdentifier: string,
        attributeDefinition: Record<string, unknown>,
        options?: MetadataOperationOptions,
    ): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const encodedLogicalName = encodeURIComponent(entityLogicalName);

        // Auto-detect MetadataId vs LogicalName
        const isMetadataId = this.isGuid(attributeIdentifier);
        const identifier = isMetadataId ? attributeIdentifier : `LogicalName='${encodeURIComponent(attributeIdentifier)}'`;

        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(LogicalName='${encodedLogicalName}')/Attributes(${identifier})`);

        // Default mergeLabels to true for updates
        const headers = this.buildMetadataHeaders({
            ...options,
            mergeLabels: options?.mergeLabels !== undefined ? options.mergeLabels : true,
        });

        await this.makeHttpRequest(url, "PUT", accessToken, attributeDefinition, undefined, headers);
    }

    /**
     * Delete an attribute (column) from an entity
     * @param connectionId - Connection ID to use
     * @param entityLogicalName - Logical name of the entity
     * @param attributeIdentifier - Attribute LogicalName or MetadataId
     *
     * @example
     * await dataverseManager.deleteAttribute(connectionId, "new_project", "new_description");
     */
    async deleteAttribute(connectionId: string, entityLogicalName: string, attributeIdentifier: string): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const encodedLogicalName = encodeURIComponent(entityLogicalName);

        // Auto-detect MetadataId vs LogicalName
        const isMetadataId = this.isGuid(attributeIdentifier);
        const identifier = isMetadataId ? attributeIdentifier : `LogicalName='${encodeURIComponent(attributeIdentifier)}'`;

        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(LogicalName='${encodedLogicalName}')/Attributes(${identifier})`);

        await this.makeHttpRequest(url, "DELETE", accessToken);
    }

    /**
     * Create a polymorphic lookup attribute (Customer/Regarding field)
     * Creates a lookup that can reference multiple entity types
     *
     * NOTE: For customer lookups specifically (account/contact), you can alternatively use the
     * CreateCustomerRelationships action via execute() method, which creates both the lookup
     * attribute and the relationships in a single operation and returns more detailed response.
     *
     * @param connectionId - Connection ID to use
     * @param entityLogicalName - Logical name of the entity to add the attribute to
     * @param attributeDefinition - Lookup attribute metadata with Targets array
     * @param options - Optional metadata operation options
     * @returns Object containing the created attribute's MetadataId
     *
     * @example
     * // Create a Customer lookup (Account or Contact)
     * const result = await dataverseManager.createPolymorphicLookupAttribute(connectionId, "new_order", {
     *   "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
     *   "SchemaName": "new_CustomerId",
     *   "LogicalName": "new_customerid",
     *   "DisplayName": dataverseManager.buildLabel("Customer"),
     *   "Description": dataverseManager.buildLabel("Customer for this order"),
     *   "RequiredLevel": { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
     *   "AttributeType": "Lookup",
     *   "AttributeTypeName": { Value: "LookupType" },
     *   "Targets": ["account", "contact"]
     * });
     *
     * @example
     * // Create a Regarding lookup (custom entities)
     * const result = await dataverseManager.createPolymorphicLookupAttribute(connectionId, "new_note", {
     *   "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
     *   "SchemaName": "new_RegardingObjectId",
     *   "LogicalName": "new_regardingobjectid",
     *   "DisplayName": dataverseManager.buildLabel("Regarding"),
     *   "Description": dataverseManager.buildLabel("Item this note is about"),
     *   "RequiredLevel": { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
     *   "AttributeType": "Lookup",
     *   "AttributeTypeName": { Value: "LookupType" },
     *   "Targets": ["account", "contact", "new_project", "new_task"]
     * }, { solutionUniqueName: "MyCustomSolution" });
     */
    async createPolymorphicLookupAttribute(
        connectionId: string,
        entityLogicalName: string,
        attributeDefinition: Record<string, unknown>,
        options?: MetadataOperationOptions,
    ): Promise<{ AttributeId: string }> {
        // Validate Targets array is present
        if (!attributeDefinition.Targets || !Array.isArray(attributeDefinition.Targets) || attributeDefinition.Targets.length === 0) {
            throw new Error("Polymorphic lookup attribute requires a non-empty Targets array with entity logical names");
        }

        // Ensure AttributeType and AttributeTypeName are set correctly
        if (!attributeDefinition.AttributeType) {
            attributeDefinition.AttributeType = "Lookup";
        }
        if (!attributeDefinition.AttributeTypeName) {
            attributeDefinition.AttributeTypeName = { Value: "LookupType" };
        }

        // Use the standard createAttribute method (it supports polymorphic lookups)
        const result = await this.createAttribute(connectionId, entityLogicalName, attributeDefinition, options);
        return { AttributeId: result.id };
    }

    // ========================================
    // Relationship Metadata CRUD Operations
    // ========================================

    /**
     * Create a new relationship
     * @param connectionId - Connection ID to use
     * @param relationshipDefinition - Relationship metadata payload (must include @odata.type for OneToManyRelationshipMetadata or ManyToManyRelationshipMetadata)
     * @param options - Optional metadata operation options
     * @returns Object containing the created relationship's MetadataId
     *
     * @example
     * // Create 1:N relationship with cascade configuration
     * const result = await dataverseManager.createRelationship(connectionId, {
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
     *     "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
     *     "SchemaName": "new_projectid",
     *     "DisplayName": dataverseManager.buildLabel("Project")
     *   }
     * }, { solutionUniqueName: "MySolution" });
     *
     * await dataverseManager.publishCustomizations(connectionId);
     */
    async createRelationship(connectionId: string, relationshipDefinition: Record<string, unknown>, options?: MetadataOperationOptions): Promise<{ id: string }> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/RelationshipDefinitions`);
        const headers = this.buildMetadataHeaders(options);

        const response = await this.makeHttpRequest(url, "POST", accessToken, relationshipDefinition, undefined, headers);

        // Extract MetadataId from OData-EntityId header
        // Metadata operations return 204 No Content with no body, header is the only source
        const entityId = response.headers["odata-entityid"];
        if (!entityId) {
            throw new Error("Failed to retrieve relationship MetadataId from response. The OData-EntityId header was missing.");
        }
        return {
            id: this.extractIdFromUrl(entityId),
        };
    }

    /**
     * Update a relationship definition
     * NOTE: This uses PUT which requires the FULL relationship definition (retrieve-modify-PUT pattern)
     * @param connectionId - Connection ID to use
     * @param relationshipIdentifier - Relationship SchemaName or MetadataId
     * @param relationshipDefinition - Complete relationship metadata payload
     * @param options - Optional metadata operation options (mergeLabels defaults to true)
     *
     * @example
     * // Update cascade configuration on existing relationship
     * const existingRel = await dataverseManager.getRelationship(connectionId, "new_project_tasks");
     * existingRel.CascadeConfiguration = {
     *   "Assign": "NoCascade",
     *   "Delete": "Cascade",  // Changed from RemoveLink to Cascade
     *   "Merge": "NoCascade",
     *   "Reparent": "NoCascade",
     *   "Share": "NoCascade",
     *   "Unshare": "NoCascade"
     * };
     * await dataverseManager.updateRelationship(connectionId, "new_project_tasks", existingRel);
     */
    async updateRelationship(connectionId: string, relationshipIdentifier: string, relationshipDefinition: Record<string, unknown>, options?: MetadataOperationOptions): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        // Auto-detect MetadataId vs SchemaName
        const isMetadataId = this.isGuid(relationshipIdentifier);
        const identifier = isMetadataId ? relationshipIdentifier : `SchemaName='${encodeURIComponent(relationshipIdentifier)}'`;

        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/RelationshipDefinitions(${identifier})`);

        const headers = this.buildMetadataHeaders({
            ...options,
            mergeLabels: options?.mergeLabels !== undefined ? options.mergeLabels : true,
        });

        await this.makeHttpRequest(url, "PUT", accessToken, relationshipDefinition, undefined, headers);
    }

    /**
     * Delete a relationship
     * @param connectionId - Connection ID to use
     * @param relationshipIdentifier - Relationship SchemaName or MetadataId
     */
    async deleteRelationship(connectionId: string, relationshipIdentifier: string): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        // Auto-detect MetadataId vs SchemaName
        const isMetadataId = this.isGuid(relationshipIdentifier);
        const identifier = isMetadataId ? relationshipIdentifier : `SchemaName='${encodeURIComponent(relationshipIdentifier)}'`;

        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/RelationshipDefinitions(${identifier})`);

        await this.makeHttpRequest(url, "DELETE", accessToken);
    }

    // ========================================
    // Global Option Set (Choice) CRUD Operations
    // ========================================

    /**
     * Create a new global option set (choice)
     *
     * NOTE: To retrieve global option sets after creation, use queryData() method with
     * "GlobalOptionSetDefinitions" endpoint or use getEntityRelatedMetadata() for options
     * associated with specific entities.
     *
     * @param connectionId - Connection ID to use
     * @param optionSetDefinition - Global option set metadata payload
     * @param options - Optional metadata operation options
     * @returns Object containing the created option set's MetadataId
     *
     * @example
     * const result = await dataverseManager.createGlobalOptionSet(connectionId, {
     *   "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
     *   "Name": "new_projectstatus",
     *   "DisplayName": dataverseManager.buildLabel("Project Status"),
     *   "OptionSetType": "Picklist",
     *   "Options": [
     *     { "Value": 1, "Label": dataverseManager.buildLabel("Active") },
     *     { "Value": 2, "Label": dataverseManager.buildLabel("On Hold") },
     *     { "Value": 3, "Label": dataverseManager.buildLabel("Completed") }
     *   ]
     * }, { solutionUniqueName: "MySolution" });
     *
     * await dataverseManager.publishCustomizations(connectionId);
     *
     * // Retrieve the created option set
     * const optionSet = await dataverseManager.queryData(connectionId,
     *   "GlobalOptionSetDefinitions(Name='new_projectstatus')"
     * );
     */
    async createGlobalOptionSet(connectionId: string, optionSetDefinition: Record<string, unknown>, options?: MetadataOperationOptions): Promise<{ id: string }> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);
        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/GlobalOptionSetDefinitions`);
        const headers = this.buildMetadataHeaders(options);

        const response = await this.makeHttpRequest(url, "POST", accessToken, optionSetDefinition, undefined, headers);

        // Extract MetadataId from OData-EntityId header
        // Metadata operations return 204 No Content with no body, header is the only source
        const entityId = response.headers["odata-entityid"];
        if (!entityId) {
            throw new Error("Failed to retrieve global option set MetadataId from response. The OData-EntityId header was missing.");
        }
        return {
            id: this.extractIdFromUrl(entityId),
        };
    }

    /**
     * Update a global option set definition
     * NOTE: This uses PUT which requires the FULL option set definition (retrieve-modify-PUT pattern)
     * @param connectionId - Connection ID to use
     * @param optionSetIdentifier - Option set Name or MetadataId
     * @param optionSetDefinition - Complete option set metadata payload
     * @param options - Optional metadata operation options (mergeLabels defaults to true)
     */
    async updateGlobalOptionSet(connectionId: string, optionSetIdentifier: string, optionSetDefinition: Record<string, unknown>, options?: MetadataOperationOptions): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        // Auto-detect MetadataId vs Name
        const isMetadataId = this.isGuid(optionSetIdentifier);
        const identifier = isMetadataId ? optionSetIdentifier : `Name='${encodeURIComponent(optionSetIdentifier)}'`;

        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/GlobalOptionSetDefinitions(${identifier})`);

        const headers = this.buildMetadataHeaders({
            ...options,
            mergeLabels: options?.mergeLabels !== undefined ? options.mergeLabels : true,
        });

        await this.makeHttpRequest(url, "PUT", accessToken, optionSetDefinition, undefined, headers);
    }

    /**
     * Delete a global option set
     * @param connectionId - Connection ID to use
     * @param optionSetIdentifier - Option set Name or MetadataId
     */
    async deleteGlobalOptionSet(connectionId: string, optionSetIdentifier: string): Promise<void> {
        const { connection, accessToken } = await this.getConnectionWithToken(connectionId);

        // Auto-detect MetadataId vs Name
        const isMetadataId = this.isGuid(optionSetIdentifier);
        const identifier = isMetadataId ? optionSetIdentifier : `Name='${encodeURIComponent(optionSetIdentifier)}'`;

        const url = this.buildApiUrl(connection, `api/data/${DATAVERSE_API_VERSION}/GlobalOptionSetDefinitions(${identifier})`);

        await this.makeHttpRequest(url, "DELETE", accessToken);
    }

    // ========================================
    // Option Value Modification Actions
    // ========================================

    /**
     * Insert a new option value into a local or global option set
     *
     * NOTE: This method is for standard choice columns. For Status choice columns (statuscode),
     * use the InsertStatusValue action via execute() method instead, which requires additional
     * StateCode parameter to associate the status with a state.
     *
     * Works for both local option sets (specify EntityLogicalName + AttributeLogicalName)
     * and global option sets (specify OptionSetName).
     *
     * @param connectionId - Connection ID to use
     * @param params - Parameters for inserting the option value
     * @param params.Value - Integer value for the option
     * @param params.Label - Label for the option
     * @param params.EntityLogicalName - (For local option sets) Entity logical name
     * @param params.AttributeLogicalName - (For local option sets) Attribute logical name
     * @param params.OptionSetName - (For global option sets) Option set name
     * @param params.SolutionUniqueName - Optional solution unique name
     * @returns Object containing the new option value
     *
     * @example
     * // Insert into local option set
     * await dataverseManager.insertOptionValue(connectionId, {
     *   EntityLogicalName: "new_project",
     *   AttributeLogicalName: "new_priority",
     *   Value: 4,
     *   Label: dataverseManager.buildLabel("Critical")
     * });
     * await dataverseManager.publishCustomizations(connectionId, "new_project");
     *
     * @example
     * // Insert into global option set
     * await dataverseManager.insertOptionValue(connectionId, {
     *   OptionSetName: "new_projectstatus",
     *   Value: 4,
     *   Label: dataverseManager.buildLabel("Cancelled")
     * });
     * await dataverseManager.publishCustomizations(connectionId);
     */
    async insertOptionValue(connectionId: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
        return await this.execute(connectionId, {
            operationName: "InsertOptionValue",
            operationType: "action",
            parameters: params,
        });
    }

    /**
     * Update an existing option value in a local or global option set
     *
     * @param connectionId - Connection ID to use
     * @param params - Parameters for updating the option value
     * @param params.Value - Integer value of the option to update
     * @param params.Label - New label for the option
     * @param params.EntityLogicalName - (For local option sets) Entity logical name
     * @param params.AttributeLogicalName - (For local option sets) Attribute logical name
     * @param params.OptionSetName - (For global option sets) Option set name
     * @param params.MergeLabels - Optional boolean to merge labels (defaults to false)
     *
     * @example
     * await dataverseManager.updateOptionValue(connectionId, {
     *   EntityLogicalName: "new_project",
     *   AttributeLogicalName: "new_priority",
     *   Value: 4,
     *   Label: buildLabel("High Priority"),
     *   MergeLabels: true
     * });
     * await dataverseManager.publishCustomizations(connectionId, "new_project");
     */
    async updateOptionValue(connectionId: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
        return await this.execute(connectionId, {
            operationName: "UpdateOptionValue",
            operationType: "action",
            parameters: params,
        });
    }

    /**
     * Delete an option value from a local or global option set
     *
     * @param connectionId - Connection ID to use
     * @param params - Parameters for deleting the option value
     * @param params.Value - Integer value of the option to delete
     * @param params.EntityLogicalName - (For local option sets) Entity logical name
     * @param params.AttributeLogicalName - (For local option sets) Attribute logical name
     * @param params.OptionSetName - (For global option sets) Option set name
     *
     * @example
     * await dataverseManager.deleteOptionValue(connectionId, {
     *   EntityLogicalName: "new_project",
     *   AttributeLogicalName: "new_priority",
     *   Value: 4
     * });
     * await dataverseManager.publishCustomizations(connectionId, "new_project");
     */
    async deleteOptionValue(connectionId: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
        return await this.execute(connectionId, {
            operationName: "DeleteOptionValue",
            operationType: "action",
            parameters: params,
        });
    }

    /**
     * Reorder options in a local or global option set
     *
     * @param connectionId - Connection ID to use
     * @param params - Parameters for ordering options
     * @param params.Values - Array of option values in desired order
     * @param params.EntityLogicalName - (For local option sets) Entity logical name
     * @param params.AttributeLogicalName - (For local option sets) Attribute logical name
     * @param params.OptionSetName - (For global option sets) Option set name
     *
     * @example
     * await dataverseManager.orderOption(connectionId, {
     *   EntityLogicalName: "new_project",
     *   AttributeLogicalName: "new_priority",
     *   Values: [3, 1, 2, 4] // Reorder options by value
     * });
     * await dataverseManager.publishCustomizations(connectionId, "new_project");
     */
    async orderOption(connectionId: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
        return await this.execute(connectionId, {
            operationName: "OrderOption",
            operationType: "action",
            parameters: params,
        });
    }
}
