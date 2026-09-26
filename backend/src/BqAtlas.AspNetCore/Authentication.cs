using System.Security.Claims;
using System.Text.Json;
using BqAtlas.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
namespace BqAtlas.AspNetCore;

public static class BqAtlasAuthentication
{
    public const string CookieScheme = "BqAtlas";
    public static IServiceCollection AddBqAtlasOidc(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetRequiredSection("Authentication:Oidc");
        services.AddAuthentication(options =>
        {
            options.DefaultScheme = CookieScheme;
            // API calls return 401; only /auth/login starts the redirect flow.
            options.DefaultChallengeScheme = CookieScheme;
        }).AddCookie(CookieScheme, ConfigureCookie).AddOpenIdConnect("oidc", options =>
        {
            options.Authority = section["Authority"] ?? throw new InvalidOperationException("OIDC Authority is required.");
            options.ClientId = section["ClientId"] ?? throw new InvalidOperationException("OIDC ClientId is required.");
            options.ClientSecret = section["ClientSecret"];
            options.ResponseType = "code";
            options.UsePkce = true;
            options.SaveTokens = false;
            options.MapInboundClaims = false;
            options.GetClaimsFromUserInfoEndpoint = false;
            options.RequireHttpsMetadata = section.GetValue("RequireHttpsMetadata", true);
            options.TokenValidationParameters.NameClaimType = "preferred_username";
            options.TokenValidationParameters.RoleClaimType = "role";
            options.Scope.Add("profile");
            // OIDC removes protocol claims by default. Actor IDs require the validated
            // issuer as well as subject so equal subjects from different providers differ.
            options.ClaimActions.Remove("iss");
            options.Events.OnRedirectToIdentityProviderForSignOut = context =>
            {
                // Tokens are not retained in the cookie. Identify the client explicitly
                // so the provider can validate the registered post-logout callback.
                context.ProtocolMessage.ClientId = context.Options.ClientId;
                return Task.CompletedTask;
            };
            options.Events.OnTokenValidated = context =>
            {
                var identity = (ClaimsIdentity)context.Principal!.Identity!;
                foreach (var claim in identity.FindAll(Permissions.ClaimType).ToArray()) identity.RemoveClaim(claim);
                var roles = identity.FindAll("role").Concat(identity.FindAll("roles")).Select(c => c.Value).ToHashSet(StringComparer.Ordinal);
                if (identity.FindFirst("realm_access")?.Value is { } realm)
                {
                    using var json = JsonDocument.Parse(realm);
                    if (json.RootElement.TryGetProperty("roles", out var values))
                        foreach (var value in values.EnumerateArray()) if (value.GetString() is { } role) roles.Add(role);
                }
                foreach (var role in roles)
                    foreach (var permission in configuration.GetSection($"Authentication:RolePermissions:{role}").Get<string[]>() ?? [])
                        identity.AddClaim(new Claim(Permissions.ClaimType, permission));
                return Task.CompletedTask;
            };
        });
        return services;
    }
    public static void ConfigureCookie(CookieAuthenticationOptions options)
    {
        options.Cookie.Name = "bqatlas.session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
    }
    public static void MapBqAtlasOidc(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/auth/login", () => Results.Challenge(new AuthenticationProperties { RedirectUri = "/" }, ["oidc"])).AllowAnonymous();
        endpoints.MapPost("/auth/logout", () => Results.SignOut(new AuthenticationProperties { RedirectUri = "/" }, [CookieScheme, "oidc"]))
            .RequireAuthorization().VerifyCsrf();
    }
}
