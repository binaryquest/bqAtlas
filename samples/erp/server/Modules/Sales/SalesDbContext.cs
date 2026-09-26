using BqAtlas.Core;
using BqAtlas.Sample.Sales.Contracts;
using Microsoft.EntityFrameworkCore;
namespace BqAtlas.Sample.Sales;

public sealed class Quote
{
    public Guid Id { get; set; }
    public string Number { get; set; } = "";
    public Guid CustomerId { get; set; }
    public string CustomerCode { get; set; } = "";
    public string CustomerName { get; set; } = "";
    public DateOnly Date { get; set; }
    public string Currency { get; set; } = "USD";
    public string Status { get; set; } = "draft";
    public List<QuoteLine> Lines { get; set; } = [];
    public decimal Total { get; set; }
    public string Version { get; set; } = VersionToken.New();
    public string ModifiedBy { get; set; } = "";
    public DateTimeOffset ModifiedAt { get; set; }
    public DateTimeOffset? SubmittedAt { get; set; }
    public QuoteDto ToDto() => new(Id, Number, CustomerId, CustomerCode, CustomerName, Date, Currency, Status,
        Lines.OrderBy(l => l.Position).Select(l => new QuoteLineDto(l.Id, l.Description, DecimalText.Format(l.Quantity, 3), DecimalText.Format(l.UnitPrice, 4), DecimalText.Money(l.Total))).ToArray(),
        DecimalText.Money(Total), ModifiedAt, SubmittedAt);
}
public sealed class QuoteLine
{
    public Guid QuoteId { get; set; }
    public Guid Id { get; set; }
    public int Position { get; set; }
    public string Description { get; set; } = "";
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Total { get; set; }
}
/// <summary>Business audit entries contain identifiers and state transitions, never input payloads.</summary>
public sealed class QuoteOperation
{
    public Guid Id { get; set; }
    public Guid QuoteId { get; set; }
    public string Operation { get; set; } = "";
    public string Actor { get; set; } = "";
    public DateTimeOffset OccurredAt { get; set; }
    public string Version { get; set; } = "";
}
public sealed class QuoteSubmission
{
    public Guid QuoteId { get; set; }
    public string Actor { get; set; } = "";
    public string Key { get; set; } = "";
    public string Version { get; set; } = "";
}
public sealed class SalesDbContext(DbContextOptions<SalesDbContext> options) : DbContext(options)
{
    public DbSet<Quote> Quotes => Set<Quote>();
    public DbSet<QuoteOperation> Operations => Set<QuoteOperation>();
    public DbSet<QuoteSubmission> Submissions => Set<QuoteSubmission>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("sales");
        var quote = model.Entity<Quote>();
        quote.HasKey(q => q.Id);
        quote.Property(q => q.Number).HasMaxLength(40); quote.HasIndex(q => q.Number).IsUnique();
        quote.Property(q => q.CustomerCode).HasMaxLength(32); quote.Property(q => q.CustomerName).HasMaxLength(200);
        quote.Property(q => q.Currency).HasMaxLength(3); quote.Property(q => q.Status).HasMaxLength(16);
        quote.Property(q => q.Total).HasPrecision(20, 2);
        quote.Property(q => q.Version).HasMaxLength(32).IsConcurrencyToken();
        quote.Property(q => q.ModifiedBy).HasMaxLength(256);
        quote.HasMany(q => q.Lines).WithOne().HasForeignKey(l => l.QuoteId).OnDelete(DeleteBehavior.Cascade);
        var line = model.Entity<QuoteLine>();
        line.HasKey(l => new { l.QuoteId, l.Id });
        line.Property(l => l.Description).HasMaxLength(200);
        line.Property(l => l.Quantity).HasPrecision(12, 3); line.Property(l => l.UnitPrice).HasPrecision(16, 4); line.Property(l => l.Total).HasPrecision(20, 2);
        var operation = model.Entity<QuoteOperation>();
        operation.HasKey(o => o.Id); operation.HasIndex(o => o.QuoteId);
        operation.Property(o => o.Operation).HasMaxLength(32); operation.Property(o => o.Actor).HasMaxLength(256); operation.Property(o => o.Version).HasMaxLength(32);
        // Deliberately no cascading foreign key: delete audit evidence survives a draft deletion.
        var submission = model.Entity<QuoteSubmission>();
        submission.HasKey(s => new { s.QuoteId, s.Actor, s.Key });
        submission.Property(s => s.Actor).HasMaxLength(256); submission.Property(s => s.Key).HasMaxLength(32); submission.Property(s => s.Version).HasMaxLength(32);
    }
}
