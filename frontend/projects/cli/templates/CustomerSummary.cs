namespace BqAtlas.Sample.Crm.Contracts;

public sealed record CustomerSummary(Guid Id, string Code, string Name, bool Active);
public interface ICustomerDirectory
{
    Task<CustomerSummary?> FindAsync(Guid id, CancellationToken cancellationToken = default);
}

public static class CustomerAccess { public const string Lookup = "crm.customers.lookup"; }
