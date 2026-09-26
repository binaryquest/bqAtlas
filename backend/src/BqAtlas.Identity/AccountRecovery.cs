using System.Text.Json;
using BqAtlas.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace BqAtlas.Identity;

public sealed record AccountEmail(string Recipient, string Subject, string ActionUrl);
public interface IAccountEmailSender
{
    bool Available { get; }
    Task SendAsync(AccountEmail message, CancellationToken ct);
}
public sealed class UnconfiguredAccountEmailSender : IAccountEmailSender
{
    public bool Available => false;
    public Task SendAsync(AccountEmail message, CancellationToken ct) => throw new InvalidOperationException("Configure an account email sender.");
}
public sealed class DevelopmentAccountEmailSender(IHostEnvironment environment) : IAccountEmailSender
{
    public bool Available => environment.IsDevelopment();
    public async Task SendAsync(AccountEmail message, CancellationToken ct)
    {
        if (!Available) throw new InvalidOperationException("Development mail is not available in this environment.");
        var directory = Path.Combine(environment.ContentRootPath, ".local-mail");
        if (OperatingSystem.IsWindows()) Directory.CreateDirectory(directory);
        else Directory.CreateDirectory(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Options = FileOptions.Asynchronous };
        if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        await using var stream = new FileStream(Path.Combine(directory, Guid.NewGuid().ToString("N") + ".json"), options);
        await JsonSerializer.SerializeAsync(stream, message, cancellationToken: ct);
    }
}
public sealed record AccountEmailRequest(string Email);
public sealed record ResetPasswordRequest(string UserId, string Token, string NewPassword);
public sealed record ConfirmEmailRequest(string UserId, string Token);

public static class AccountRecovery
{
    public static IServiceCollection AddBqAtlasAccountEmail(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        if (environment.IsDevelopment() && configuration.GetValue<bool>("Identity:DevelopmentEmail"))
            services.TryAddSingleton<IAccountEmailSender, DevelopmentAccountEmailSender>();
        else services.TryAddSingleton<IAccountEmailSender, UnconfiguredAccountEmailSender>();
        return services;
    }
    private static string? PublicOrigin(IConfiguration configuration, IHostEnvironment environment)
    {
        if (!Uri.TryCreate(configuration["Identity:PublicOrigin"], UriKind.Absolute, out var origin) ||
            !string.IsNullOrEmpty(origin.UserInfo) || origin.AbsolutePath != "/" || !string.IsNullOrEmpty(origin.Query) || !string.IsNullOrEmpty(origin.Fragment) ||
            (origin.Scheme != "https" && !(environment.IsDevelopment() && origin.Scheme == "http" && origin.IsLoopback)))
            return null;
        return origin.GetLeftPart(UriPartial.Authority);
    }
    public static void MapBqAtlasAccountRecovery(this IEndpointRouteBuilder endpoints)
    {
        foreach (var confirmation in new[] { false, true })
        {
            endpoints.MapPost(confirmation ? "/auth/request-confirmation" : "/auth/request-password-reset", async (AccountEmailRequest request, UserManager<AtlasUser> users, IAccountEmailSender sender, IConfiguration configuration, IHostEnvironment environment, CancellationToken ct) =>
            {
                var origin = PublicOrigin(configuration, environment);
                if (!sender.Available || origin is null) return Results.Problem(statusCode: 503, title: "Account email is not configured.");
                if (string.IsNullOrWhiteSpace(request.Email) || request.Email.Length > 254) return Results.Accepted(value: new { message = "If the account is eligible, an email has been sent." });
                var user = await users.FindByEmailAsync(request.Email);
                if (user is not null && (confirmation ? !user.EmailConfirmed : user.EmailConfirmed))
                {
                    var token = confirmation ? await users.GenerateEmailConfirmationTokenAsync(user) : await users.GeneratePasswordResetTokenAsync(user);
                    await sender.SendAsync(new AccountEmail(user.Email!, confirmation ? "Confirm your email" : "Reset your password", origin + "/?accountAction=" + (confirmation ? "confirm" : "reset") + "&userId=" + Uri.EscapeDataString(user.Id) + "&token=" + Uri.EscapeDataString(token)), ct);
                }
                // Never reveal whether an address exists, is confirmed, or received mail.
                return Results.Accepted(value: new { message = "If the account is eligible, an email has been sent." });
            }).AllowAnonymous().VerifyCsrf().RequireRateLimiting("login");
        }
        endpoints.MapPost("/auth/reset-password", async (ResetPasswordRequest request, UserManager<AtlasUser> users, SignInManager<AtlasUser> signIn) =>
        {
            if (string.IsNullOrWhiteSpace(request.UserId) || string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrEmpty(request.NewPassword) || request.NewPassword.Length > 1024 || request.Token.Length > 8192 || request.UserId.Length > 256) return InvalidReset();
            var user = await users.FindByIdAsync(request.UserId);
            if (user is null || !user.EmailConfirmed) return InvalidReset();
            var result = await users.ResetPasswordAsync(user, request.Token, request.NewPassword);
            if (!result.Succeeded) return InvalidReset();
            await signIn.SignOutAsync();
            return Results.NoContent();
        }).AllowAnonymous().VerifyCsrf().RequireRateLimiting("login");
        endpoints.MapPost("/auth/confirm-email", async (ConfirmEmailRequest request, UserManager<AtlasUser> users) =>
        {
            if (string.IsNullOrWhiteSpace(request.UserId) || string.IsNullOrWhiteSpace(request.Token)) return InvalidConfirmation();
            var user = await users.FindByIdAsync(request.UserId);
            if (user is null) return InvalidConfirmation();
            var result = await users.ConfirmEmailAsync(user, request.Token);
            return result.Succeeded ? Results.NoContent() : InvalidConfirmation();
        }).AllowAnonymous().VerifyCsrf().RequireRateLimiting("login");
    }
    private static IResult InvalidReset() => Results.Problem(statusCode: 400, title: "Unable to reset password. Check the link and password requirements.");
    private static IResult InvalidConfirmation() => Results.Problem(statusCode: 400, title: "Unable to confirm email. Request a new confirmation link.");
}
