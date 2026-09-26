using BqAtlas.Core;
using BqAtlas.Sample.Sales.Contracts;
namespace BqAtlas.Sample.Sales;

public sealed record ValidatedLine(Guid Id, string Description, decimal Quantity, decimal UnitPrice, decimal Total);
public sealed record ValidatedQuote(Guid CustomerId, DateOnly Date, string Currency, IReadOnlyList<ValidatedLine> Lines, decimal Total);
public static class QuoteRules
{
    public static readonly string[] Currencies = ["USD", "EUR", "BDT"];
    public static ValidatedQuote Validate(QuoteInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (input.CustomerId == Guid.Empty) errors["customerId"] = ["Choose a customer."];
        if (input.Date.Year < 1900) errors["date"] = ["Choose a date from 1900 onwards."];
        var currency = (input.Currency ?? "").Trim().ToUpperInvariant();
        if (!Currencies.Contains(currency, StringComparer.Ordinal)) errors["currency"] = ["Choose USD, EUR or BDT."];
        if (input.Lines is null || input.Lines.Count is < 1 or > 100) errors["lines"] = ["A quote needs between 1 and 100 lines."];
        var lines = new List<ValidatedLine>();
        var ids = new HashSet<Guid>();
        foreach (var (line, index) in (input.Lines ?? []).Take(100).Select((line, index) => (line, index)))
        {
            var prefix = $"lines[{index}]";
            if (line is null) { errors[prefix] = ["A line is required."]; continue; }
            if (line.Id == Guid.Empty || !ids.Add(line.Id)) errors[prefix + ".id"] = ["Each line needs a unique nonempty ID."];
            var description = (line.Description ?? "").Trim();
            if (description.Length is < 1 or > 200) errors[prefix + ".description"] = ["Use a description of 1–200 characters."];
            if (!DecimalText.TryParse(line.Quantity, 3, 1000000m, out var quantity) || quantity <= 0)
                errors[prefix + ".quantity"] = ["Use a positive decimal up to 1000000 with at most 3 decimal places."];
            if (!DecimalText.TryParse(line.UnitPrice, 4, 1000000000m, out var price))
                errors[prefix + ".unitPrice"] = ["Use a decimal from 0 to 1000000000 with at most 4 decimal places."];
            // Round each line independently, then sum the rounded lines. Never round a binary float.
            var total = Math.Round(quantity * price, 2, MidpointRounding.AwayFromZero);
            lines.Add(new(line.Id, description, quantity, price, total));
        }
        if (errors.Count > 0) throw new ResourceValidationException(errors);
        return new(input.CustomerId, input.Date, currency, lines, lines.Sum(l => l.Total));
    }
}
