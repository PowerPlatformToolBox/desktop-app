import type { AzureAPI } from "../azureAPI";

type Subscription = AzureAPI.SubscriptionList["value"][number];

/**
 * Call from a user action inside PPTB. Supply your tool's Fluent UI subscription picker,
 * currency-aware table renderer, and notification handler. A Cancel button aborts signal.
 */
export async function showDailyAzureCosts(
    chooseSubscription: (subscriptions: Subscription[]) => Promise<string | null>,
    render: (pages: AzureAPI.CostQueryResult[]) => void,
    notify: (message: string) => void,
    signal: AbortSignal,
): Promise<void> {
    if (!window.azureAPI) {
        notify("This tool requires a PPTB 1.2.9 build with Azure API support for Azure reports. Other reports remain available.");
        return;
    }
    const options: AzureAPI.Options = { connectionTarget: "primary", timeoutMs: 30000 };
    let activeRequest: string | undefined;
    let cancellation: Promise<void> = Promise.resolve();
    let cancellationError = false;
    let connectionChanged = false;
    const cancel = () => {
        if (activeRequest)
            cancellation = window.azureAPI.cancelRequest(activeRequest).catch(() => {
                cancellationError = true;
            });
    };
    const unsubscribe = window.azureAPI.onConnectionChanged((event) => {
        if (event.reason === "connectionChanged") {
            connectionChanged = true;
            cancel();
        }
    });
    const request = async <T>(run: (options: AzureAPI.Options) => Promise<T>): Promise<T> => {
        signal.throwIfAborted();
        if (connectionChanged) throw new Error("Connection changed. Select the subscription again before loading costs.");
        activeRequest = crypto.randomUUID();
        try {
            return await run({ ...options, requestId: activeRequest });
        } finally {
            activeRequest = undefined;
        }
    };
    signal.addEventListener("abort", cancel);
    try {
        const state = await window.azureAPI.arm.getConnectionState(options.connectionTarget);
        if (!state.configured || !state.signedIn) {
            notify("Authenticate Dataverse and enable Azure Resource Manager API in Edit Connection. Azure reporting is optional.");
            return;
        }
        await request((options) => window.azureAPI.arm.authenticate(options));
        const subscriptions: Subscription[] = [];
        let listing = await request((options) => window.azureAPI.arm.listSubscriptions(options));
        subscriptions.push(...(listing.data?.value ?? []));
        while (listing.continuation) {
            const handle = listing.continuation;
            listing = await request((options) => window.azureAPI.arm.nextPage<AzureAPI.SubscriptionList>(handle, options));
            subscriptions.push(...(listing.data?.value ?? []));
        }
        const id = await chooseSubscription(subscriptions);
        if (!id) return;
        const scope = `/subscriptions/${id}`;
        const access = await request((options) => window.azureAPI.arm.checkCostAccess(scope, options));
        if (access.costData !== "accessible") {
            notify(access.error?.message ?? "Cost access could not be verified. Ask your administrator to check scope permissions and billing visibility.");
            return;
        }
        const pages: AzureAPI.CostQueryResult[] = [];
        let response = await request((options) =>
            window.azureAPI.arm.queryCosts(
                scope,
                { type: "ActualCost", timeframe: "MonthToDate", dataset: { granularity: "Daily", aggregation: { totalCost: { name: "PreTaxCost", function: "Sum" } } } },
                options,
            ),
        );
        if (response.data) pages.push(response.data);
        while (response.continuation) {
            const handle = response.continuation;
            response = await request((options) => window.azureAPI.arm.nextPage<AzureAPI.CostQueryResult>(handle, options));
            if (response.data) pages.push(response.data);
        }
        signal.throwIfAborted();
        if (connectionChanged) throw new Error("Connection changed. Discard the stale report and reload.");
        // Locate columns by name on each page. Keep rows separated by Currency; do not sum mixed currencies.
        render(pages);
    } catch (error) {
        const details = error && typeof error === "object" && "message" in error ? String(error.message) : "Azure reporting failed.";
        notify(details);
    } finally {
        signal.removeEventListener("abort", cancel);
        unsubscribe();
        await cancellation;
        if (cancellationError) notify("Could not confirm cancellation. Discard the pending report and check the connection.");
    }
}
