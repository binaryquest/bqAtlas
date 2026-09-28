using System.ComponentModel.DataAnnotations;
using System.Text;
using BqAtlas.Core;
using BqAtlas.EntityFrameworkCore;
using BqAtlas.Sample.Crm.Contracts;
using Microsoft.EntityFrameworkCore;
namespace BqAtlas.Sample.Crm;

public static class CrmPermissions
{
    public const string Lookup = CustomerAccess.Lookup;
    public const string Read = "crm.customers.read";
    public const string Write = "crm.customers.write";
    public const string Delete = "crm.customers.delete";
    public static readonly string[] All = [Read, Write, Delete, Lookup];
}
public sealed record CustomerInput(string Code, string Name, string? Email, bool Active = true);
public sealed record CustomerDto(Guid Id, string Code, string Name, string? Email, bool Active, DateTimeOffset ModifiedAt)
{
    public CustomerDto() : this(Guid.Empty, "", "", null, false, default) { }
}
public sealed class Customer
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public bool Active { get; set; } = true;
    public string SearchName { get; set; } = "";
    public string Version { get; set; } = VersionToken.New();
    public DateTimeOffset ModifiedAt { get; set; }
    public string ModifiedBy { get; set; } = "";
    public CustomerDto ToDto() => new(Id, Code, Name, Email, Active, ModifiedAt);
}
public sealed class CrmDbContext(DbContextOptions<CrmDbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("crm");
        var customer = model.Entity<Customer>();
        customer.HasKey(c => c.Id);
        customer.Property(c => c.Code).HasMaxLength(32).IsRequired();
        customer.HasIndex(c => c.Code).IsUnique();
        customer.Property(c => c.Name).HasMaxLength(200).IsRequired();
        customer.Property(c => c.SearchName).HasMaxLength(400).IsRequired();
        customer.Property(c => c.Email).HasMaxLength(254);
        customer.Property(c => c.Version).HasMaxLength(32).IsConcurrencyToken();
        customer.Property(c => c.ModifiedBy).HasMaxLength(256);
        if (Database.ProviderName == "Microsoft.EntityFrameworkCore.SqlServer")
        {
            customer.Property(c => c.SearchName).UseCollation("Latin1_General_100_BIN2");
            customer.Property(c => c.Code).UseCollation("Latin1_General_100_BIN2");
        }
    }
}
public static class CustomerRules
{
    public static string SearchKey(string value) => value.Normalize(NormalizationForm.FormC).ToUpperInvariant();
    public static CustomerInput Validate(CustomerInput input)
    {
        var errors = new Dictionary<string, string[]>();
        var code = (input.Code ?? "").Trim().ToUpperInvariant();
        var name = (input.Name ?? "").Trim();
        var email = string.IsNullOrWhiteSpace(input.Email) ? null : input.Email.Trim();
        if (code.Length is < 1 or > 32 || code.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-')) errors["code"] = ["Use 1–32 letters, digits or hyphens."];
        if (name.Length is < 1 or > 200) errors["name"] = ["A name of 1–200 characters is required."];
        if (email is not null && (email.Length > 254 || !new EmailAddressAttribute().IsValid(email))) errors["email"] = ["Enter a valid email address."];
        if (errors.Count > 0) throw new ResourceValidationException(errors);
        return input with { Code = code, Name = name, Email = email };
    }
}
public sealed class CustomerDirectory(CrmDbContext db) : ICustomerDirectory
{
    public Task<CustomerSummary?> FindAsync(Guid id, CancellationToken cancellationToken = default) => db.Customers.AsNoTracking().Where(c => c.Id == id).Select(c => new CustomerSummary(c.Id, c.Code, c.Name, c.Active)).SingleOrDefaultAsync(cancellationToken);
}
public sealed class CustomerService(CrmDbContext db)
{
    public Task<CustomerSummary?> ResolveLookupAsync(Guid id, CancellationToken ct) => db.Customers.AsNoTracking()
        .Where(c => c.Id == id && c.Active).Select(c => new CustomerSummary(c.Id, c.Code, c.Name, c.Active)).SingleOrDefaultAsync(ct);
    public async Task<PageResult<CustomerSummary>> LookupAsync(QueryRequest request, CancellationToken ct)
    {
        QueryRules.Validate(request, new HashSet<string>());
        var search = CustomerRules.SearchKey(request.Search.Trim());
        var query = db.Customers.AsNoTracking().Where(c => c.Active);
        if (search.Length > 0) query = query.Where(c => c.Code.Contains(search) || c.SearchName.Contains(search));
        var total = await query.LongCountAsync(ct);
        var items = await query.OrderBy(c => c.Code).ThenBy(c => c.Id).Skip(request.Page * request.PageSize).Take(request.PageSize)
            .Select(c => new CustomerSummary(c.Id, c.Code, c.Name, c.Active)).ToListAsync(ct);
        return new(items, total, request.Page, request.PageSize);
    }
    private static readonly HashSet<string> Fields = ["code", "name", "email", "active"];
    public async Task<PageResult<CustomerDto>> QueryAsync(QueryRequest request, CancellationToken ct)
    {
        QueryRules.Validate(request, Fields);
        var q = db.Customers.AsNoTracking();
        var search = CustomerRules.SearchKey(request.Search.Trim());
        if (search.Length > 0) q = q.Where(c => c.SearchName.Contains(search) || c.Code.Contains(search));
        foreach (var filter in request.Filters ?? [])
        {
            if (filter.Field == "active")
            {
                if (filter.Operator != "eq" || !bool.TryParse(filter.Value, out var active)) throw new ResourceValidationException(new Dictionary<string, string[]> { ["filters"] = ["Active accepts eq true or false."] });
                q = q.Where(c => c.Active == active);
            }
            else
            {
                var field = filter.Field;
                var value = field == "email" ? filter.Value : CustomerRules.SearchKey(filter.Value);
                q = filter.Operator switch
                {
                    "contains" => q.Where(c => (field == "code" ? c.Code : field == "name" ? c.SearchName : c.Email ?? "").Contains(value)),
                    "startsWith" => q.Where(c => (field == "code" ? c.Code : field == "name" ? c.SearchName : c.Email ?? "").StartsWith(value)),
                    _ => q.Where(c => (field == "code" ? c.Code : field == "name" ? c.SearchName : c.Email ?? "") == value)
                };
            }
        }
        var total = await q.LongCountAsync(ct);
        IOrderedQueryable<Customer>? ordered = null;
        foreach (var sort in request.Sort ?? [])
        {
            System.Linq.Expressions.Expression<Func<Customer, object>> key = sort.Field switch { "code" => c => c.Code, "name" => c => c.Name, "email" => c => c.Email!, _ => c => c.Active };
            ordered = ordered is null ? (sort.Direction == "asc" ? q.OrderBy(key) : q.OrderByDescending(key)) : (sort.Direction == "asc" ? ordered.ThenBy(key) : ordered.ThenByDescending(key));
        }
        var page = (ordered ?? q.OrderBy(c => c.Code)).ThenBy(c => c.Id).Skip(request.Page * request.PageSize).Take(request.PageSize);
        var rows = await page.Select(c => new CustomerDto(c.Id, c.Code, c.Name, c.Email, c.Active, c.ModifiedAt)).ToListAsync(ct);
        return new(rows, total, request.Page, request.PageSize);
    }
    public async Task<RecordResult<CustomerDto>?> GetAsync(Guid id, CancellationToken ct) => await db.Customers.AsNoTracking().SingleOrDefaultAsync(c => c.Id == id, ct) is { } row ? new(row.ToDto(), row.Version) : null;
    public async Task<RecordResult<CustomerDto>?> SaveAsync(Guid? id, CustomerInput input, string? expectedVersion, string actor, CancellationToken ct)
    {
        var value = CustomerRules.Validate(input);
        var row = id is null ? new Customer { Id = Guid.NewGuid() } : await db.Customers.SingleOrDefaultAsync(c => c.Id == id, ct);
        if (row is null) return null;
        if (id is not null && !VersionToken.Matches(expectedVersion, row.Version)) throw new VersionConflictException();
        if (await db.Customers.AnyAsync(c => c.Code == value.Code && c.Id != row.Id, ct)) throw new ResourceValidationException(new Dictionary<string, string[]> { ["code"] = ["This customer code already exists."] });
        row.Code = value.Code; row.Name = value.Name; row.Email = value.Email; row.Active = value.Active;
        row.SearchName = CustomerRules.SearchKey(value.Name); row.Version = VersionToken.New(); row.ModifiedAt = DatabaseTimestamp.UtcNow; row.ModifiedBy = actor;
        if (id is null) db.Customers.Add(row);
        await db.SaveWithConcurrencyAsync(ct);
        return new(row.ToDto(), row.Version);
    }
    public async Task<bool> DeleteAsync(Guid id, string? expectedVersion, CancellationToken ct)
    {
        var row = await db.Customers.SingleOrDefaultAsync(c => c.Id == id, ct);
        if (row is null) return false;
        if (!VersionToken.Matches(expectedVersion, row.Version)) throw new VersionConflictException();
        db.Customers.Remove(row); await db.SaveWithConcurrencyAsync(ct); return true;
    }
}
