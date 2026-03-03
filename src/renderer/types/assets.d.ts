// Vite asset imports - PNG files imported normally resolve to URL strings
declare module "*.png" {
    const url: string;
    export default url;
}

// PNG files imported with ?inline are always inlined as base64 data: URIs
declare module "*.png?inline" {
    const dataUri: string;
    export default dataUri;
}
