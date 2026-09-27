using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

public sealed class ModuleTests(StarterFixture fixture) : IClassFixture<StarterFixture>
{
    private static async Task<JsonElement> Json(HttpResponseMessage response, HttpStatusCode status = HttpStatusCode.OK)
    {
        Assert.Equal(status, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    [Fact]
    public async Task ComposedModuleUsesMigrationsPermissionsAndCrudAcrossRestart()
    {
        var cookies = new CookieContainer(); using var client = fixture.Client(cookies);
        const string path = "/api/v1/inventory/products";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path + "/" + Guid.NewGuid())).StatusCode);
        await StarterFixture.Csrf(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/auth/login", new { email = fixture.Email, password = fixture.Password })).StatusCode);
        await StarterFixture.Csrf(client);
        var session = await client.GetFromJsonAsync<JsonElement>("/api/v1/session");
        Assert.Contains(session.GetProperty("permissions").EnumerateArray(), p => p.GetString() == "inventory.products.write");
        var manifest = await client.GetFromJsonAsync<JsonElement>("/api/v1/manifest");
        Assert.Contains(manifest.GetProperty("modules").EnumerateArray(), p => p.GetString() == "inventory");
        Assert.Contains(manifest.GetProperty("resources").EnumerateArray(), p => p.GetProperty("id").GetString() == "inventory.products");
        var input = new { sku = "WALK-1", description = "Migrated product", contact = "", active = true, reorderLevel = 3, availableFrom = "2026-09-27", category = "Stock", unitPrice = "12.3456" };
        var created = await Json(await client.PostAsJsonAsync(path, input), HttpStatusCode.Created);
        var id = created.GetProperty("data").GetProperty("id").GetString();
        var version = created.GetProperty("version").GetString()!;
        Assert.Equal("12.3456", created.GetProperty("data").GetProperty("unitPrice").GetString());
        Assert.Equal(version, (await Json(await client.GetAsync(path + "/" + id))).GetProperty("version").GetString());
        var odata = await Json(await client.GetAsync("/odata/v1/inventory/Products?$filter=Sku%20eq%20'WALK-1'&$count=true&$top=10"));
        Assert.Equal(id, Assert.Single(odata.GetProperty("value").EnumerateArray()).GetProperty("Id").GetString());
        using var update = new HttpRequestMessage(HttpMethod.Put, path + "/" + id) { Content = JsonContent.Create(input with { description = "Updated module record" }) };
        update.Headers.Add("If-Match", '"' + version + '"');
        var changed = await Json(await client.SendAsync(update));
        var newVersion = changed.GetProperty("version").GetString()!; Assert.NotEqual(version, newVersion);
        await fixture.RestartAndReapplyMigrations();
        using var restarted = fixture.Client(cookies);
        var persisted = await Json(await restarted.GetAsync(path + "/" + id));
        Assert.Equal("Updated module record", persisted.GetProperty("data").GetProperty("description").GetString());
        Assert.Equal(newVersion, persisted.GetProperty("version").GetString());
        await StarterFixture.Csrf(restarted);
        using var delete = new HttpRequestMessage(HttpMethod.Delete, path + "/" + id); delete.Headers.Add("If-Match", '"' + newVersion + '"');
        Assert.Equal(HttpStatusCode.NoContent, (await restarted.SendAsync(delete)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await restarted.GetAsync(path + "/" + id)).StatusCode);
        await fixture.BrowserReview();
    }
}
