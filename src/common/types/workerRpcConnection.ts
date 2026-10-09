import { AbstractMessageReader, AbstractMessageWriter, createMessageConnection, Disposable, type DataCallback, type Message, type MessageConnection } from "vscode-jsonrpc/browser";

export interface WorkerRpcTransport {
    send(message: Message): Promise<void>;
    onMessage(listener: (message: Message) => void): () => void;
    onExit(listener: () => void): () => void;
}

class WorkerMessageReader extends AbstractMessageReader {
    private callback: DataCallback | undefined;
    private readonly queued: Message[] = [];
    private queuedBytes = 0;
    private failure: Error | undefined;
    private released = false;

    listen(callback: DataCallback): Disposable {
        if (this.callback) throw new Error("Worker RPC reader is already listening");
        this.callback = callback;
        return Disposable.create(() => {
            this.callback = undefined;
        });
    }

    accept(message: Message): void {
        if (this.callback && this.released) {
            this.callback(message);
            return;
        }
        if (this.failure) return;
        try {
            this.queuedBytes += new TextEncoder().encode(JSON.stringify(message)).byteLength;
        } catch (error) {
            this.failure = error instanceof Error ? error : new Error(String(error));
            return;
        }
        if (this.queued.length >= 64 || this.queuedBytes > 4 * 1024 * 1024) {
            this.queued.length = 0;
            this.queuedBytes = 0;
            this.failure = new Error("Worker RPC startup message buffer limit exceeded");
            return;
        }
        this.queued.push(message);
    }

    listenReady(): void {
        if (!this.callback || this.released) return;
        this.released = true;
        for (const message of this.queued.splice(0)) this.callback(message);
        this.queuedBytes = 0;
        if (this.failure) {
            this.fireError(this.failure);
            this.fireClose();
        }
    }

    close(): void {
        this.fireClose();
    }

    dispose(): void {
        this.queued.length = 0;
        this.queuedBytes = 0;
        super.dispose();
    }
}

class WorkerMessageWriter extends AbstractMessageWriter {
    constructor(private readonly transport: WorkerRpcTransport) {
        super();
    }

    async write(message: Message): Promise<void> {
        try {
            await this.transport.send(message);
        } catch (error) {
            this.fireError(error, message);
            throw error;
        }
    }

    end(): void {
        this.fireClose();
    }
}

export interface WorkerRpcConnection {
    readonly connection: MessageConnection;
    listen(): void;
    dispose(): void;
}

export function createWorkerRpcConnection(transport: WorkerRpcTransport): WorkerRpcConnection {
    const reader = new WorkerMessageReader();
    const writer = new WorkerMessageWriter(transport);
    const connection = createMessageConnection(reader, writer);
    connection.listen();
    let disposed = false;
    let listening = false;
    let unsubscribeMessage = (): void => undefined;
    let unsubscribeExit = (): void => undefined;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        unsubscribeMessage();
        unsubscribeExit();
        reader.close();
        writer.end();
        connection.dispose();
    };
    unsubscribeMessage = transport.onMessage((message) => {
        if (!disposed) reader.accept(message);
    });
    unsubscribeExit = transport.onExit(dispose);

    return {
        connection,
        listen: () => {
            if (disposed) throw new Error("Worker RPC connection is closed");
            if (listening) return;
            listening = true;
            reader.listenReady();
        },
        dispose,
    };
}
