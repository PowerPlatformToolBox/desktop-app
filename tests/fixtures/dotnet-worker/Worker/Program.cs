using CompatibilityProbe.Worker;
using StreamJsonRpc;

using var handler = new HeaderDelimitedMessageHandler(Console.OpenStandardOutput(), Console.OpenStandardInput());
using var rpc = new JsonRpc(handler);
rpc.AddLocalRpcTarget(new WorkerMethods(rpc));
rpc.StartListening();
Console.Error.WriteLine("Compatibility worker listening; stdout is reserved for JSON-RPC.");
await rpc.Completion;