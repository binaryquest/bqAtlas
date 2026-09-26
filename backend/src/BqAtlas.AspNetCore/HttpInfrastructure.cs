using BqAtlas.Core;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
namespace BqAtlas.AspNetCore;

public sealed class BqAtlasExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        switch (exception)
        {
            case BadHttpRequestException request when request.StatusCode is >= 400 and < 500:
                await Results.Problem(statusCode: request.StatusCode, title: "Invalid request.", extensions: new Dictionary<string, object?> { ["code"] = "invalid_request" }).ExecuteAsync(context);
                return true;
            case ResourceValidationException validation:
                await Results.ValidationProblem(validation.Errors.ToDictionary(), title: "Validation failed", extensions: new Dictionary<string, object?> { ["code"] = "validation_failed" }).ExecuteAsync(context);
                return true;
            case BusinessConflictException conflict:
                await Results.Problem(statusCode: 409, title: conflict.Message, extensions: new Dictionary<string, object?> { ["code"] = conflict.Code }).ExecuteAsync(context);
                return true;
            case VersionConflictException:
                await Results.Problem(statusCode: 412, title: "Record changed", detail: exception.Message, extensions: new Dictionary<string, object?> { ["code"] = "version_conflict" }).ExecuteAsync(context);
                return true;
            default: return false;
        }
    }
}
public sealed class CsrfFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (BqAtlasBearerAuthentication.IsApiPath(http.Request.Path) && http.Request.Headers.ContainsKey("Authorization"))
        {
            var schemes = http.RequestServices.GetRequiredService<IAuthenticationSchemeProvider>();
            if (await schemes.GetSchemeAsync(BqAtlasBearerAuthentication.Scheme) is not null &&
                (await http.AuthenticateAsync(BqAtlasBearerAuthentication.Scheme)).Succeeded)
                return await next(context);
        }
        try { await http.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(http); }
        catch (AntiforgeryValidationException) { return Results.Problem(statusCode: 400, title: "Invalid request verification token", extensions: new Dictionary<string, object?> { ["code"] = "csrf_failed" }); }
        return await next(context);
    }
}
public static class BqAtlasHttp
{
    public static IServiceCollection AddBqAtlasHttp(this IServiceCollection services, BqAtlasRegistry registry)
    {
        services.AddSingleton(registry);
        services.AddProblemDetails();
        services.AddExceptionHandler<BqAtlasExceptionHandler>();
        services.AddAntiforgery(options => { options.HeaderName = "X-BQATLAS-CSRF"; options.Cookie.Name = "bqatlas.csrf"; });
        services.AddAuthorization();
        services.AddHttpContextAccessor();
        return services;
    }
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder endpoint, string permission) => endpoint.RequireAuthorization(policy => policy.RequireAssertion(context => Permissions.Has(context.User, permission)));
    public static RouteHandlerBuilder VerifyCsrf(this RouteHandlerBuilder endpoint) => endpoint.AddEndpointFilter<CsrfFilter>();
    public static void MapBqAtlas(this IEndpointRouteBuilder app, string authMode)
    {
        app.MapGet("/api/v1/session", (HttpContext context) => Results.Ok(new SessionInfo(context.User.Identity?.IsAuthenticated == true, context.User.Identity?.IsAuthenticated == true ? Actors.GetId(context.User) : null, context.User.Identity?.Name, Permissions.Get(context.User), authMode))).AllowAnonymous();
        app.MapGet("/api/v1/session/csrf", (HttpContext context, IAntiforgery antiforgery) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { token = antiforgery.GetAndStoreTokens(context).RequestToken });
        }).AllowAnonymous();
        app.MapGet("/api/v1/manifest", (HttpContext context, BqAtlasRegistry registry) => Results.Ok(new ApplicationManifest("1.0", registry.ModuleIds, registry.Resources.Where(x => Permissions.Has(context.User, x.ReadPermission)).ToArray()))).RequireAuthorization();
    }
}
