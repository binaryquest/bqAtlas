using BqAtlas.Core;
using BqAtlas.EntityFrameworkCore;
using BqAtlas.Sample.Crm.Contracts;
using BqAtlas.Sample.Sales.Contracts;
using Microsoft.EntityFrameworkCore;
namespace BqAtlas.Sample.Sales;

public sealed class QuoteService(SalesDbContext db, ICustomerDirectory customers)
{
    private static readonly HashSet<string> QueryFields = ["number", "date", "status", "customerName"];
    public async Task<PageResult<QuoteSummary>> QueryAsync(QueryRequest request, CancellationToken ct)
    {
        QueryRules.Validate(request, QueryFields);
        if (request.Filters?.Count > 0) throw new ResourceValidationException(new Dictionary<string, string[]> { ["filters"] = ["Use search and sorting for the quote list."] });
        var query = db.Quotes.AsNoTracking();
        var search = request.Search.Trim().ToUpperInvariant();
        if (search.Length > 0) query = query.Where(q => q.Number.Contains(search) || q.CustomerName.ToUpper().Contains(search));
        var total = await query.LongCountAsync(ct);
        IOrderedQueryable<Quote>? ordered = null;
        foreach (var sort in request.Sort ?? [])
        {
            System.Linq.Expressions.Expression<Func<Quote, object>> key = sort.Field switch { "number" => q => q.Number, "status" => q => q.Status, "customerName" => q => q.CustomerName, _ => q => q.Date };
            ordered = ordered is null ? (sort.Direction == "asc" ? query.OrderBy(key) : query.OrderByDescending(key)) : (sort.Direction == "asc" ? ordered.ThenBy(key) : ordered.ThenByDescending(key));
        }
        var rows = await (ordered ?? query.OrderByDescending(q => q.Date)).ThenBy(q => q.Id).Skip(request.Page * request.PageSize).Take(request.PageSize).ToListAsync(ct);
        return new(rows.Select(q => new QuoteSummary(q.Id, q.Number, q.CustomerName, q.Date, q.Currency, q.Status, DecimalText.Money(q.Total))).ToArray(), total, request.Page, request.PageSize);
    }
    public async Task<RecordResult<QuoteDto>?> GetAsync(Guid id, CancellationToken ct) =>
        await db.Quotes.AsNoTracking().Include(q => q.Lines).SingleOrDefaultAsync(q => q.Id == id, ct) is { } quote ? Envelope(quote) : null;
    public async Task<RecordResult<QuoteDto>?> SaveAsync(Guid? id, QuoteInput input, string? expectedVersion, string actor, CancellationToken ct)
    {
        var value = QuoteRules.Validate(input);
        var customer = await customers.FindAsync(value.CustomerId, ct);
        if (customer is null || !customer.Active) throw new ResourceValidationException(new Dictionary<string, string[]> { ["customerId"] = ["Choose an active customer."] });
        var quote = id is null ? new Quote { Id = Guid.NewGuid() } : await db.Quotes.Include(q => q.Lines).SingleOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return null;
        if (id is not null && !VersionToken.Matches(expectedVersion, quote.Version)) throw new VersionConflictException();
        if (quote.Status != "draft") throw new BusinessConflictException("A submitted quote cannot be edited.", "quote_immutable");
        quote.CustomerId = customer.Id; quote.CustomerCode = customer.Code; quote.CustomerName = customer.Name;
        quote.Date = value.Date; quote.Currency = value.Currency; quote.Total = value.Total;
        var removed = quote.Lines.Where(l => value.Lines.All(v => v.Id != l.Id)).ToArray();
        foreach (var line in removed) { quote.Lines.Remove(line); db.Remove(line); }
        foreach (var (line, index) in value.Lines.Select((line, index) => (line, index)))
        {
            var entity = quote.Lines.SingleOrDefault(l => l.Id == line.Id);
            if (entity is null) { entity = new QuoteLine { QuoteId = quote.Id, Id = line.Id }; quote.Lines.Add(entity); }
            entity.Position = index; entity.Description = line.Description; entity.Quantity = line.Quantity; entity.UnitPrice = line.UnitPrice; entity.Total = line.Total;
        }
        if (id is null) { quote.Number = "Q-" + quote.Id.ToString("N").ToUpperInvariant(); db.Quotes.Add(quote); }
        Stamp(quote, actor, id is null ? "created" : "edited");
        // Header, complete line set, version and audit entry commit in one EF transaction.
        await db.SaveWithConcurrencyAsync(ct);
        return Envelope(quote);
    }
    public async Task<bool> DeleteAsync(Guid id, string? expectedVersion, string actor, CancellationToken ct)
    {
        var quote = await db.Quotes.SingleOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return false;
        if (!VersionToken.Matches(expectedVersion, quote.Version)) throw new VersionConflictException();
        if (quote.Status != "draft") throw new BusinessConflictException("A submitted quote cannot be deleted.", "quote_immutable");
        Stamp(quote, actor, "deleted"); db.Quotes.Remove(quote); await db.SaveWithConcurrencyAsync(ct); return true;
    }
    public async Task<RecordResult<QuoteDto>?> SubmitAsync(Guid id, string? expectedVersion, string? key, string actor, CancellationToken ct)
    {
        if (!Guid.TryParseExact(key, "D", out var parsedKey) && !Guid.TryParseExact(key, "N", out parsedKey))
            throw new ResourceValidationException(new Dictionary<string, string[]> { ["idempotencyKey"] = ["Idempotency-Key must be a UUID."] });
        var token = parsedKey.ToString("N");
        if (await IsReplay(id, actor, token, ct)) return await GetAsync(id, ct);
        var quote = await db.Quotes.Include(q => q.Lines).SingleOrDefaultAsync(q => q.Id == id, ct);
        if (quote is null) return null;
        if (!VersionToken.Matches(expectedVersion, quote.Version))
        {
            // The first replay read and aggregate read are separate statements. A matching
            // submission can commit between them; resolve its result before rejecting the version.
            if (await IsReplay(id, actor, token, ct)) return await GetAsync(id, ct);
            throw new VersionConflictException();
        }
        if (quote.Status != "draft") throw new BusinessConflictException("This quote has already been submitted.", "quote_already_submitted");
        var customer = await customers.FindAsync(quote.CustomerId, ct);
        if (customer is null || !customer.Active) throw new BusinessConflictException("The customer is no longer active. Choose an active customer before submitting.", "customer_unavailable");
        quote.Status = "submitted"; quote.SubmittedAt = DateTimeOffset.UtcNow;
        Stamp(quote, actor, "submitted");
        db.Submissions.Add(new QuoteSubmission { QuoteId = id, Actor = actor, Key = token, Version = quote.Version });
        try { await db.SaveWithConcurrencyAsync(ct); }
        catch (Exception error) when (error is VersionConflictException or DbUpdateException)
        {
            // Another request using this key may have committed while we were awaiting the database.
            db.ChangeTracker.Clear();
            if (await IsReplay(id, actor, token, ct)) return await GetAsync(id, ct);
            throw;
        }
        return Envelope(quote);
    }
    private Task<bool> IsReplay(Guid id, string actor, string key, CancellationToken ct) => db.Submissions.AsNoTracking().AnyAsync(s => s.QuoteId == id && s.Actor == actor && s.Key == key, ct);
    private static RecordResult<QuoteDto> Envelope(Quote quote) => new(quote.ToDto(), quote.Version);
    private void Stamp(Quote quote, string actor, string operation)
    {
        quote.Version = VersionToken.New(); quote.ModifiedAt = DateTimeOffset.UtcNow; quote.ModifiedBy = actor;
        db.Operations.Add(new QuoteOperation { Id = Guid.NewGuid(), QuoteId = quote.Id, Operation = operation, Actor = actor, OccurredAt = quote.ModifiedAt, Version = quote.Version });
    }
}
