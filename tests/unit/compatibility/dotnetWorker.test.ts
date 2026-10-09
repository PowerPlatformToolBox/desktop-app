import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { CancellationTokenSource, createMessageConnection, StreamMessageReader, StreamMessageWriter, type MessageConnection } from "vscode-jsonrpc/node";

const describeProbe = process.env.PPTB_DOTNET_PROBE === "1" ? describe : describe.skip;
const workerDll = path.resolve(__dirname, "../../fixtures/dotnet-worker/Worker/bin/Release/net8.0/Worker.dll");

describeProbe("PR0: SQL 4 CDS shared DLL over bidirectional stdio", () => {
    let worker: ChildProcessWithoutNullStreams;
    let connection: MessageConnection;
    let exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
    let diagnostics: string;

    beforeEach(async () => {
        if (!existsSync(workerDll)) throw new Error("Build the fixture first with pnpm run test:dotnet-probe.");
        diagnostics = "";
        worker = spawn(process.env.PPTB_DOTNET_PATH || "dotnet", [workerDll], {
            shell: false,
            env: { PATH: process.env.PATH, HOME: process.env.HOME, SystemRoot: process.env.SystemRoot, DOTNET_ROOT: process.env.DOTNET_ROOT, DOTNET_NOLOGO: "1" },
            stdio: ["pipe", "pipe", "pipe"],
        });
        exited = new Promise((resolve, reject) => {
            worker.once("error", reject);
            worker.once("close", (code, signal) => resolve({ code, signal }));
        });
        worker.stderr.on("data", (chunk: Buffer) => {
            diagnostics = (diagnostics + chunk.toString("utf8")).slice(-8192);
        });
        connection = createMessageConnection(new StreamMessageReader(worker.stdout), new StreamMessageWriter(worker.stdin));
        connection.listen();
        await connection.sendRequest("ping");
    }, 15000);

    afterEach(async () => {
        connection?.dispose();
        if (!worker) return;
        worker.stdin.end();
        const killTimer = setTimeout(() => worker.kill("SIGKILL"), 3000);
        try {
            await exited;
        } finally {
            clearTimeout(killTimer);
        }
    });

    it("executes the actual engine DLL while awaiting a reverse FetchXML callback", async () => {
        const progress: string[] = [];
        const requests: string[] = [];
        connection.onNotification("progress", (stage: string) => progress.push(stage));
        connection.onRequest("dataverse/fetchXml", async (fetchXml: string) => {
            requests.push(fetchXml);
            expect(await connection.sendRequest("ping")).toBe("pong");
            return { Entities: [{ LocaleId: 1033 }] };
        });

        expect(await connection.sendRequest("query", "SELECT 40 + 2 AS answer")).toBe("42");
        expect(requests).toEqual(['<fetch><entity name="organization"><attribute name="localeid" /></entity></fetch>']);
        expect(progress).toEqual(["starting", "completed"]);
        expect(diagnostics).toContain("stdout is reserved for JSON-RPC");
        expect(await connection.sendRequest("query", "SELECT N'Gr\u00fc\u00dfe' AS greeting")).toBe("Gr\u00fc\u00dfe");
    }, 15000);

    it("correlates concurrent queries and reverse callbacks", async () => {
        let callbackCount = 0;
        connection.onRequest("dataverse/fetchXml", () => {
            callbackCount++;
            return { Entities: [{ LocaleId: 1033 }] };
        });
        expect(await Promise.all([connection.sendRequest("query", "SELECT 11"), connection.sendRequest("query", "SELECT 22")])).toEqual(["11", "22"]);
        expect(callbackCount).toBe(2);
    }, 15000);

    it("propagates cancellation while the engine awaits a callback and remains usable", async () => {
        const cancellation = new CancellationTokenSource();
        let callbackCancelled = false;
        let enteredCallback!: () => void;
        const callbackEntered = new Promise<void>((resolve) => {
            enteredCallback = resolve;
        });
        connection.onRequest(
            "dataverse/fetchXml",
            (_fetchXml: string, token) =>
                new Promise((resolve) => {
                    const subscription = token.onCancellationRequested(() => {
                        callbackCancelled = true;
                        subscription.dispose();
                        resolve({ Entities: [] });
                    });
                    enteredCallback();
                }),
        );
        const pending = connection.sendRequest("query", "SELECT 42", cancellation.token);
        const rejected = expect(pending).rejects.toMatchObject({ code: -32800 });
        await callbackEntered;
        cancellation.cancel();
        await rejected;
        expect(await connection.sendRequest("ping")).toBe("pong");
        expect(callbackCancelled).toBe(true);
        cancellation.dispose();
    }, 15000);

    it("returns callback errors without poisoning the persistent worker", async () => {
        connection.onRequest("dataverse/fetchXml", () => {
            throw new Error("Simulated Dataverse rejection");
        });
        await expect(connection.sendRequest("query", "SELECT 42")).rejects.toThrow();
        expect(await connection.sendRequest("ping")).toBe("pong");
    }, 15000);

    it("exits cleanly when the host closes stdin", async () => {
        worker.stdin.end();
        expect(await exited).toEqual({ code: 0, signal: null });
    }, 10000);
});
