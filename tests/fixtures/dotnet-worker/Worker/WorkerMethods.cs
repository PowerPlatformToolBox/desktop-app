using CompatibilityProbe.Core;
using StreamJsonRpc;

namespace CompatibilityProbe.Worker;

public sealed class WorkerMethods(JsonRpc rpc)
{
    [JsonRpcMethod("ping")]
    public string Ping() => "pong";

    [JsonRpcMethod("query")]
    public async Task<string> QueryAsync(string sql, CancellationToken cancellationToken)
    {
        await rpc.NotifyAsync("progress", "starting");
        var result = await Task.Run(
            () => QueryCore.Execute(sql, new CallbackOrganizationService(rpc, cancellationToken), cancellationToken),
            cancellationToken);
        await rpc.NotifyAsync("progress", "completed");
        return result;
    }
}