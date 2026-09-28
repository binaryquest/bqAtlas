using System.Globalization;
using System.Text.Json.Serialization;
using BqAtlas.Core;
using Microsoft.EntityFrameworkCore;
namespace BqAtlas.Sample.Engagement;

public abstract class EngagementRecord
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public DateTimeOffset ModifiedAt { get; set; }
    [JsonIgnore] public string SearchName { get; set; } = "";
    [JsonIgnore] public string Version { get; set; } = VersionToken.New();
    [JsonIgnore] public string ModifiedBy { get; set; } = "";
}
public sealed class Product : EngagementRecord
{
    public string Code { get; set; } = "";
    public string Category { get; set; } = "Service";
    public string UnitPrice { get; set; } = "0";
    public string Currency { get; set; } = "USD";
    public bool Active { get; set; } = true;
}
public sealed class Opportunity : EngagementRecord
{
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public string Stage { get; set; } = "Lead";
    public string Amount { get; set; } = "0";
    public string Currency { get; set; } = "USD";
    public DateOnly ExpectedClose { get; set; }
    public string Owner { get; set; } = "";
    public string Notes { get; set; } = "";
}
public sealed class Activity : EngagementRecord
{
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public DateOnly DueDate { get; set; }
    public string Kind { get; set; } = "Call";
    public string Status { get; set; } = "Planned";
    public string Owner { get; set; } = "";
    public string Notes { get; set; } = "";
}
public sealed record ProductInput(string Name, string Code, string Category, string UnitPrice, string Currency, bool Active);
public sealed record OpportunityInput(string Name, Guid CustomerId, string Stage, string Amount, string Currency, DateOnly ExpectedClose, string Owner, string Notes);
public sealed record ActivityInput(string Name, Guid CustomerId, DateOnly DueDate, string Kind, string Status, string Owner, string Notes);
public static class EngagementRules
{
    public static string Text(string? value, string field, int max, bool required = true)
    {
        var text = (value ?? "").Trim();
        if ((required && text.Length == 0) || text.Length > max) Fail(field, $"Use {(required ? "1" : "0")}–{max} characters.");
        return text;
    }
    public static string Choice(string? value, string field, params string[] options)
    {
        if (value is null || !options.Contains(value)) Fail(field, "Choose one of the listed values.");
        return value!;
    }
    public static string Money(string? value, string field, int scale)
    {
        if (value is null || !System.Text.RegularExpressions.Regex.IsMatch(value, @"^\d+(\.\d{1," + scale + @"})?$") || !decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var amount) || amount > 1000000000m) Fail(field, $"Enter an amount from 0 to 1000000000 with up to {scale} decimal places.");
        return decimal.Parse(value!, CultureInfo.InvariantCulture).ToString("F" + scale, CultureInfo.InvariantCulture);
    }
    public static DateOnly Date(DateOnly value, string field)
    {
        if (value.Year < 1900) Fail(field, "Choose a date from 1900 onwards.");
        return value;
    }
    public static void Fail(string field, string message) => throw new ResourceValidationException(new Dictionary<string,string[]> { [field] = [message] });
    public static void Apply(ProductInput input, Product row)
    {
        row.Name = Text(input.Name, "name", 200); row.Code = Text(input.Code, "code", 32).ToUpperInvariant();
        if (row.Code.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-')) Fail("code", "Use letters, digits and hyphens.");
        row.Category = Choice(input.Category, "category", "Stock", "Service"); row.UnitPrice = Money(input.UnitPrice, "unitPrice", 4);
        row.Currency = Choice(input.Currency, "currency", "USD", "EUR", "BDT"); row.Active = input.Active;
    }
    public static void Apply(OpportunityInput input, Opportunity row)
    {
        row.Name = Text(input.Name, "name", 200); row.CustomerId = input.CustomerId;
        row.Stage = Choice(input.Stage, "stage", "Lead", "Qualified", "Proposal", "Won", "Lost");
        row.Amount = Money(input.Amount, "amount", 2); row.Currency = Choice(input.Currency, "currency", "USD", "EUR", "BDT");
        row.ExpectedClose = Date(input.ExpectedClose, "expectedClose"); row.Owner = Text(input.Owner, "owner", 100); row.Notes = Text(input.Notes, "notes", 2000, false);
    }
    public static void Apply(ActivityInput input, Activity row)
    {
        row.Name = Text(input.Name, "name", 200); row.CustomerId = input.CustomerId; row.DueDate = Date(input.DueDate, "dueDate");
        row.Kind = Choice(input.Kind, "kind", "Call", "Email", "Meeting", "Task"); row.Status = Choice(input.Status, "status", "Planned", "Done", "Cancelled");
        row.Owner = Text(input.Owner, "owner", 100); row.Notes = Text(input.Notes, "notes", 2000, false);
    }
}
public sealed class EngagementDbContext(DbContextOptions<EngagementDbContext> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Opportunity> Opportunities => Set<Opportunity>();
    public DbSet<Activity> Activities => Set<Activity>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("engagement");
        Configure<Product>(model); Configure<Opportunity>(model); Configure<Activity>(model);
        model.Entity<Product>().HasIndex(x => x.Code).IsUnique();
        model.Entity<Product>().Property(x => x.Code).HasMaxLength(32);
        model.Entity<Product>().Property(x => x.UnitPrice).HasMaxLength(32);
        model.Entity<Opportunity>().Property(x => x.Amount).HasMaxLength(32);
        model.Entity<Opportunity>().HasIndex(x => x.CustomerId); model.Entity<Activity>().HasIndex(x => x.CustomerId);
        // Customer IDs are validated through the CRM contract; modules do not share tables.
    }
    static void Configure<T>(ModelBuilder model) where T : EngagementRecord
    {
        var entity = model.Entity<T>(); entity.HasBaseType((Type?)null); entity.HasKey(x => x.Id);
        entity.Property(x => x.Name).HasMaxLength(200); entity.Property(x => x.SearchName).HasMaxLength(600);
        entity.Property(x => x.Version).HasMaxLength(32).IsConcurrencyToken(); entity.Property(x => x.ModifiedBy).HasMaxLength(256);
        foreach(var property in typeof(T).GetProperties().Where(p => p.PropertyType == typeof(string) && !new[]{"Name","SearchName","Version","ModifiedBy"}.Contains(p.Name))) entity.Property(property.Name).HasMaxLength(property.Name == "Notes" ? 2000 : property.Name == "CustomerName" ? 200 : 100);
    }
}
