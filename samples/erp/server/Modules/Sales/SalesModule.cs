using BqAtlas.AspNetCore;
using BqAtlas.Core;
using BqAtlas.Sample.Sales.Contracts;
using BqAtlas.Sample.Crm.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
namespace BqAtlas.Sample.Sales;

public static class SalesPermissions
{
    public const string Read = "sales.quotes.read";
    public const string Write = "sales.quotes.write";
    public const string Delete = "sales.quotes.delete";
    public const string Submit = "sales.quotes.submit";
    public static readonly string[] All = [Read, Write, Delete, Submit];
}
public sealed class SalesModule(Action<DbContextOptionsBuilder> database) : IBqAtlasModule
{
    public ModuleDefinition Definition => new("sales", ["crm"]);
    public static ResourceDescriptor Resource => new("sales.quotes", "Sales quotes", "/api/v1/sales/quotes", SalesPermissions.Read,
        [new("number", "Quote", ReadOnly: true), new("customerId", "Customer", "reference", Required: true), new("date", "Date", "date", Required: true), new("currency", "Currency", "enum", Options: QuoteRules.Currencies), new("status", "Status", ReadOnly: true), new("total", "Total", "decimal", ReadOnly: true)]);
    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<SalesDbContext>(database); services.AddScoped<QuoteService>();
    }
    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        const string path = "/api/v1/sales/quotes";
        endpoints.MapPost(path + "/query", (QueryRequest request, QuoteService service, CancellationToken ct) => service.QueryAsync(request, ct)).RequirePermission(SalesPermissions.Read).VerifyCsrf();
        endpoints.MapGet(path + "/{id:guid}", async (Guid id, QuoteService service, HttpContext context, CancellationToken ct) => Result(await service.GetAsync(id, ct), context)).RequirePermission(SalesPermissions.Read);
        endpoints.MapPost(path, async (QuoteInput input, QuoteService service, HttpContext context, CancellationToken ct) => Result(await service.SaveAsync(null, input, null, Actors.GetId(context.User), ct), context, true)).RequirePermission(SalesPermissions.Write).RequirePermission(SalesPermissions.Read).RequirePermission(CustomerAccess.Lookup).VerifyCsrf();
        endpoints.MapPut(path + "/{id:guid}", async (Guid id, QuoteInput input, QuoteService service, HttpContext context, CancellationToken ct) =>
        {
            if (!context.Request.Headers.ContainsKey("If-Match")) return Precondition();
            return Result(await service.SaveAsync(id, input, context.Request.Headers.IfMatch, Actors.GetId(context.User), ct), context);
        }).RequirePermission(SalesPermissions.Write).RequirePermission(SalesPermissions.Read).RequirePermission(CustomerAccess.Lookup).VerifyCsrf();
        endpoints.MapDelete(path + "/{id:guid}", async (Guid id, QuoteService service, HttpContext context, CancellationToken ct) =>
        {
            if (!context.Request.Headers.ContainsKey("If-Match")) return Precondition();
            return await service.DeleteAsync(id, context.Request.Headers.IfMatch, Actors.GetId(context.User), ct) ? Results.NoContent() : Results.NotFound();
        }).RequirePermission(SalesPermissions.Delete).RequirePermission(SalesPermissions.Read).VerifyCsrf();
        endpoints.MapPost(path + "/{id:guid}/submit", async (Guid id, QuoteService service, HttpContext context, CancellationToken ct) =>
        {
            if (!context.Request.Headers.ContainsKey("If-Match")) return Precondition();
            return Result(await service.SubmitAsync(id, context.Request.Headers.IfMatch, context.Request.Headers["Idempotency-Key"], Actors.GetId(context.User), ct), context);
        }).RequirePermission(SalesPermissions.Submit).RequirePermission(SalesPermissions.Read).VerifyCsrf();
    }
    private static IResult Precondition() => Results.Problem(statusCode: 428, title: "If-Match is required.");
    private static IResult Result(RecordResult<QuoteDto>? record, HttpContext context, bool created = false)
    {
        if (record is null) return Results.NotFound();
        var draft = record.Data.Status == "draft";
        record = record with { Capabilities = new(draft && Permissions.Has(context.User, SalesPermissions.Write) && Permissions.Has(context.User, CustomerAccess.Lookup), draft && Permissions.Has(context.User, SalesPermissions.Delete), draft && Permissions.Has(context.User, SalesPermissions.Submit) ? ["submit"] : []) };
        context.Response.Headers.ETag = '"' + record.Version + '"';
        return created ? Results.Created($"/api/v1/sales/quotes/{record.Data.Id}", record) : Results.Ok(record);
    }
}
