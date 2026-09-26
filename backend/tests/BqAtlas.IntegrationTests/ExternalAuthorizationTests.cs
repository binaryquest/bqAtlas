using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace BqAtlas.IntegrationTests;

public class ExternalAuthorizationTests
{
    [Theory]
    [InlineData("bqatlas-reader")]
    [InlineData("unassigned")]
    public async Task ExternalRolesCannotBypassApplicationEndpointPermissions(string role)
    {
        // This fixture starts after provider token validation. OidcCallbackTests
        // covers the preceding protocol step; live Keycloak has separate evidence.
        await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("Authentication:Mode", "oidc");
            builder.UseSetting("Authentication:Oidc:Authority", "https://provider.test");
            builder.UseSetting("Authentication:Oidc:ClientId", "external-policy-test");
            builder.UseSetting("Authentication:Bearer:Enabled", "false");
            builder.UseSetting("Database:Provider", "postgresql");
            // Authorization must reject before any database query. No server is required.
            builder.UseSetting("ConnectionStrings:Application", "Host=127.0.0.1;Port=1;Database=unused_external_policy_test;Timeout=1;Command Timeout=1");
        });
        var oidc = app.Services.GetRequiredService<IOptionsMonitor<OpenIdConnectOptions>>().Get("oidc");
        var principal = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("sub", "external-user"), new Claim("iss", "https://provider.test"),
            new Claim("preferred_username", role),
            new Claim("realm_access", JsonSerializer.Serialize(new { roles = new[] { role } })),
            // Untrusted application permissions supplied by the provider must be removed.
            new Claim(Permissions.ClaimType, "crm.customers.write"),
            new Claim(Permissions.ClaimType, "sales.quotes.submit")
        }, "oidc", "preferred_username", "role"));
        var context = new TokenValidatedContext(new DefaultHttpContext { RequestServices = app.Services },
            new AuthenticationScheme("oidc", null, typeof(OpenIdConnectHandler)), oidc, principal, new AuthenticationProperties());
        await oidc.Events.OnTokenValidated(context);
        var cookie = app.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(BqAtlasAuthentication.CookieScheme);
        var properties = new AuthenticationProperties { IssuedUtc = DateTimeOffset.UtcNow, ExpiresUtc = DateTimeOffset.UtcNow.AddMinutes(5) };
        var ticket = new AuthenticationTicket(context.Principal!, properties, BqAtlasAuthentication.CookieScheme);
        using var client = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("Cookie", cookie.Cookie.Name + "=" + cookie.TicketDataFormat.Protect(ticket));
        var session = await client.GetFromJsonAsync<SessionInfo>("/api/v1/session");
        Assert.True(session!.Authenticated); Assert.Equal("oidc", session.AuthMode);
        Assert.Equal(role, session.Name);
        Assert.Equal(role == "bqatlas-reader" ? new[] { "crm.customers.lookup", "crm.customers.read", "sales.quotes.read" } : [], session.Permissions.Order().ToArray());
        var manifest = await client.GetFromJsonAsync<ApplicationManifest>("/api/v1/manifest");
        Assert.NotNull(manifest);
        Assert.Equal(role == "bqatlas-reader" ? new[] { "crm.customers", "sales.quotes" } : [],
            manifest.Resources.Select(resource => resource.Id).Order().ToArray());
        await ApiFixture.Csrf(client);
        const string id = "11111111-1111-1111-1111-111111111111";
        var attempts = new List<(HttpMethod Method, string Path)>
        {
            (HttpMethod.Post, "/api/v1/crm/customers"),
            (HttpMethod.Put, "/api/v1/crm/customers/" + id),
            (HttpMethod.Delete, "/api/v1/crm/customers/" + id),
            (HttpMethod.Post, "/api/v1/sales/quotes"),
            (HttpMethod.Put, "/api/v1/sales/quotes/" + id),
            (HttpMethod.Delete, "/api/v1/sales/quotes/" + id),
            (HttpMethod.Post, "/api/v1/sales/quotes/" + id + "/submit")
        };
        if (role == "unassigned") attempts.AddRange(new[]
        {
            (HttpMethod.Get, "/api/v1/crm/customers/" + id),
            (HttpMethod.Post, "/api/v1/crm/customers/query"),
            (HttpMethod.Post, "/api/v1/crm/customers/lookup"),
            (HttpMethod.Get, "/odata/v1/crm/Customers?$count=true"),
            (HttpMethod.Get, "/odata/v1/crm/Customers?$expand=Orders"),
            (HttpMethod.Get, "/api/v1/sales/quotes/" + id),
            (HttpMethod.Post, "/api/v1/sales/quotes/query")
        });
        foreach (var (method, path) in attempts)
        {
            using var request = new HttpRequestMessage(method, path);
            if (method == HttpMethod.Post || method == HttpMethod.Put) request.Content = JsonContent.Create(new { });
            request.Headers.TryAddWithoutValidation("If-Match", "\"synthetic-version\"");
            using var response = await client.SendAsync(request);
            Assert.True(response.StatusCode == HttpStatusCode.Forbidden, $"{method} {path}: expected 403, got {(int)response.StatusCode}");
            Assert.Null(response.Headers.Location);
        }
    }
}
