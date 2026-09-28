using System.Data.Common;
using System.Globalization;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using App.Modules.Inventory;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.OData;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Xunit;

public sealed class GeneratedFixture : IAsyncLifetime
{
    public IHost Host { get; private set; } = null!;
    private string database = "";
    private bool initialized;
    private int delayedQueriesStarted, delayedQueriesCancelled, delayedQueriesCompleted;
    public Uri Address { get; private set; } = null!;
    public async Task InitializeAsync()
    {
        var source = Environment.GetEnvironmentVariable("BQATLAS_TEST_CONNECTION") ?? throw new InvalidOperationException("A disposable database server connection is required.");
        var provider = Environment.GetEnvironmentVariable("BQATLAS_TEST_PROVIDER") ?? "postgresql";
        if (provider is not ("postgresql" or "sqlserver")) throw new InvalidOperationException("Unsupported provider.");
        database = "bqatlas_generated_" + Guid.NewGuid().ToString("N");
        var connection = new DbConnectionStringBuilder { ConnectionString = source }; connection["Database"] = database;
        var registry = new BqAtlasRegistry();
        registry.AddModule(new InventoryModule(options => { if (provider == "postgresql") options.UseNpgsql(connection.ConnectionString); else options.UseSqlServer(connection.ConnectionString); }));
        registry.AddResource(InventoryModule.Resource);
        Host = await new HostBuilder().ConfigureLogging(logging => logging.SetMinimumLevel(LogLevel.Warning)).ConfigureWebHost(web => web.UseWebRoot(Environment.GetEnvironmentVariable("BQATLAS_RESOURCE_WEBROOT") ?? Directory.GetCurrentDirectory()).UseEnvironment("Development").UseKestrel().UseUrls("http://127.0.0.1:0").ConfigureServices(services =>
        {
            services.AddRouting(); services.AddBqAtlasHttp(registry); registry.Configure(services, new ConfigurationBuilder().Build());
            services.AddAuthentication("test-cookie").AddCookie("test-cookie", BqAtlasAuthentication.ConfigureCookie);
            services.AddControllers().AddApplicationPart(typeof(ProductsController).Assembly).AddOData(options => options.Select().Filter().OrderBy().Count().SetMaxTop(100).AddRouteComponents("odata/v1/inventory", InventoryModule.ReadModel()));
        }).Configure(app =>
        {
            if (Environment.GetEnvironmentVariable("BQATLAS_RESOURCE_WEBROOT") is not null) { app.UseDefaultFiles(); app.UseStaticFiles(); }
            app.UseExceptionHandler(); app.UseRouting(); app.UseAuthentication(); app.UseAuthorization();
            if (Environment.GetEnvironmentVariable("BQATLAS_RESOURCE_REVIEW") is not null)
                app.Use(async (context, next) =>
                {
                    var path = context.Request.Path.Value ?? "";
                    var write = (HttpMethods.IsPost(context.Request.Method) && path == "/api/v1/inventory/products") ||
                        ((HttpMethods.IsPut(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method)) && path.StartsWith("/api/v1/inventory/products/", StringComparison.Ordinal));
                    if (write && context.Request.Cookies["bqatlas.review.delay"] == "true")
                        await Task.Delay(TimeSpan.FromSeconds(10), context.RequestAborted);
                    if (HttpMethods.IsPost(context.Request.Method) && path == "/api/v1/inventory/products/query" && context.Request.Cookies["bqatlas.review.query-delay"] == "true")
                    {
                        Interlocked.Increment(ref delayedQueriesStarted);
                        try
                        {
                            await Task.Delay(TimeSpan.FromSeconds(10), context.RequestAborted);
                            await next();
                            Interlocked.Increment(ref delayedQueriesCompleted);
                        }
                        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
                        {
                            Interlocked.Increment(ref delayedQueriesCancelled);
                        }
                        return;
                    }
                    await next();
                });
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapBqAtlas("local"); registry.Map(endpoints); endpoints.MapControllers();
                // Loopback-only test harness and isolated database; never used by the production host.
                if (Environment.GetEnvironmentVariable("BQATLAS_RESOURCE_REVIEW") is not null)
                {
                    endpoints.MapGet("/test/browser-login/writer", async (HttpContext context) =>
                    {
                        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, "browser-writer") }.Concat(InventoryPermissions.All.Select(permission => new Claim(Permissions.ClaimType, permission)));
                        await context.SignInAsync("test-cookie", new ClaimsPrincipal(new ClaimsIdentity(claims, "test-cookie")));
                        return Results.Redirect("/");
                    });
                    endpoints.MapGet("/test/write-delay/{enabled:bool}", (bool enabled, HttpContext context) =>
                    {
                        context.Response.Cookies.Append("bqatlas.review.delay", enabled ? "true" : "false", new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict });
                        return Results.Redirect("/?delay=" + (enabled ? "on" : "off"));
                    }).RequireAuthorization();
                    endpoints.MapGet("/test/query-delay/{enabled:bool}", (bool enabled, HttpContext context) =>
                    {
                        context.Response.Cookies.Append("bqatlas.review.query-delay", enabled ? "true" : "false", new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict });
                        return Results.Redirect("/");
                    }).RequireAuthorization();
                    // Anonymous aggregate counters contain no record/session data and exist only in the loopback review host.
                    endpoints.MapGet("/test/query-stats", () => Results.Json(new { started = Volatile.Read(ref delayedQueriesStarted), cancelled = Volatile.Read(ref delayedQueriesCancelled), completed = Volatile.Read(ref delayedQueriesCompleted) }));
                }
                endpoints.MapGet("/test/login/{role}", (string role) =>
                {
                    var permissions = role == "writer" ? InventoryPermissions.All : role == "reader" ? [InventoryPermissions.Read] : Array.Empty<string>();
                    var claims = new[] { new Claim(ClaimTypes.NameIdentifier, role), new Claim(ClaimTypes.Name, role) }.Concat(permissions.Select(permission => new Claim(Permissions.ClaimType, permission)));
                    return Results.SignIn(new ClaimsPrincipal(new ClaimsIdentity(claims, "test-cookie")), authenticationScheme: "test-cookie");
                });
            });
        })).StartAsync();
        Address = new Uri(Host.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single());
        using var scope = Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        Assert.Equal(database, db.Database.GetDbConnection().Database);
        // New isolated database: exercise generated EF mapping, not the sample's migration assemblies.
        await db.Database.EnsureCreatedAsync();
        initialized = true;
    }
    public async Task DisposeAsync()
    {
        if (Host is null) return;
        try
        {
            if (initialized && Environment.GetEnvironmentVariable("BQATLAS_RESOURCE_REVIEW") is { Length: > 0 } path)
            {
                await File.WriteAllTextAsync(path, JsonSerializer.Serialize(new { origin = Address.GetLeftPart(UriPartial.Authority), authentication = "synthetic loopback test identity" }));
                try { using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(40)); while (!File.Exists(path + ".done")) await Task.Delay(1000, timeout.Token); }
                finally { File.Delete(path); }
            }
        }
        finally
        {
            try { using var scope = Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
                if (database.StartsWith("bqatlas_generated_", StringComparison.Ordinal) && db.Database.GetDbConnection().Database == database) await db.Database.EnsureDeletedAsync();
            } finally { Host.Dispose(); }
        }
    }
    public HttpClient Client() => new(new HttpClientHandler { UseCookies = true, AllowAutoRedirect = false }) { BaseAddress = Address };
    public async Task<HttpClient> Login(string role = "writer")
    {
        var client = Client(); Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/test/login/" + role)).StatusCode);
        var csrf = await client.GetFromJsonAsync<JsonElement>("/api/v1/session/csrf"); client.DefaultRequestHeaders.Add("X-BQATLAS-CSRF", csrf.GetProperty("token").GetString()); return client;
    }

}
public sealed class RuntimeTests(GeneratedFixture fixture) : IClassFixture<GeneratedFixture>
{
    private const string Path = "/api/v1/inventory/products";
    private static ProductInput Input(string sku, decimal price = 12.3456m) => new(sku, "O'Brien product", "supplier@example.com", true, 3, new DateOnly(2026, 2, 1), "Stock", price);
    private static async Task<RecordResult<ProductDto>> Create(HttpClient client, ProductInput input)
    {
        var response = await client.PostAsJsonAsync(Path, input); Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<RecordResult<ProductDto>>())!;
    }
    [Fact]
    public async Task GeneratedCrudPersistsEveryFieldAndEnforcesConcurrency()
    {
        using var client = await fixture.Login(); var input = Input("CRUD-" + Guid.NewGuid().ToString("N")); var first = await Create(client, input); var url = Path + "/" + first.Data.Id;
        Assert.Equal(input.UnitPrice, first.Data.UnitPrice); Assert.Equal(input.AvailableFrom, first.Data.AvailableFrom); Assert.Equal(input.ReorderLevel, first.Data.ReorderLevel); Assert.Equal(input.Category, first.Data.Category);
        var loaded = (await client.GetFromJsonAsync<RecordResult<ProductDto>>(url))!; Assert.Equal(first.Data, loaded.Data); Assert.Equal(first.Version, loaded.Version);
        var resolved = (await client.GetFromJsonAsync<ProductDto>(Path + "/lookup/" + first.Data.Id))!;
        Assert.Equal(first.Data, resolved);
        Assert.Equal("null", await client.GetStringAsync(Path + "/lookup/" + Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.PreconditionRequired, (await client.PutAsJsonAsync(url, input)).StatusCode);
        using var update = new HttpRequestMessage(HttpMethod.Put, url) { Content = JsonContent.Create(input with { Description = "Changed", UnitPrice = 0.0001m, Active = false }) }; update.Headers.TryAddWithoutValidation("If-Match", '"' + first.Version + '"');
        var response = await client.SendAsync(update); Assert.Equal(HttpStatusCode.OK, response.StatusCode); var second = (await response.Content.ReadFromJsonAsync<RecordResult<ProductDto>>())!; Assert.NotEqual(first.Version, second.Version); Assert.Equal(0.0001m, second.Data.UnitPrice);
        var reloaded = (await client.GetFromJsonAsync<RecordResult<ProductDto>>(url))!; Assert.Equal(second.Data, reloaded.Data); Assert.Equal(second.Version, reloaded.Version);
        using var stale = new HttpRequestMessage(HttpMethod.Put, url) { Content = JsonContent.Create(input) }; stale.Headers.TryAddWithoutValidation("If-Match", '"' + first.Version + '"'); Assert.Equal(HttpStatusCode.PreconditionFailed, (await client.SendAsync(stale)).StatusCode);
        using (var scope = fixture.Host.Services.CreateScope()) { var row = await scope.ServiceProvider.GetRequiredService<InventoryDbContext>().Products.AsNoTracking().SingleAsync(p => p.Id == first.Data.Id); Assert.Equal("writer", row.ModifiedBy); Assert.False(row.Active); Assert.Equal("Changed", row.Description); Assert.Equal(0.0001m, row.UnitPrice); }
        using var delete = new HttpRequestMessage(HttpMethod.Delete, url); delete.Headers.TryAddWithoutValidation("If-Match", '"' + second.Version + '"'); Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(delete)).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(url)).StatusCode);
    }
    [Fact]
    public async Task TypedRestAndODataQueriesAgreeWithoutLosingDecimalPrecision()
    {
        using var client = await fixture.Login(); var prefix = "QUERY-" + Guid.NewGuid().ToString("N")[..12];
        await Create(client, Input(prefix + "-LOW", 0.1001m)); var expected = await Create(client, Input(prefix + "-HIGH", 90071992547409.0001m));
        var request = new QueryRequest(Sort: [new("unitPrice", "desc"), new("availableFrom")], Filters: [new("sku", "startsWith", prefix), new("active", "eq", "true"), new("reorderLevel", "eq", "3"), new("availableFrom", "eq", "2026-02-01")]);
        var response = await client.PostAsJsonAsync(Path + "/query", request); Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var rest = (await response.Content.ReadFromJsonAsync<PageResult<ProductDto>>())!; Assert.Equal(2, rest.Total); Assert.Equal(expected.Data.Id, rest.Items[0].Id); Assert.Equal(90071992547409.0001m, rest.Items[0].UnitPrice);
        var filter = $"startswith(Sku,'{prefix}') and Active eq true and ReorderLevel eq 3 and AvailableFrom eq 2026-02-01";
        using var query = new HttpRequestMessage(HttpMethod.Get, "/odata/v1/inventory/Products?$count=true&$top=25&$orderby=UnitPrice%20desc,Id&$filter=" + Uri.EscapeDataString(filter)); query.Headers.TryAddWithoutValidation("Accept", "application/json;IEEE754Compatible=true");
        var odata = await client.SendAsync(query); Assert.True(odata.IsSuccessStatusCode, await odata.Content.ReadAsStringAsync());
        using var document = JsonDocument.Parse(await odata.Content.ReadAsStringAsync()); var root = document.RootElement;
        Assert.Equal("2", root.GetProperty("@odata.count").ToString()); var values = root.GetProperty("value").EnumerateArray().ToArray(); Assert.Equal(2, values.Length);
        Assert.Equal(expected.Data.Id, values[0].GetProperty("Id").GetGuid()); Assert.Equal(JsonValueKind.String, values[0].GetProperty("UnitPrice").ValueKind); Assert.Equal(90071992547409.0001m, decimal.Parse(values[0].GetProperty("UnitPrice").GetString()!, CultureInfo.InvariantCulture));
        Assert.Equal("2026-02-01", values[0].GetProperty("AvailableFrom").GetString()); Assert.False(values[0].TryGetProperty("Version", out _)); Assert.False(values[0].TryGetProperty("ModifiedBy", out _));
    }
    [Fact]
    public async Task ActualFrontendProvidersAgreeAgainstTheGeneratedDatabaseResource()
    {
        var node = Environment.GetEnvironmentVariable("BQATLAS_NODE") ?? throw new InvalidOperationException("The runtime runner must supply Node.");
        var script = Environment.GetEnvironmentVariable("BQATLAS_PROVIDER_TEST_SCRIPT") ?? throw new InvalidOperationException("The runtime runner must supply the provider test script.");
        var start = new ProcessStartInfo(node) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        start.ArgumentList.Add(script); start.Environment["BQATLAS_TEST_ORIGIN"] = fixture.Address.GetLeftPart(UriPartial.Authority);
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        try { await process.WaitForExitAsync(timeout.Token); } catch { process.Kill(entireProcessTree: true); throw; }
        Assert.True(process.ExitCode == 0, (await stdout) + (await stderr));
    }
    [Fact]
    public async Task GeneratedEndpointsEnforcePermissionsCsrfValidationAndQueryBounds()
    {
        using var anonymous = fixture.Client(); Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/odata/v1/inventory/Products")).StatusCode);
        using var denied = await fixture.Login("denied"); Assert.Empty((await denied.GetFromJsonAsync<ApplicationManifest>("/api/v1/manifest"))!.Resources); Assert.Equal(HttpStatusCode.Forbidden, (await denied.GetAsync("/odata/v1/inventory/Products")).StatusCode);
        using var reader = await fixture.Login("reader"); Assert.Equal(HttpStatusCode.Forbidden, (await reader.PostAsJsonAsync(Path, Input("DENIED"))).StatusCode);
        using var client = await fixture.Login(); Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path, Input("INVALID") with { UnitPrice = 0.00001m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path, Input("INVALID") with { Category = "Unknown" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path, new { sku = "MISSING" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path + "/query", new QueryRequest(PageSize: 5000))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/odata/v1/inventory/Products?$top=5000")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/odata/v1/inventory/Products?$select=ModifiedBy")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-BQATLAS-CSRF"); Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path, Input("CSRF"))).StatusCode);
    }
}
