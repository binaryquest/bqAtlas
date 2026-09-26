using System.Security.Claims;
using BqAtlas.Core;
using BqAtlas.Sample.Sales;
using BqAtlas.Sample.Sales.Contracts;
using Xunit;
namespace BqAtlas.Tests;

public class QuoteTests
{
    private static QuoteInput Input(params QuoteLineInput[] lines) => new(Guid.NewGuid(), new(2026, 9, 25), "USD", lines);
    private static QuoteLineInput Line(string quantity = "1", string price = "0.005") => new(Guid.NewGuid(), "Example", quantity, price);
    [Fact]
    public void SharedPortableFixturesMatchServerTotals()
    {
        using var fixtures = System.Text.Json.JsonDocument.Parse(File.ReadAllText(System.IO.Path.Combine(AppContext.BaseDirectory, "Fixtures/quote-totals.json")));
        foreach (var fixture in fixtures.RootElement.EnumerateArray())
        {
            var input = Input(fixture.GetProperty("lines").EnumerateArray().Select(l => Line(l.GetProperty("quantity").GetString()!, l.GetProperty("unitPrice").GetString()!)).ToArray());
            var result = QuoteRules.Validate(input);
            Assert.Equal(fixture.GetProperty("total").GetString(), DecimalText.Money(result.Total));
            Assert.Equal(fixture.GetProperty("lineTotals").EnumerateArray().Select(x => x.GetString()), result.Lines.Select(x => DecimalText.Money(x.Total)));
        }
    }
    [Fact]
    public void MoneyRoundsEachLineAwayFromZeroBeforeSumming()
    {
        var result = QuoteRules.Validate(Input(Line(), Line()));
        Assert.All(result.Lines, l => Assert.Equal(.01m, l.Total)); Assert.Equal(.02m, result.Total);
    }
    [Theory]
    [InlineData("1e2")]
    [InlineData("1,000")]
    [InlineData("01")]
    [InlineData("+1")]
    [InlineData("-1")]
    [InlineData(" 1")]
    [InlineData("1.")]
    [InlineData("1.0001")]
    [InlineData("0")]
    public void InvalidQuantitiesAreFieldErrors(string quantity)
    {
        var error = Assert.Throws<ResourceValidationException>(() => QuoteRules.Validate(Input(Line(quantity)))); Assert.Contains("lines[0].quantity", error.Errors.Keys);
    }
    [Fact]
    public void OutOfRangeDecimalsReturnValidationInsteadOfOverflowing()
    {
        var error = Assert.Throws<ResourceValidationException>(() => QuoteRules.Validate(Input(Line("99999999999999999999999999", "99999999999999999999999999")))); Assert.Contains("lines[0].unitPrice", error.Errors.Keys);
    }
    [Fact]
    public void AmountsBeyondJavascriptSafeIntegerRemainExact()
    {
        var result = QuoteRules.Validate(Input(Enumerable.Range(0, 20).Select(_ => Line("1000000", "1000000000")).ToArray()));
        Assert.Equal("20000000000000000.00", DecimalText.Money(result.Total));
    }
    [Fact]
    public void DuplicateLinesAndUnsupportedCurrencyAreRejected()
    {
        var line = Line(); var error = Assert.Throws<ResourceValidationException>(() => QuoteRules.Validate(Input(line, line) with { Currency = "UNKNOWN" }));
        Assert.Contains("lines[1].id", error.Errors.Keys); Assert.Contains("currency", error.Errors.Keys);
    }
    [Fact]
    public void NoLinesAndTooManyLinesAreRejected()
    {
        Assert.Throws<ResourceValidationException>(() => QuoteRules.Validate(Input()));
        Assert.Throws<ResourceValidationException>(() => QuoteRules.Validate(Input(Enumerable.Range(0, 101).Select(_ => Line()).ToArray())));
    }
    [Fact]
    public void SalesReferencesTheCrmContractNotItsImplementationOrIdentity()
    {
        var references = typeof(SalesModule).Assembly.GetReferencedAssemblies().Select(a => a.Name).ToArray();
        Assert.Contains("Crm.Contracts", references); Assert.DoesNotContain("Crm", references); Assert.DoesNotContain("BqAtlas.Identity", references);
    }
    [Fact]
    public void ExternalActorIdentityIncludesIssuerAndNeverUsesEmailAsAnIdentityKey()
    {
        ClaimsPrincipal User(string issuer) => new(new ClaimsIdentity([new Claim("iss", issuer), new Claim("sub", "same-subject"), new Claim("email", "same@example.test")], "oidc"));
        Assert.NotEqual(Actors.GetId(User("https://issuer-a.example")), Actors.GetId(User("https://issuer-b.example")));
        Assert.Equal(Actors.GetId(User("https://issuer-a.example")), Actors.GetId(User("https://issuer-a.example")));
    }
}
