using System.Net;
using System.Security.Claims;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using BqAtlas.Sample.Crm;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace App.Tests;

public class PermissionTests
{
    [Fact]
    public async Task EndpointsDenyAnAuthenticatedAccountWithoutResourcePermissions()
    {
        // Authorization must stop these calls before constructing a database-backed service.
        var module = new CrmModule(_ => throw new InvalidOperationException("Denied requests must not access persistence."));
        using var host = await new HostBuilder().ConfigureWebHost(web => web.UseTestServer().ConfigureServices(services =>
        {
            services.AddRouting(); services.AddBqAtlasHttp(new BqAtlasRegistry());
            services.AddAuthentication("test-cookie").AddCookie("test-cookie", BqAtlasAuthentication.ConfigureCookie);
            module.ConfigureServices(services, new ConfigurationBuilder().Build());
        }).Configure(app =>
        {
            app.UseRouting(); app.UseAuthentication(); app.UseAuthorization();
            app.UseEndpoints(endpoints =>
            {
                module.MapEndpoints(endpoints);
                endpoints.MapGet("/test-login", () => Results.SignIn(new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "denied-test-user")], "test-cookie")), authenticationScheme: "test-cookie"));
            });
        })).StartAsync();
        using var client = host.GetTestClient();
        var record = CrmModule.Resource.Endpoint + "/" + Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(record)).StatusCode);
        using var login = await client.GetAsync("/test-login");
        client.DefaultRequestHeaders.Add("Cookie", string.Join("; ", login.Headers.GetValues("Set-Cookie").Select(value => value.Split(';')[0])));
        foreach (var (method, path) in new[] {
            (HttpMethod.Get, record), (HttpMethod.Post, CrmModule.Resource.Endpoint),
            (HttpMethod.Put, record), (HttpMethod.Delete, record),
            (HttpMethod.Post, CrmModule.Resource.Endpoint + "/query"),
            (HttpMethod.Post, CrmModule.Resource.Endpoint + "/lookup") })
        {
            using var request = new HttpRequestMessage(method, path);
            using var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
    }
}
