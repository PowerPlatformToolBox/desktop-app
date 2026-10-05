using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using StreamJsonRpc;

namespace CompatibilityProbe.Worker;

public sealed class CallbackOrganizationService(JsonRpc rpc, CancellationToken cancellationToken) : IOrganizationService
{
    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        if (query is not QueryExpression { EntityName: "organization" } organizationQuery ||
            organizationQuery.ColumnSet.AllColumns ||
            organizationQuery.ColumnSet.Columns.Any(column => column != "localeid"))
            throw new NotSupportedException("PR0 only adapts the engine's organization-locale lookup.");

        var response = rpc.InvokeWithCancellationAsync<OrganizationResult>(
            "dataverse/fetchXml",
            new object[] { "<fetch><entity name=\"organization\"><attribute name=\"localeid\" /></entity></fetch>" },
            cancellationToken).GetAwaiter().GetResult();
        var entities = response.Entities.Select(row => new Entity("organization") { ["localeid"] = row.LocaleId });
        return new EntityCollection(entities.ToList());
    }

    public Guid Create(Entity entity) => throw Unsupported();
    public void Update(Entity entity) => throw Unsupported();
    public void Delete(string entityName, Guid id) => throw Unsupported();
    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw Unsupported();
    public OrganizationResponse Execute(OrganizationRequest request) => throw Unsupported();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw Unsupported();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw Unsupported();

    private static NotSupportedException Unsupported() => new("PR0 does not implement a general Dataverse SDK proxy.");
}

public sealed record OrganizationRow(int LocaleId);
public sealed record OrganizationResult(OrganizationRow[] Entities);