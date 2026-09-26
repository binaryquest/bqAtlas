namespace BqAtlas.Sample.Sales.Contracts;

public sealed record QuoteLineInput(Guid Id, string Description, string Quantity, string UnitPrice);
public sealed record QuoteInput(Guid CustomerId, DateOnly Date, string Currency, IReadOnlyList<QuoteLineInput> Lines);
public sealed record QuoteLineDto(Guid Id, string Description, string Quantity, string UnitPrice, string Total);
public sealed record QuoteDto(Guid Id, string Number, Guid CustomerId, string CustomerCode, string CustomerName,
    DateOnly Date, string Currency, string Status, IReadOnlyList<QuoteLineDto> Lines, string Total,
    DateTimeOffset ModifiedAt, DateTimeOffset? SubmittedAt);
public sealed record QuoteSummary(Guid Id, string Number, string CustomerName, DateOnly Date, string Currency, string Status, string Total);
