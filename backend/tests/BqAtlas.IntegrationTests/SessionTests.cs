using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using BqAtlas.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;
namespace BqAtlas.IntegrationTests;

public sealed class SessionTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan duration) => now += duration;
    }
    private static async Task AssertExpired(HttpClient client)
    {
        var session = await client.GetFromJsonAsync<SessionInfo>("/api/v1/session");
        Assert.NotNull(session); Assert.False(session.Authenticated); Assert.Null(session.Id); Assert.Empty(session.Permissions);
        foreach (var path in new[] { "/api/v1/manifest", "/api/v1/crm/customers/" + Guid.NewGuid(), "/odata/v1/crm/Customers?$count=true" })
        {
            using var response = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Null(response.Headers.Location);
        }
    }
    [Fact]
    public async Task RealLocalLoginCookieExpiresWithoutRedirectOrResidualPermissions()
    {
        var clock = new TestClock();
        await using var app = fixture.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.PostConfigure<CookieAuthenticationOptions>(IdentityConstants.ApplicationScheme, options =>
            { options.TimeProvider = clock; options.ExpireTimeSpan = TimeSpan.FromMinutes(1); options.SlidingExpiration = false; })));
        using var client = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await ApiFixture.Csrf(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/auth/login", new { email = "writer@test.local", password = fixture.Password })).StatusCode);
        Assert.True((await client.GetFromJsonAsync<SessionInfo>("/api/v1/session"))!.Authenticated);
        clock.Advance(TimeSpan.FromMinutes(2));
        await AssertExpired(client);
    }
    [Fact]
    public async Task LocalSecurityStampRevocationRejectsExistingSession()
    {
        await using var app = fixture.App.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Configure<SecurityStampValidatorOptions>(options => options.ValidationInterval = TimeSpan.Zero)));
        var email = "stamp-" + Guid.NewGuid().ToString("N") + "@test.local";
        using var scope = app.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AtlasUser>>();
        var user = new AtlasUser { UserName = email, Email = email, EmailConfirmed = true };
        Assert.True((await users.CreateAsync(user, fixture.Password)).Succeeded);
        using var client = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await ApiFixture.Csrf(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/auth/login", new { email, password = fixture.Password })).StatusCode);
        Assert.True((await client.GetFromJsonAsync<SessionInfo>("/api/v1/session"))!.Authenticated);
        Assert.True((await users.UpdateSecurityStampAsync(user)).Succeeded);
        await AssertExpired(client);
    }
    [Fact]
    public async Task OidcApplicationCookieExpiresWithoutStartingProviderRedirect()
    {
        // A protected synthetic ticket isolates cookie lifetime from provider availability.
        // Real Keycloak code/PKCE login is separately qualified; this is not a callback test.
        var clock = new TestClock();
        await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("Authentication:Mode", "oidc");
            builder.UseSetting("Authentication:Oidc:Authority", "https://identity.example.test");
            builder.UseSetting("Authentication:Oidc:ClientId", "session-test");
            builder.UseSetting("Database:Provider", "postgresql");
            builder.UseSetting("ConnectionStrings:Application", "Host=127.0.0.1;Database=unused_oidc_cookie_test");
            builder.ConfigureServices(services => services.PostConfigure<CookieAuthenticationOptions>(BqAtlasAuthentication.CookieScheme,
                options => { options.TimeProvider = clock; options.SlidingExpiration = false; }));
        });
        var options = app.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(BqAtlasAuthentication.CookieScheme);
        var principal = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", "session-user"), new Claim("iss", "https://identity.example.test"), new Claim(Permissions.ClaimType, "crm.customers.read") }, BqAtlasAuthentication.CookieScheme));
        var ticket = new AuthenticationTicket(principal, new AuthenticationProperties { IssuedUtc = clock.GetUtcNow(), ExpiresUtc = clock.GetUtcNow().AddMinutes(1) }, BqAtlasAuthentication.CookieScheme);
        using var client = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = false });
        client.DefaultRequestHeaders.Add("Cookie", options.Cookie.Name + "=" + options.TicketDataFormat.Protect(ticket));
        var session = await client.GetFromJsonAsync<SessionInfo>("/api/v1/session");
        Assert.Equal("oidc", session!.AuthMode); Assert.True(session.Authenticated); Assert.Contains("crm.customers.read", session.Permissions);
        clock.Advance(TimeSpan.FromMinutes(2));
        await AssertExpired(client);
    }
}
