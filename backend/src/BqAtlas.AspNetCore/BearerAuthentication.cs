using System.Security.Claims;
using BqAtlas.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BqAtlas.AspNetCore;

public static class BqAtlasBearerAuthentication
{
    public const string Scheme = "BqAtlas.ApiBearer";
    public const string Selector = "BqAtlas.ApiOrBrowser";
    public static bool IsApiPath(PathString path) => path.StartsWithSegments("/api") || path.StartsWithSegments("/odata");

    /// <summary>Optional API access tokens. Browser and authentication routes retain their cookie scheme.</summary>
    public static IServiceCollection AddBqAtlasBearer(this IServiceCollection services, IConfiguration configuration, string browserScheme)
    {
        var section = configuration.GetSection("Authentication:Bearer");
        if (!section.GetValue<bool>("Enabled")) return services;
        var authority = section["Authority"];
        var audience = section["Audience"];
        if (string.IsNullOrWhiteSpace(authority) || string.IsNullOrWhiteSpace(audience))
            throw new InvalidOperationException("Bearer Authority and Audience are required when API bearer authentication is enabled.");
        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = Selector;
            options.DefaultChallengeScheme = Selector;
            options.DefaultForbidScheme = Selector;
        }).AddPolicyScheme(Selector, null, options =>
        {
            options.ForwardDefaultSelector = context => IsApiPath(context.Request.Path) && context.Request.Headers.ContainsKey("Authorization") ? Scheme : browserScheme;
        }).AddJwtBearer(Scheme, options =>
        {
            options.Authority = authority;
            options.Audience = audience;
            options.MapInboundClaims = false;
            options.RequireHttpsMetadata = section.GetValue("RequireHttpsMetadata", true);
            options.TokenValidationParameters.ValidateIssuer = true;
            options.TokenValidationParameters.ValidateAudience = true;
            options.TokenValidationParameters.ValidateLifetime = true;
            options.TokenValidationParameters.RequireSignedTokens = true;
            options.TokenValidationParameters.ClockSkew = TimeSpan.FromSeconds(30);
            options.Events.OnTokenValidated = context =>
            {
                var identity = (ClaimsIdentity)context.Principal!.Identity!;
                if (string.IsNullOrWhiteSpace(identity.FindFirst("sub")?.Value))
                {
                    context.Fail("API tokens require a subject."); return Task.CompletedTask;
                }
                // Only explicitly mapped API scopes grant permissions. A token's arbitrary
                // permission/role claims never become application permissions by themselves.
                foreach (var claim in identity.FindAll(Permissions.ClaimType).ToArray()) identity.RemoveClaim(claim);
                var scopes = identity.FindAll("scope").Concat(identity.FindAll("scp")).SelectMany(c => c.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries)).Distinct(StringComparer.Ordinal).ToArray();
                foreach (var scope in scopes)
                    foreach (var permission in section.GetSection("ScopePermissions").GetChildren().Where(entry => entry.Key == scope).SelectMany(entry => entry.Get<string[]>() ?? []))
                        identity.AddClaim(new Claim(Permissions.ClaimType, permission));
                return Task.CompletedTask;
            };
        });
        return services;
    }
}
