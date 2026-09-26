using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BqAtlas.Core;
using BqAtlas.Sample.Crm;
using BqAtlas.Sample.Crm.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using Xunit.Abstractions;
namespace BqAtlas.IntegrationTests;

// ApiFixture creates bqatlas_test_<UUID>, migrates it, and drops that exact database on disposal.
public sealed class VolumeTests(ApiFixture fixture, ITestOutputHelper output) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task TenThousandCustomersStayBoundedAcrossRestODataAndLookup()
    {
        const int count = 10000;
        var timer = Stopwatch.StartNew();
        using (var scope = fixture.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            Assert.Matches("^bqatlas_test_[a-f0-9]{32}$", db.Database.GetDbConnection().Database);
            Assert.Equal(0, await db.Customers.CountAsync());
            db.Customers.AddRange(Enumerable.Range(0, count).Select(i => new Customer
            {
                Id = Guid.NewGuid(), Code = $"VOLUME-{i:D5}", Name = $"Volume customer {i:D5}",
                SearchName = $"VOLUME CUSTOMER {i:D5}", Active = i % 2 == 0,
                ModifiedAt = DateTimeOffset.UtcNow, ModifiedBy = "volume-fixture"
            }));
            await db.SaveChangesAsync();
        }
        var seedMilliseconds = timer.Elapsed.TotalMilliseconds;
        using var client = await fixture.Login("reader@test.local");
        var observations = new List<object>();
        async Task<JsonElement> Measure(string name, Func<Task<HttpResponseMessage>> send)
        {
            timer.Restart();using var response = await send();var bytes = await response.Content.ReadAsByteArrayAsync();
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            observations.Add(new { name, elapsedMilliseconds = timer.Elapsed.TotalMilliseconds, responseBytes = bytes.Length });
            Assert.InRange(bytes.Length, 1, 16000);
            using var document = JsonDocument.Parse(bytes);return document.RootElement.Clone();
        }
        foreach (var page in new[] { 0, 199, 399 })
        {
            var json = await Measure($"rest-page-{page}", () => client.PostAsJsonAsync("/api/v1/crm/customers/query", new QueryRequest(Page: page, PageSize: 25, Sort: [new("code", "asc")])));
            var result = json.Deserialize<PageResult<CustomerDto>>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
            Assert.Equal(count, result.Total);Assert.Equal(25, result.Items.Count);
            Assert.Equal($"VOLUME-{page * 25:D5}", result.Items[0].Code);
            Assert.Equal($"VOLUME-{page * 25 + 24:D5}", result.Items[^1].Code);
        }
        var filtered = await Measure("rest-active-desc", () => client.PostAsJsonAsync("/api/v1/crm/customers/query", new QueryRequest(PageSize: 25, Sort: [new("code", "desc")], Filters: [new("active", "eq", "true")])));
        Assert.Equal(5000, filtered.GetProperty("total").GetInt32());Assert.Equal("VOLUME-09998", filtered.GetProperty("items")[0].GetProperty("code").GetString());
        var odata = await Measure("odata-last-page", () => client.GetAsync("/odata/v1/crm/Customers?$count=true&$top=25&$skip=9975&$orderby=Code%20asc"));
        Assert.Equal(count, odata.GetProperty("@odata.count").GetInt32());Assert.Equal(25, odata.GetProperty("value").GetArrayLength());
        Assert.Equal("VOLUME-09975", odata.GetProperty("value")[0].GetProperty("Code").GetString());
        var lookup = await Measure("active-customer-lookup", () => client.PostAsJsonAsync("/api/v1/crm/customers/lookup", new QueryRequest(PageSize: 20, Search: "Volume customer 09")));
        var choices = lookup.Deserialize<PageResult<CustomerSummary>>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(500, choices.Total);Assert.Equal(20, choices.Items.Count);Assert.All(choices.Items, row => Assert.True(row.Active));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/crm/customers/query", new QueryRequest(PageSize: count))).StatusCode);
        var report = JsonSerializer.Serialize(new { passed = true, provider = Environment.GetEnvironmentVariable("BQATLAS_TEST_PROVIDER") ?? "postgresql", seededCustomers = count, seedMilliseconds, observations, browserRendered = false, concurrencyLoadTest = false }, new JsonSerializerOptions { WriteIndented = true });
        output.WriteLine(report);
        if (Environment.GetEnvironmentVariable("BQATLAS_VOLUME_REPORT") is { Length: > 0 } path) await File.WriteAllTextAsync(path, report);
    }
}
