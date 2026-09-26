using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using BqAtlas.Core;
using BqAtlas.Identity;
using BqAtlas.Sample.Crm;
using BqAtlas.Sample.Sales;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace BqAtlas.IntegrationTests;

public sealed class ApiFixture : IAsyncLifetime
{
    public WebApplicationFactory<Program> App { get; private set; } = null!;
    public TestAccountEmailSender Mail { get; } = new();
    private string expectedDatabase = "";
    public readonly string Password = "BqAtlas-test-" + Guid.NewGuid().ToString("N") + "!1aA";
    public async Task InitializeAsync()
    {
        var source = Environment.GetEnvironmentVariable("BQATLAS_TEST_CONNECTION") ?? throw new InvalidOperationException("Set BQATLAS_TEST_CONNECTION to a disposable SQL Server/PostgreSQL server. These tests create and drop a uniquely named test database.");
        var provider = Environment.GetEnvironmentVariable("BQATLAS_TEST_PROVIDER") ?? "postgresql";
        var connection = new DbConnectionStringBuilder { ConnectionString = source }; expectedDatabase = "bqatlas_test_" + Guid.NewGuid().ToString("N"); connection["Database"] = expectedDatabase;
        App = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services => services.AddSingleton<IAccountEmailSender>(Mail));
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Application"] = connection.ConnectionString,
                ["Database:Provider"] = provider,
                ["Authentication:Mode"] = "local",
                ["Identity:PublicOrigin"] = "http://127.0.0.1:4200",
                ["Bootstrap:Email"] = "",
                ["Bootstrap:Password"] = "",
                ["Logging:LogLevel:Default"] = "Warning"
            }));
        });
        using var scope = App.Services.CreateScope();
        Assert.Equal(expectedDatabase, scope.ServiceProvider.GetRequiredService<CrmDbContext>().Database.GetDbConnection().Database);
        await scope.ServiceProvider.GetRequiredService<CrmDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<AtlasIdentityDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<SalesDbContext>().Database.MigrateAsync();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AtlasUser>>();
        foreach (var (email, permissions) in new[] { ("writer@test.local", CrmPermissions.All.Concat(SalesPermissions.All).ToArray()), ("reader@test.local", new[] { CrmPermissions.Read, CrmPermissions.Lookup, SalesPermissions.Read }), ("denied@test.local", Array.Empty<string>()), ("editor@test.local", new[] { CrmPermissions.Lookup, SalesPermissions.Read, SalesPermissions.Write }), ("lookup@test.local", new[] { CrmPermissions.Lookup }), ("sales-only@test.local", new[] { SalesPermissions.Read, SalesPermissions.Write }) })
        {
            var user = new AtlasUser { UserName = email, Email = email, EmailConfirmed = true };
            Assert.True((await users.CreateAsync(user, Password)).Succeeded);
            Assert.True((await users.AddClaimsAsync(user, permissions.Select(p => new Claim(Permissions.ClaimType, p)))).Succeeded);
        }
    }
    public async Task DisposeAsync()
    {
        if (App is null) return;
        using (var scope = App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            if (db.Database.GetDbConnection().Database == expectedDatabase && expectedDatabase.StartsWith("bqatlas_test_", StringComparison.Ordinal)) await db.Database.EnsureDeletedAsync();
        }
        await App.DisposeAsync();
    }
    public HttpClient Client() => App.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
    public static async Task Csrf(HttpClient client)
    {
        var body = await client.GetFromJsonAsync<JsonElement>("/api/v1/session/csrf");
        client.DefaultRequestHeaders.Remove("X-BQATLAS-CSRF"); client.DefaultRequestHeaders.Add("X-BQATLAS-CSRF", body.GetProperty("token").GetString());
    }
    public async Task<HttpClient> Login(string email = "writer@test.local")
    {
        var client = Client(); await Csrf(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/auth/login", new { email, password = Password })).StatusCode);
        await Csrf(client); return client;
    }
}
public class HttpTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    const string Path = "/api/v1/crm/customers";
    [Fact]
    public async Task AnonymousRequestsReturn401WithoutRedirect()
    {
        using var client = fixture.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Path + "/" + Guid.NewGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/odata/v1/crm/Customers")).StatusCode);
        var session = await client.GetFromJsonAsync<SessionInfo>("/api/v1/session"); Assert.False(session!.Authenticated);
    }
    [Fact]
    public async Task LoginAndWritesRequireAntiforgeryToken()
    {
        using var anonymous = fixture.Client(); Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.PostAsJsonAsync("/auth/login", new { email = "writer@test.local", password = fixture.Password })).StatusCode);
        using var client = await fixture.Login(); client.DefaultRequestHeaders.Remove("X-BQATLAS-CSRF");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path, new CustomerInput("CSRF", "Blocked", null))).StatusCode);
    }
    [Fact]
    public async Task PermissionsProtectApiAndManifest()
    {
        using var client = await fixture.Login("reader@test.local");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Path, new CustomerInput("READONLY", "Blocked", null))).StatusCode);
        using var denied = await fixture.Login("denied@test.local");
        Assert.Empty((await denied.GetFromJsonAsync<ApplicationManifest>("/api/v1/manifest"))!.Resources);
        Assert.Equal(HttpStatusCode.Forbidden, (await denied.GetAsync("/odata/v1/crm/Customers")).StatusCode);
    }
    [Fact]
    public async Task CrudNormalizesValidatesQueriesAndRejectsStaleWrites()
    {
        using var client = await fixture.Login();
        var input = new CustomerInput(" t-" + Guid.NewGuid().ToString("N")[..12] + " ", " Acme Test ", "hello@example.test");
        var created = await client.PostAsJsonAsync(Path, input); Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var first = (await created.Content.ReadFromJsonAsync<RecordResult<CustomerDto>>())!;
        Assert.Equal("Acme Test", first.Data.Name); Assert.Equal(input.Code.Trim().ToUpperInvariant(), first.Data.Code);
        var url = Path + "/" + first.Data.Id;
        Assert.Equal(HttpStatusCode.PreconditionRequired, (await client.PutAsJsonAsync(url, input)).StatusCode);
        using var request = new HttpRequestMessage(HttpMethod.Put, url) { Content = JsonContent.Create(input with { Name = "Updated" }) }; request.Headers.TryAddWithoutValidation("If-Match", '"' + first.Version + '"');
        var updated = await client.SendAsync(request); Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var second = (await updated.Content.ReadFromJsonAsync<RecordResult<CustomerDto>>())!; Assert.NotEqual(first.Version, second.Version);
        using var stale = new HttpRequestMessage(HttpMethod.Put, url) { Content = JsonContent.Create(input with { Name = "Overwrite" }) }; stale.Headers.TryAddWithoutValidation("If-Match", '"' + first.Version + '"');
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await client.SendAsync(stale)).StatusCode);
        var query = await client.PostAsJsonAsync(Path + "/query", new QueryRequest(Search: input.Code.Trim().ToLowerInvariant())); Assert.Equal(HttpStatusCode.OK, query.StatusCode);
        Assert.Contains((await query.Content.ReadFromJsonAsync<PageResult<CustomerDto>>())!.Items, c => c.Id == first.Data.Id && c.Name == "Updated");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path, new CustomerInput("INVALID", "", "bad"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path + "/query", new QueryRequest(PageSize: 5000))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Path + "/query", new { search = (string?)null })).StatusCode);
        using var deletion = new HttpRequestMessage(HttpMethod.Delete, url); deletion.Headers.TryAddWithoutValidation("If-Match", '"' + second.Version + '"');
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(deletion)).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(url)).StatusCode);
    }
    [Fact]
    public async Task ODataReadsAreBoundedAndDoNotExposeInternalColumns()
    {
        using var client = await fixture.Login();
        var result = await client.GetAsync("/odata/v1/crm/Customers?$top=5&$select=Id,Code,Name"); Assert.True(result.IsSuccessStatusCode, await result.Content.ReadAsStringAsync());
        Assert.True(result.Headers.CacheControl?.NoStore);
        var code = "ODATA-" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
        var created = await client.PostAsJsonAsync("/api/v1/crm/customers", new CustomerInput(code, "O'Brien", null, true));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var query = "/odata/v1/crm/Customers?$count=true&$top=20&$skip=0&$orderby=Name%20desc,Id%20asc&$filter=" + Uri.EscapeDataString("Code eq '" + code + "' and contains(Name,'O''Brien')");
        var counted = await client.GetAsync(query);
        Assert.True(counted.IsSuccessStatusCode, await counted.Content.ReadAsStringAsync());
        using var page = JsonDocument.Parse(await counted.Content.ReadAsStringAsync());
        Assert.Equal(1, page.RootElement.GetProperty("@odata.count").GetInt32());
        Assert.Equal("O'Brien", Assert.Single(page.RootElement.GetProperty("value").EnumerateArray()).GetProperty("Name").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/odata/v1/crm/Customers?$top=5000")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/odata/v1/crm/Customers?$select=ModifiedBy")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/odata/v1/crm/Customers?$expand=Orders")).StatusCode);
    }
    [Fact]
    public async Task LogoutInvalidatesTheBrowserCookie()
    {
        using var client = await fixture.Login(); Assert.True((await client.GetFromJsonAsync<SessionInfo>("/api/v1/session"))!.Authenticated);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/auth/logout", null)).StatusCode);
        Assert.False((await client.GetFromJsonAsync<SessionInfo>("/api/v1/session"))!.Authenticated);
    }
}
