using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BqAtlas.Core;
using BqAtlas.Sample.Crm;
using BqAtlas.Sample.Crm.Contracts;
using BqAtlas.Sample.Sales;
using BqAtlas.Sample.Sales.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace BqAtlas.IntegrationTests;

public class SalesTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private const string Path = "/api/v1/sales/quotes";
    private static async Task<CustomerDto> Customer(HttpClient client, bool active = true)
    {
        var response = await client.PostAsJsonAsync("/api/v1/crm/customers", new CustomerInput("Q-" + Guid.NewGuid().ToString("N")[..12], "Quote customer", null, active));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); return (await response.Content.ReadFromJsonAsync<RecordResult<CustomerDto>>())!.Data;
    }
    private static QuoteInput Input(Guid customer, string description = "Work") => new(customer, new(2026, 9, 25), "USD", [new(Guid.NewGuid(), description, "2.125", "12.3456"), new(Guid.NewGuid(), "Rounding", "1", "0.005")]);
    private static async Task<RecordResult<QuoteDto>> Create(HttpClient client, QuoteInput input)
    {
        var response = await client.PostAsJsonAsync(Path, input); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RecordResult<QuoteDto>>())!;
    }
    private static Task<HttpResponseMessage> Update(HttpClient client, Guid id, string version, QuoteInput input)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, Path + "/" + id) { Content = JsonContent.Create(input) }; request.Headers.TryAddWithoutValidation("If-Match", '"' + version + '"'); return client.SendAsync(request);
    }
    private static Task<HttpResponseMessage> Submit(HttpClient client, Guid id, string version, string key)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Path + "/" + id + "/submit"); request.Headers.TryAddWithoutValidation("If-Match", '"' + version + '"'); request.Headers.Add("Idempotency-Key", key); return client.SendAsync(request);
    }
    private static Task<HttpResponseMessage> Delete(HttpClient client, Guid id, string version)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, Path + "/" + id); request.Headers.TryAddWithoutValidation("If-Match", '"' + version + '"'); return client.SendAsync(request);
    }
    [Fact]
    public async Task QuoteWorkflowUsesPreciseAmountsCapabilitiesAndTransactionalAudit()
    {
        using var client = await fixture.Login(); var customer = await Customer(client); var input = Input(customer.Id);
        var first = await Create(client, input);
        Assert.Equal("26.24", first.Data.Total); Assert.Equal("26.23", first.Data.Lines[0].Total); Assert.True(first.Capabilities!.Edit);
        var next = input with { Lines = [input.Lines[0] with { Quantity = "3.125" }] };
        var updated = await Update(client, first.Data.Id, first.Version, next); Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var second = (await updated.Content.ReadFromJsonAsync<RecordResult<QuoteDto>>())!; Assert.Single(second.Data.Lines);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Update(client, first.Data.Id, first.Version, input)).StatusCode);
        var key = Guid.NewGuid().ToString(); var submitted = await Submit(client, first.Data.Id, second.Version, key); Assert.Equal(HttpStatusCode.OK, submitted.StatusCode);
        var final = (await submitted.Content.ReadFromJsonAsync<RecordResult<QuoteDto>>())!; Assert.Equal("submitted", final.Data.Status); Assert.False(final.Capabilities!.Edit); Assert.False(final.Capabilities.Delete); Assert.Empty(final.Capabilities.Commands);
        var replay = await Submit(client, first.Data.Id, second.Version, key); Assert.Equal(HttpStatusCode.OK, replay.StatusCode); Assert.Equal(final.Version, (await replay.Content.ReadFromJsonAsync<RecordResult<QuoteDto>>())!.Version);
        Assert.Equal(HttpStatusCode.Conflict, (await Update(client, first.Data.Id, final.Version, next)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Delete(client, first.Data.Id, final.Version)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Submit(client, first.Data.Id, final.Version, Guid.NewGuid().ToString())).StatusCode);
        var actor = (await client.GetFromJsonAsync<SessionInfo>("/api/v1/session"))!.Id;
        using var scope = fixture.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        var audit = await db.Operations.Where(o => o.QuoteId == first.Data.Id).OrderBy(o => o.OccurredAt).ToListAsync();
        Assert.Equal(["created", "edited", "submitted"], audit.Select(o => o.Operation)); Assert.All(audit, o => Assert.Equal(actor, o.Actor)); Assert.Equal(1, await db.Submissions.CountAsync(s => s.QuoteId == first.Data.Id));
        var draft = await Create(client, input); Assert.Equal(HttpStatusCode.NoContent, (await Delete(client, draft.Data.Id, draft.Version)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Path + "/" + draft.Data.Id)).StatusCode);
        Assert.Contains(await db.Operations.Where(o => o.QuoteId == draft.Data.Id).ToListAsync(), o => o.Operation == "deleted");
    }
    [Fact]
    public async Task ConcurrentSubmitRetriesCommitOneStateTransition()
    {
        using var client = await fixture.Login();
        var customer = await Customer(client);
        // Exercise different scheduling interleavings without consuming extra login attempts.
        for (var attempt = 0; attempt < 12; attempt++)
        {
            var quote = await Create(client, Input(customer.Id)); var key = Guid.NewGuid().ToString();
            var responses = await Task.WhenAll(Submit(client, quote.Data.Id, quote.Version, key), Submit(client, quote.Data.Id, quote.Version, key));
            Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
            var values = await Task.WhenAll(responses.Select(r => r.Content.ReadFromJsonAsync<RecordResult<QuoteDto>>())); Assert.Equal(values[0]!.Version, values[1]!.Version);
            using var scope = fixture.App.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            Assert.Equal(1, await db.Operations.CountAsync(o => o.QuoteId == quote.Data.Id && o.Operation == "submitted")); Assert.Equal(1, await db.Submissions.CountAsync(s => s.QuoteId == quote.Data.Id));
        }
    }
    [Fact]
    public async Task ConcurrentEditsNeverMixHeaderAndLines()
    {
        using var client = await fixture.Login(); var original = Input((await Customer(client)).Id); var quote = await Create(client, original);
        var a = original with { Currency = "EUR", Lines = [new(Guid.NewGuid(), "Winner A", "1", "1")] };
        var b = original with { Currency = "BDT", Lines = [new(Guid.NewGuid(), "Winner B", "2", "2"), new(Guid.NewGuid(), "Only B", "3", "3")] };
        var responses = await Task.WhenAll(Update(client, quote.Data.Id, quote.Version, a), Update(client, quote.Data.Id, quote.Version, b));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(responses, r => r.StatusCode == HttpStatusCode.PreconditionFailed);
        var saved = (await client.GetFromJsonAsync<RecordResult<QuoteDto>>(Path + "/" + quote.Data.Id))!;
        if (saved.Data.Currency == "EUR") { Assert.Single(saved.Data.Lines); Assert.Equal("Winner A", saved.Data.Lines[0].Description); Assert.Equal("1.00", saved.Data.Total); }
        else { Assert.Equal("BDT", saved.Data.Currency); Assert.Equal(2, saved.Data.Lines.Count); Assert.Equal("13.00", saved.Data.Total); }
        using var scope = fixture.App.Services.CreateScope(); Assert.Equal(2, await scope.ServiceProvider.GetRequiredService<SalesDbContext>().Operations.CountAsync(o => o.QuoteId == quote.Data.Id));
    }
    [Fact]
    public async Task ValidationAndPermissionsApplyToCustomCommands()
    {
        using var writer = await fixture.Login(); var customer = await Customer(writer); var input = Input(customer.Id); var quote = await Create(writer, input);
        var bad = input with { Lines = [input.Lines[0] with { UnitPrice = "1e9" }] }; var rejected = await Update(writer, quote.Data.Id, quote.Version, bad); Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("lines[0].unitPrice", await rejected.Content.ReadAsStringAsync());
        Assert.Equal(quote.Version, (await writer.GetFromJsonAsync<RecordResult<QuoteDto>>(Path + "/" + quote.Data.Id))!.Version);
        using var reader = await fixture.Login("reader@test.local"); Assert.Equal(HttpStatusCode.Forbidden, (await reader.PostAsJsonAsync(Path, input)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Submit(reader, quote.Data.Id, quote.Version, Guid.NewGuid().ToString())).StatusCode);
        Assert.False((await reader.GetFromJsonAsync<RecordResult<QuoteDto>>(Path + "/" + quote.Data.Id))!.Capabilities!.Edit);
        using var editor = await fixture.Login("editor@test.local"); Assert.Equal(HttpStatusCode.Forbidden, (await Submit(editor, quote.Data.Id, quote.Version, Guid.NewGuid().ToString())).StatusCode);
        using var salesOnly = await fixture.Login("sales-only@test.local"); Assert.Equal(HttpStatusCode.Forbidden, (await salesOnly.PostAsJsonAsync(Path, input)).StatusCode);
        Assert.False((await salesOnly.GetFromJsonAsync<RecordResult<QuoteDto>>(Path + "/" + quote.Data.Id))!.Capabilities!.Edit);
        writer.DefaultRequestHeaders.Remove("X-BQATLAS-CSRF"); Assert.Equal(HttpStatusCode.BadRequest, (await Submit(writer, quote.Data.Id, quote.Version, Guid.NewGuid().ToString())).StatusCode);
    }
    [Fact]
    public async Task CustomerLookupUsesItsOwnPermissionAndExcludesInactiveCustomers()
    {
        using var writer = await fixture.Login(); var active = await Customer(writer); var inactive = await Customer(writer, false);
        using var lookup = await fixture.Login("lookup@test.local");
        var result = await lookup.PostAsJsonAsync("/api/v1/crm/customers/lookup", new QueryRequest(Search: active.Code, PageSize: 1)); Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        Assert.Equal(active.Id, Assert.Single((await result.Content.ReadFromJsonAsync<PageResult<CustomerSummary>>())!.Items).Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await lookup.PostAsJsonAsync("/api/v1/crm/customers/query", new QueryRequest())).StatusCode);
        result = await lookup.PostAsJsonAsync("/api/v1/crm/customers/lookup", new QueryRequest(Search: inactive.Code)); Assert.Empty((await result.Content.ReadFromJsonAsync<PageResult<CustomerSummary>>())!.Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await writer.PostAsJsonAsync(Path, Input(inactive.Id))).StatusCode);
        using var denied = await fixture.Login("denied@test.local"); Assert.Equal(HttpStatusCode.Forbidden, (await denied.PostAsJsonAsync("/api/v1/crm/customers/lookup", new QueryRequest())).StatusCode);
    }
}
