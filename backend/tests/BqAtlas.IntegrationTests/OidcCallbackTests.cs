using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace BqAtlas.IntegrationTests;

public class OidcCallbackTests
{
    [Theory]
    [InlineData("valid")]
    [InlineData("unmapped-role")]
    [InlineData("issuer")]
    [InlineData("audience")]
    [InlineData("expired")]
    [InlineData("signature")]
    [InlineData("nonce")]
    [InlineData("missing-nonce")]
    [InlineData("state")]
    [InlineData("correlation")]
    public async Task BrowserCallbackValidatesProtocolBeforeIssuingApplicationCookie(string scenario)
    {
        const string issuer = "https://issuer.test";
        using var rsa = RSA.Create(2048);
        using var otherRsa = RSA.Create(2048);
        var key = new RsaSecurityKey(rsa) { KeyId = "test-key" };
        var otherKey = new RsaSecurityKey(otherRsa) { KeyId = "test-key" };
        var provider = new TokenEndpoint();
        Exception? callbackFailure = null;
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:Oidc:Authority"] = issuer,
            ["Authentication:Oidc:ClientId"] = "bqatlas-test",
            ["Authentication:Oidc:ClientSecret"] = "synthetic-test-secret",
            ["Authentication:RolePermissions:reader:0"] = "records.read"
        }).Build();
        using var host = await new HostBuilder().ConfigureWebHost(web => web.UseTestServer().ConfigureServices(services =>
        {
            services.AddRouting();
            services.AddBqAtlasHttp(new BqAtlasRegistry());
            services.AddBqAtlasOidc(configuration);
            services.PostConfigure<OpenIdConnectOptions>("oidc", options =>
            {
                var discovery = new OpenIdConnectConfiguration
                {
                    Issuer = issuer, AuthorizationEndpoint = issuer + "/authorize", TokenEndpoint = issuer + "/token"
                };
                discovery.SigningKeys.Add(key);
                options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(discovery);
                options.Backchannel = new HttpClient(provider);
            });
        }).Configure(app =>
        {
            // Record rejection without replacing any protocol validation or authentication events.
            app.Use(async (context, next) =>
            {
                try { await next(); }
                catch (AuthenticationFailureException exception) { callbackFailure = exception; context.Response.StatusCode = 401; }
            });
            app.UseRouting(); app.UseAuthentication(); app.UseAuthorization();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapBqAtlasOidc();
                endpoints.MapGet("/test/claims", (HttpContext context) => Results.Json(new
                {
                    name = context.User.Identity!.Name,
                    permissions = context.User.FindAll(Permissions.ClaimType).Select(c => c.Value).ToArray(),
                    issuer = context.User.FindFirst("iss")?.Value
                })).RequireAuthorization();
                endpoints.MapGet("/test/write", () => Results.Ok()).RequirePermission("records.write");
            });
        })).StartAsync();
        using var client = host.GetTestClient();
        client.BaseAddress = new Uri("https://app.test");
        using var challenge = await client.GetAsync("/auth/login");
        Assert.Equal(HttpStatusCode.Redirect, challenge.StatusCode);
        var query = QueryHelpers.ParseQuery(challenge.Headers.Location!.Query);
        Assert.Equal("code", query["response_type"].ToString());
        Assert.Equal("S256", query["code_challenge_method"].ToString());
        Assert.False(string.IsNullOrEmpty(query["nonce"]));
        var claims = new List<Claim>
        {
            new("sub", "reader-1"), new("preferred_username", "reader"),
            new("iat", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture), ClaimValueTypes.Integer64),
            new("role", scenario == "unmapped-role" ? "unknown" : "reader"),
            new(Permissions.ClaimType, "records.write")
        };
        if (scenario != "missing-nonce") claims.Add(new("nonce", scenario == "nonce" ? "wrong" : query["nonce"].ToString()));
        var token = new JwtSecurityToken(scenario == "issuer" ? "https://wrong.test" : issuer,
            scenario == "audience" ? "wrong" : "bqatlas-test", claims,
            DateTime.UtcNow.AddMinutes(-20), DateTime.UtcNow.AddMinutes(scenario == "expired" ? -10 : 5),
            new SigningCredentials(scenario == "signature" ? otherKey : key, SecurityAlgorithms.RsaSha256));
        provider.IdToken = new JwtSecurityTokenHandler().WriteToken(token);
        provider.Challenge = query["code_challenge"].ToString();
        var cookies = challenge.Headers.GetValues("Set-Cookie").Select(c => c.Split(';')[0]);
        if (scenario == "correlation") cookies = cookies.Where(c => !c.Contains(".Correlation."));
        using var callbackRequest = new HttpRequestMessage(HttpMethod.Get,
            QueryHelpers.AddQueryString("/signin-oidc", new Dictionary<string, string?>
            {
                ["code"] = "synthetic-code", ["state"] = scenario == "state" ? "tampered" : query["state"].ToString()
            }));
        callbackRequest.Headers.Add("Cookie", string.Join("; ", cookies));
        using var callback = await client.SendAsync(callbackRequest);
        var responseCookies = callback.Headers.TryGetValues("Set-Cookie", out var values) ? values.ToArray() : [];
        if (scenario is not ("valid" or "unmapped-role"))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, callback.StatusCode);
            Assert.NotNull(callbackFailure);
            var cause = callbackFailure.InnerException;
            switch (scenario)
            {
                case "issuer": Assert.IsAssignableFrom<SecurityTokenInvalidIssuerException>(cause); break;
                case "audience": Assert.IsAssignableFrom<SecurityTokenInvalidAudienceException>(cause); break;
                case "expired": Assert.IsAssignableFrom<SecurityTokenExpiredException>(cause); break;
                case "signature": Assert.IsAssignableFrom<SecurityTokenException>(cause); break;
                case "nonce":
                case "missing-nonce":
                    Assert.IsAssignableFrom<OpenIdConnectProtocolException>(cause);
                    Assert.Contains("nonce", cause!.Message, StringComparison.OrdinalIgnoreCase);
                    break;
                case "state": Assert.Contains("state", cause!.Message, StringComparison.OrdinalIgnoreCase); break;
                case "correlation": Assert.Contains("correlation", cause!.Message, StringComparison.OrdinalIgnoreCase); break;
            }
            Assert.DoesNotContain(responseCookies, c => c.StartsWith("bqatlas.session="));
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/test/claims")).StatusCode);
            Assert.Equal(scenario is "state" or "correlation" ? 0 : 1, provider.Requests);
            return;
        }
        Assert.True(callback.StatusCode == HttpStatusCode.Redirect, callbackFailure?.ToString());
        Assert.Equal(1, provider.Requests);
        Assert.Contains(responseCookies, c => c.StartsWith("bqatlas.session="));
        client.DefaultRequestHeaders.Add("Cookie", string.Join("; ", responseCookies.Select(c => c.Split(';')[0])));
        using var session = await client.GetAsync("/test/claims");
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        using var result = JsonDocument.Parse(await session.Content.ReadAsStringAsync());
        Assert.Equal("reader", result.RootElement.GetProperty("name").GetString());
        Assert.Equal(issuer, result.RootElement.GetProperty("issuer").GetString());
        Assert.Equal(scenario == "valid" ? new[] { "records.read" } : [],
            result.RootElement.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()).ToArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/test/write")).StatusCode);
    }

    private sealed class TokenEndpoint : HttpMessageHandler
    {
        public string IdToken { get; set; } = "";
        public string Challenge { get; set; } = "";
        public int Requests { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests++;
            Assert.Equal("https://issuer.test/token", request.RequestUri!.AbsoluteUri);
            var form = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(cancellationToken));
            Assert.Equal("authorization_code", form["grant_type"].ToString());
            Assert.Equal("synthetic-code", form["code"].ToString());
            Assert.Equal("https://app.test/signin-oidc", form["redirect_uri"].ToString());
            Assert.Equal(Challenge, Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(form["code_verifier"].ToString()))));
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new { id_token = IdToken, access_token = "synthetic-access", token_type = "Bearer", expires_in = 300 }), Encoding.UTF8, "application/json")
            };
        }
    }
}
