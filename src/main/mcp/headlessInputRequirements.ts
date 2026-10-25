import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ConnectionSlotRange, connectionTargetLabel } from "../../common/connectionSlots";
import { Connection } from "../../common/types";
import { JsonObjectSchema } from "./schemaConverter";

export const LIST_CONNECTIONS_NAME = "pptb_list_connections";
export const AUTHENTICATE_CONNECTIONS_NAME = "pptb_authenticate_connections";
export const MAX_CONNECTION_NAMES = 10;

export const CONNECTION_SELECTION_INSTRUCTIONS =
    `Before invoking a PPTB tool that uses connections for a new task, call ${LIST_CONNECTIONS_NAME}, show a connection picker in the agent chat ` +
    "(use the client's user-input/selection UI when available), and wait for the user's explicit selection. Show each connection's name, environment, and URL. " +
    "Always show the picker, even if only one connection exists or connections are already signed-in. Authentication status is not permission to choose a connection. " +
    `For the user-selected connections only, skip authentication when authStatus is "signed-in"; otherwise call ${AUTHENTICATE_CONNECTIONS_NAME} and wait for successful authentication. ` +
    "Invoke the requested tool with only the user-picked names in __pptb.connectionNames, in slot order. Keep that selection for follow-up calls and retries within the same task. " +
    "Never choose, probe, or iterate through other connections to find a record, including after an empty result or error. To change environments, show the picker again and wait for a new user selection. " +
    "If the user cancels or has not selected a connection, stop; do not authenticate or invoke a connection-dependent tool.";

const TOKEN_REUSE_BUFFER_MS = 60_000;

/**
 * - `signed-in`: a cached token is valid and will be reused.
 * - `refreshable`: PPTB can obtain a token without user interaction (client secret, silent refresh, username/password).
 * - `sign-in-required`: the user must complete a browser sign-in via `pptb_authenticate_connections`.
 * - `incomplete-credentials`: the connection must be completed in the PPTB app before use.
 */
export type ConnectionAuthStatus = "signed-in" | "refreshable" | "sign-in-required" | "incomplete-credentials";

export interface ConnectionSummary {
    name: string;
    environment: Connection["environment"];
    url: string;
    authenticationType: Connection["authenticationType"];
    authStatus: ConnectionAuthStatus;
    category?: string;
}

export interface ConnectionSlotDescriptor {
    index: number;
    label: string;
    required: boolean;
    assignedConnectionName?: string;
}

export interface ConnectionRequirement {
    minConnections: number;
    maxConnections: number;
    slots: ConnectionSlotDescriptor[];
    providedConnectionNames: string[];
    unknownConnectionNames: string[];
    availableConnections: ConnectionSummary[];
}

export interface AuthenticationRequirement {
    connections: Array<{
        name: string;
        environment: Connection["environment"];
        authenticationType: Connection["authenticationType"];
        reason: string;
    }>;
}

export interface MissingParameter {
    name: string;
    type: string;
    title?: string;
    description?: string;
    enum?: unknown[];
    schema?: Record<string, unknown>;
}

export interface InputRequirements {
    connections?: ConnectionRequirement;
    authentication?: AuthenticationRequirement;
    parameters?: MissingParameter[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasRequirements(requirements: InputRequirements): boolean {
    return Boolean(requirements.connections || requirements.authentication || (requirements.parameters && requirements.parameters.length > 0));
}

export function hasReusableToken(connection: Connection, now = Date.now()): boolean {
    if (!connection.accessToken) {
        return false;
    }
    if (!connection.tokenExpiry) {
        return true;
    }
    const expiry = new Date(connection.tokenExpiry).getTime();
    return Number.isFinite(expiry) && expiry - now > TOKEN_REUSE_BUFFER_MS;
}

export function getConnectionAuthStatus(connection: Connection, now = Date.now()): ConnectionAuthStatus {
    if (connection.hasIncompleteCredentials) {
        return "incomplete-credentials";
    }
    if (hasReusableToken(connection, now)) {
        return "signed-in";
    }
    switch (connection.authenticationType) {
        case "clientSecret":
        case "usernamePassword":
            return "refreshable";
        case "interactive":
            return connection.msalAccountId || connection.refreshToken ? "refreshable" : "sign-in-required";
        default:
            return "incomplete-credentials";
    }
}

/** Agent-safe projection of a saved connection: no IDs, secrets, or tokens. */
export function summarizeConnection(connection: Connection, now = Date.now()): ConnectionSummary {
    return {
        name: connection.name,
        environment: connection.environment,
        url: connection.url,
        authenticationType: connection.authenticationType,
        authStatus: getConnectionAuthStatus(connection, now),
        ...(connection.category ? { category: connection.category } : {}),
    };
}

export function buildConnectionSlots(range: ConnectionSlotRange, providedNames: string[]): ConnectionSlotDescriptor[] {
    const slotCount = Math.min(Math.max(range.max, range.min), MAX_CONNECTION_NAMES);
    return Array.from({ length: slotCount }, (_, index) => ({
        index,
        label: connectionTargetLabel(index),
        required: index < range.min,
        ...(providedNames[index] ? { assignedConnectionName: providedNames[index] } : {}),
    }));
}

/**
 * Splits schema validation errors into top-level missing required fields and every other error.
 */
export function partitionValidationErrors(errors: string[]): { missingFields: string[]; otherErrors: string[] } {
    const missingFields: string[] = [];
    const otherErrors: string[] = [];
    for (const error of errors) {
        const match = /^\$\.([^.[\]:]+): required field is missing$/.exec(error);
        if (match?.[1]) {
            missingFields.push(match[1]);
        } else {
            otherErrors.push(error);
        }
    }
    return { missingFields, otherErrors };
}

export function describeMissingParameters(inputSchema: JsonObjectSchema, fieldNames: string[]): MissingParameter[] {
    const properties = isRecord(inputSchema.properties) ? inputSchema.properties : {};
    return fieldNames.map((name) => {
        const prop = isRecord(properties[name]) ? properties[name] : {};
        const type = typeof prop.type === "string" ? prop.type : "string";
        return {
            name,
            type,
            ...(typeof prop.title === "string" ? { title: prop.title } : {}),
            ...(typeof prop.description === "string" ? { description: prop.description } : {}),
            ...(Array.isArray(prop.enum) && prop.enum.length > 0 ? { enum: prop.enum } : {}),
            ...(type === "object" || type === "array" ? { schema: prop } : {}),
        };
    });
}

/**
 * Builds the agent-facing "input required" response. It is returned as an error result so MCP clients
 * do not validate it against the tool's output schema and so the agent treats it as a correctable step.
 */
export function createInputRequiredResult(params: {
    toolName: string;
    executionMode: "headless" | "windowed";
    requirements: InputRequirements;
    messages: string[];
    windowedBackupAvailable: boolean;
}): CallToolResult {
    const { toolName, executionMode, requirements, messages, windowedBackupAvailable } = params;
    const steps: string[] = [];

    if (requirements.connections) {
        const { minConnections, maxConnections } = requirements.connections;
        const countText = minConnections === maxConnections ? `${minConnections}` : `${minConnections} to ${maxConnections}`;
        steps.push(
            `Show a connection picker in the agent chat for ${countText} connection(s) from requirements.connections.availableConnections ` +
                `(show each name, environment, and URL) and wait for the user's explicit selection, even if only one connection exists or connections are already signed-in. ` +
                `Pass the chosen names in __pptb.connectionNames in slot order (see requirements.connections.slots).`,
        );
    }

    if (requirements.connections || requirements.authentication) {
        steps.push(
            "Use only connections explicitly picked by the user for this task. Never choose, probe, or iterate through other connections to find a record, including after an empty result or error.",
        );
        steps.push(
            `Skip authentication for selected connections whose authStatus is "signed-in". Before retrying, call ${AUTHENTICATE_CONNECTIONS_NAME} with {"connectionNames": [...]} ` +
                `only for user-selected connections whose authStatus is not "signed-in" (and user-selected connections listed in requirements.authentication), and wait for successful authentication. ` +
                `Interactive connections open a browser sign-in on the user's machine, so tell the user first.`,
        );
    }

    if (requirements.parameters && requirements.parameters.length > 0) {
        const names = requirements.parameters.map((parameter) => `${parameter.name} (${parameter.type})`).join(", ");
        steps.push(`Ask the user for values of: ${names}. Use values already known from the conversation when unambiguous. Pass them as top-level arguments.`);
    }

    steps.push(`Call "${toolName}" again with the original arguments plus the new values.`);

    if (windowedBackupAvailable && executionMode === "headless") {
        steps.push(`Backup only: if the user prefers to pick connections and enter values in the PPTB UI, retry with __pptb.executionMode set to "windowed".`);
    }

    const payload = {
        status: "input_required",
        tool: toolName,
        executionMode,
        messages,
        requirements,
        nextSteps: steps,
    };

    const text = [
        `ACTION REQUIRED (not a failure): "${toolName}" needs more input from the user before it can run.`,
        ...messages.map((message) => `- ${message}`),
        "Next steps:",
        ...steps.map((step, index) => `${index + 1}. ${step}`),
        "",
        JSON.stringify(payload),
    ].join("\n");

    return {
        content: [{ type: "text", text }],
        isError: true,
    };
}
