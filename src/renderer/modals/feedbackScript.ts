export function getModalFeedbackScriptHelpers(): string {
    return `
    /**
     * Extracts the feedback message from either a legacy string payload or a structured
     * feedback object with message/type properties.
     *
     * @param {string | { message?: string, type?: string }} data
     * @returns {string}
     */
    const getFeedbackMessage = (data) => {
        return typeof data === "string"
            ? data
            : data && typeof data === "object" && typeof data.message === "string"
              ? data.message
              : "";
    };

    /**
     * Determines the feedback style from a structured feedback payload.
     * Any non-success payload falls back to the error treatment.
     *
     * @param {string | { message?: string, type?: string }} data
     * @returns {"success" | "error"}
     */
    const getFeedbackType = (data) => {
        return data && typeof data === "object" && data.type === "success" ? "success" : "error";
    };
`;
}
