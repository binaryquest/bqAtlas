using System.Security.Claims;
using System.Text.Json;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Xunit;

namespace BqAtlas.Tests;

public class OidcTests
{
    [Fact]
    public async Task ValidatedIssuerSurvivesClaimActionsAndTokenFreeLogoutIdentifiesClient()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:Oidc:Authority"] = "https://identity.example/realms/test",
            ["Authentication:Oidc:ClientId"] = "bqatlas"
        }).Build();
        var services = new ServiceCollection();
        services.AddLogging(); services.AddBqAtlasOidc(configuration);
        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptionsMonitor<OpenIdConnectOptions>>().Get("oidc");
        using var json = JsonDocument.Parse("""{"iss":"https://identity.example/realms/test","sub":"123"}""");
        var identity = new ClaimsIdentity([new Claim("iss", "https://identity.example/realms/test"), new Claim("sub", "123")], "oidc");
        var actor = Actors.GetId(new ClaimsPrincipal(identity));
        foreach (var action in options.ClaimActions) action.Run(json.RootElement, identity, "https://identity.example/realms/test");
        Assert.Equal(actor, Actors.GetId(new ClaimsPrincipal(identity)));
        Assert.False(options.SaveTokens);
        var context = new RedirectContext(new DefaultHttpContext(), new AuthenticationScheme("oidc", null, typeof(OpenIdConnectHandler)), options, new AuthenticationProperties())
        {
            ProtocolMessage = new OpenIdConnectMessage()
        };
        await options.Events.OnRedirectToIdentityProviderForSignOut(context);
        Assert.Equal("bqatlas", context.ProtocolMessage.ClientId);
        Assert.Null(context.ProtocolMessage.IdTokenHint);
    }
}
