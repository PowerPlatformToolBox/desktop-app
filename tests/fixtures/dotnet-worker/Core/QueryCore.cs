using MarkMpn.Sql4Cds.Engine;
using Microsoft.Xrm.Sdk;

namespace CompatibilityProbe.Core;

public static class QueryCore
{
    public static string Execute(string sql, IOrganizationService service, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var connection = new Sql4CdsConnection(new Dictionary<string, DataSource>
        {
            ["fixture"] = new DataSource { Name = "fixture", Connection = service },
        });
        cancellationToken.ThrowIfCancellationRequested();
        connection.UseTDSEndpoint = false;
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        using var registration = cancellationToken.Register(command.Cancel);
        using var reader = command.ExecuteReader();
        if (!reader.Read()) throw new InvalidOperationException("The probe query returned no rows.");
        cancellationToken.ThrowIfCancellationRequested();
        return reader.GetValue(0).ToString() ?? "";
    }
}