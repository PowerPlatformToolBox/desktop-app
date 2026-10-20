"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasConnectionSlotDefinitions = hasConnectionSlotDefinitions;
exports.validateConnectionSlotDefinitions = validateConnectionSlotDefinitions;
function hasConnectionSlotDefinitions(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "slots");
}
function validateConnectionSlotDefinitions(value, features = {}) {
    if (!hasConnectionSlotDefinitions(value)) return [];
    const errors = [];
    const extraKeys = Object.keys(value).filter((key) => key !== "slots");
    if (extraKeys.length) errors.push(`features.connections.slots cannot be combined with other connection properties: ${extraKeys.join(", ")}`);
    if (features.connectionTypes !== undefined) errors.push("features.connections.slots cannot be combined with features.connectionTypes; declare types on each slot");
    if (features.multiConnection !== undefined || features.connectionRequirement !== undefined) errors.push("features.connections.slots cannot be combined with legacy connection fields");
    if (!Array.isArray(value.slots) || value.slots.length < 1 || value.slots.length > 10) {
        errors.push("features.connections.slots must be an array containing 1 to 10 slot definitions");
        return errors;
    }
    // Check every index, including sparse arrays supplied through programmatic APIs.
    for (let index = 0; index < value.slots.length; index++) {
        const slot = value.slots[index];
        const path = `features.connections.slots[${index}]`;
        if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
            errors.push(`${path} must be an object`);
            continue;
        }
        const unknown = Object.keys(slot).filter((key) => !["label", "connectionTypes", "required"].includes(key));
        if (unknown.length) errors.push(`${path} contains unsupported properties: ${unknown.join(", ")}`);
        if (slot.label !== undefined && (typeof slot.label !== "string" || !slot.label.trim())) errors.push(`${path}.label must be a nonempty string`);
        if (slot.required !== undefined && typeof slot.required !== "boolean") errors.push(`${path}.required must be a boolean`);
        const types = slot.connectionTypes ?? ["dataverse"];
        if (
            slot.connectionTypes === null ||
            !Array.isArray(types) ||
            !types.length ||
            new Set(types).size !== types.length ||
            Array.from(types).some((type) => type !== "dataverse" && type !== "financeOperations")
        ) {
            errors.push(`${path}.connectionTypes must be a non-empty, unique array containing only 'dataverse' and 'financeOperations'`);
        } else if (features.enabledForPowerPlatformAPI === true && types.some((type) => type !== "dataverse")) {
            errors.push(`${path} must support only Dataverse when features.enabledForPowerPlatformAPI is true`);
        }
    }
    return errors;
}
