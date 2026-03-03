// Vite asset imports - PNG files are inlined as base64 data URIs (assetsInlineLimit: 102400)
declare module "*.png" {
    const url: string;
    export default url;
}
