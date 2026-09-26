using System.Security.Claims;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection.Extensions;
namespace BqAtlas.Identity;

public sealed class AtlasUser : IdentityUser { }
public sealed class AtlasIdentityDbContext(DbContextOptions<AtlasIdentityDbContext> options) : IdentityDbContext<AtlasUser>(options)
{
    protected override void OnModelCreating(ModelBuilder builder) { base.OnModelCreating(builder); builder.HasDefaultSchema("identity"); }
}
public sealed record LoginRequest(string Email, string Password);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public static class LocalIdentity
{
    public static IServiceCollection AddBqAtlasIdentity(this IServiceCollection services, Action<DbContextOptionsBuilder> database)
    {
        services.AddDbContext<AtlasIdentityDbContext>(database);
        services.TryAddSingleton<IAccountEmailSender>(provider =>
        {
            var environment = provider.GetRequiredService<IHostEnvironment>();
            var configuration = provider.GetRequiredService<IConfiguration>();
            return environment.IsDevelopment() && configuration.GetValue<bool>("Identity:DevelopmentEmail")
                ? new DevelopmentAccountEmailSender(environment) : new UnconfiguredAccountEmailSender();
        });
        services.AddIdentity<AtlasUser, IdentityRole>(options =>
        {
            options.User.RequireUniqueEmail = true;
            options.SignIn.RequireConfirmedEmail = true;
            options.Password.RequiredLength = 12;
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        }).AddEntityFrameworkStores<AtlasIdentityDbContext>().AddDefaultTokenProviders();
        services.ConfigureApplicationCookie(BqAtlasAuthentication.ConfigureCookie);
        return services;
    }
    public static void MapBqAtlasIdentity(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapBqAtlasAccountRecovery();
        endpoints.MapPost("/auth/login", async (LoginRequest request, SignInManager<AtlasUser> signIn, UserManager<AtlasUser> users) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || request.Password is null || request.Email.Length > 254 || request.Password.Length > 1024)
                return Results.Problem(statusCode: 400, title: "Email and password are required.");
            var user = await users.FindByEmailAsync(request.Email);
            // Run the password hasher for absent accounts to avoid a cheap account-existence timing signal.
            if (user is null)
            {
                _ = users.PasswordHasher.HashPassword(new AtlasUser(), request.Password);
                return Results.Problem(statusCode: 401, title: "Unable to sign in.");
            }
            var result = await signIn.PasswordSignInAsync(user, request.Password, isPersistent: false, lockoutOnFailure: true);
            return result.Succeeded ? Results.NoContent() : Results.Problem(statusCode: 401, title: "Unable to sign in.");
        }).AllowAnonymous().VerifyCsrf().RequireRateLimiting("login");
        endpoints.MapPost("/auth/change-password", async (ChangePasswordRequest request, HttpContext context, UserManager<AtlasUser> users, SignInManager<AtlasUser> signIn) =>
        {
            if (string.IsNullOrEmpty(request.CurrentPassword) || string.IsNullOrEmpty(request.NewPassword))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["newPassword"] = ["Current and new passwords are required."] });
            var user = await users.GetUserAsync(context.User);
            if (user is null) return Results.Unauthorized();
            var result = await users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
            if (!result.Succeeded)
                return Results.ValidationProblem(result.Errors.GroupBy(error => error.Code == "PasswordMismatch" ? "currentPassword" : "newPassword").ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray()));
            // Identity updates the security stamp. This browser must authenticate again;
            // other sessions are checked by the configured Identity stamp validator.
            await signIn.SignOutAsync();
            return Results.NoContent();
        }).RequireAuthorization().VerifyCsrf().RequireRateLimiting("login");
        endpoints.MapPost("/auth/logout", async (SignInManager<AtlasUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        }).RequireAuthorization().VerifyCsrf();
    }
    public static async Task GrantDevelopmentPermissionsAsync(this IServiceProvider services, IConfiguration configuration, IHostEnvironment environment, IEnumerable<string> permissions)
    {
        if (!environment.IsDevelopment()) throw new InvalidOperationException("Development permission grants cannot run outside Development.");
        var email = configuration["Bootstrap:Email"] ?? throw new InvalidOperationException("Bootstrap:Email identifies the development account.");
        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AtlasUser>>();
        var user = await users.FindByEmailAsync(email) ?? throw new InvalidOperationException("Create the development account before granting permissions.");
        var existing = (await users.GetClaimsAsync(user)).Where(c => c.Type == Permissions.ClaimType).Select(c => c.Value).ToHashSet(StringComparer.Ordinal);
        var result = await users.AddClaimsAsync(user, permissions.Distinct().Where(p => !existing.Contains(p)).Select(p => new Claim(Permissions.ClaimType, p)));
        if (!result.Succeeded) throw new InvalidOperationException("Unable to update development permissions.");
        var stamp = await users.UpdateSecurityStampAsync(user);
        if (!stamp.Succeeded) throw new InvalidOperationException("Unable to invalidate the old development session.");
    }
    public static async Task BootstrapDevelopmentUserAsync(this IServiceProvider services, IConfiguration configuration, IHostEnvironment environment, IEnumerable<string> permissions)
    {
        var email = configuration["Bootstrap:Email"];
        var password = configuration["Bootstrap:Password"];
        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(password)) return;
        if (!environment.IsDevelopment()) throw new InvalidOperationException("The bootstrap account is only available in Development.");
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) throw new InvalidOperationException("Set both Bootstrap:Email and Bootstrap:Password.");
        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AtlasUser>>();
        var user = await users.FindByEmailAsync(email);
        if (user is not null) return; // Never reset passwords or elevate an existing account on startup.
        user = new AtlasUser { UserName = email, Email = email, EmailConfirmed = true };
        var created = await users.CreateAsync(user, password);
        if (!created.Succeeded) throw new InvalidOperationException(string.Join("; ", created.Errors.Select(e => e.Description)));
        var claimed = await users.AddClaimsAsync(user, permissions.Distinct().Select(p => new Claim(Permissions.ClaimType, p)));
        if (!claimed.Succeeded) throw new InvalidOperationException("Unable to assign bootstrap permissions.");
    }
}
