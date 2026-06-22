type JsonSchemaType = "string" | "number" | "boolean" | "array" | "object";

export type JsonObjectSchema = Record<string, unknown>;

const jsonSchemaTypes: JsonSchemaType[] = ["string", "number", "boolean", "array", "object"];

function isJsonSchemaType(value: string): value is JsonSchemaType {
    return jsonSchemaTypes.includes(value as JsonSchemaType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function convertRequiredArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function convertPPTBSchemaToJsonSchema(pptbSchema: unknown): JsonObjectSchema {
    if (!isRecord(pptbSchema)) {
        return {};
    }

    const result: JsonObjectSchema = {};
    const type = typeof pptbSchema.type === "string" ? pptbSchema.type : undefined;

    if (type !== undefined && isJsonSchemaType(type)) {
        result.type = type;
    } else if (isRecord(pptbSchema.properties)) {
        result.type = "object";
    }

    if (Array.isArray(pptbSchema.enum)) {
        result.enum = pptbSchema.enum;
    }

    if (type === "array" && isRecord(pptbSchema.items)) {
        result.items = convertPPTBSchemaToJsonSchema(pptbSchema.items);
    }

    if (result.type === "object" || isRecord(pptbSchema.properties)) {
        const properties = pptbSchema.properties;

        if (isRecord(properties)) {
            const convertedProperties: Record<string, unknown> = {};
            const requiredFields: string[] = [];

            for (const [name, property] of Object.entries(properties)) {
                convertedProperties[name] = convertPPTBSchemaToJsonSchema(property);

                if (isRecord(property) && property.required === true) {
                    requiredFields.push(name);
                }
            }

            result.properties = convertedProperties;

            const schemaRequired = convertRequiredArray(pptbSchema.required);
            if (schemaRequired.length > 0) {
                result.required = schemaRequired;
            } else if (requiredFields.length > 0) {
                result.required = requiredFields;
            }
        }
    }

    return result;
}
