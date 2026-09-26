using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Xunit;
namespace BqAtlas.IntegrationTests;

public class BearerTests
{
    [Fact]
    public async Task RealBearerMiddlewareValidatesTokensMapsScopesAndKeepsCookieCsrf()
    {
        var key = new SymmetricSecurityKey(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>
        {
            ["Authentication:Bearer:Enabled"]="true", ["Authentication:Bearer:Authority"]="https://issuer.test",
            ["Authentication:Bearer:Audience"]="erp-api", ["Authentication:Bearer:ScopePermissions:api.write:0"]="records.write"
        }).Build();
        using var host = await new HostBuilder().ConfigureWebHost(web => web.UseTestServer().ConfigureServices(services =>
        {
            services.AddRouting(); services.AddBqAtlasHttp(new BqAtlasRegistry());
            services.AddAuthentication("browser").AddCookie("browser", BqAtlasAuthentication.ConfigureCookie);
            services.AddBqAtlasBearer(configuration,"browser");
            services.PostConfigure<JwtBearerOptions>(BqAtlasBearerAuthentication.Scheme, options =>
            {
                options.Configuration = new OpenIdConnectConfiguration { Issuer="https://issuer.test" };
                options.Configuration.SigningKeys.Add(key);
                options.ConfigurationManager = new Microsoft.IdentityModel.Protocols.StaticConfigurationManager<OpenIdConnectConfiguration>(options.Configuration);
            });
        }).Configure(app =>
        {
            app.UseRouting();app.UseAuthentication();app.UseAuthorization();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapPost("/api/write", (HttpContext context) => Results.Ok(Actors.GetId(context.User))).RequirePermission("records.write").VerifyCsrf();
                endpoints.MapPost("/auth/account", () => Results.Ok()).RequireAuthorization().VerifyCsrf();
                endpoints.MapGet("/test-cookie", () => Results.SignIn(new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier,"local"),new Claim(Permissions.ClaimType,"records.write")],"browser")),authenticationScheme:"browser"));
            });
        })).StartAsync();
        string Token(string issuer="https://issuer.test",string audience="erp-api",string scope="api.write",bool expired=false,bool subject=true,SecurityKey? signingKey=null)
        {
            var claims = new List<Claim> { new("scope",scope), new(Permissions.ClaimType,"records.write") };
            if(subject)claims.Add(new("sub","api-client"));
            return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(issuer,audience,claims,DateTime.UtcNow.AddMinutes(-10),DateTime.UtcNow.AddMinutes(expired?-2:5),new SigningCredentials(signingKey??key,SecurityAlgorithms.HmacSha256)));
        }
        using var client=host.GetTestClient();
        async Task<HttpStatusCode> Send(string token,string path="/api/write")
        {
            using var request=new HttpRequestMessage(HttpMethod.Post,path);request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
            using var response=await client.SendAsync(request);return response.StatusCode;
        }
        Assert.Equal(HttpStatusCode.OK,await Send(Token()));
        Assert.Equal(HttpStatusCode.Forbidden,await Send(Token(scope:"unmapped")));
        Assert.Equal(HttpStatusCode.Unauthorized,await Send(Token(issuer:"https://wrong.test")));
        Assert.Equal(HttpStatusCode.Unauthorized,await Send(Token(audience:"wrong")));
        Assert.Equal(HttpStatusCode.Unauthorized,await Send(Token(expired:true)));
        Assert.Equal(HttpStatusCode.Unauthorized,await Send(Token(subject:false)));
        Assert.Equal(HttpStatusCode.Unauthorized,await Send(Token(signingKey:new SymmetricSecurityKey(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)))));
        Assert.Equal(HttpStatusCode.Unauthorized,await Send(Token(),"/auth/account"));
        var cookie=await client.GetAsync("/test-cookie");
        client.DefaultRequestHeaders.Add("Cookie",string.Join("; ",cookie.Headers.GetValues("Set-Cookie").Select(value=>value.Split(';')[0])));
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsync("/api/write",null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,await Send("invalid"));
        Assert.Equal(HttpStatusCode.BadRequest,await Send(Token(),"/auth/account"));
    }
}
