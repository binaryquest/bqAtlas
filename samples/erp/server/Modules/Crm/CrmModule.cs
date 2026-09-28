using System.Security.Claims;
using BqAtlas.AspNetCore;
using BqAtlas.Core;
using BqAtlas.OData;
using BqAtlas.Sample.Crm.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OData.ModelBuilder;
namespace BqAtlas.Sample.Crm;

public sealed class CrmModule(Action<DbContextOptionsBuilder> database) : IBqAtlasModule
{
    public ModuleDefinition Definition => new("crm", []);
    public static ResourceDescriptor Resource => new("crm.customers", "Customers", "/api/v1/crm/customers", CrmPermissions.Read,
        [new("code", "Code", Required: true, MaxLength: 32), new("name", "Name", Required: true, MaxLength: 200), new("email", "Email", Type: "email", MaxLength: 254), new("active", "Active", Type: "boolean")], ODataEndpoint: "/odata/v1/crm/Customers");
    public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<CrmDbContext>(database);
        services.AddScoped<CustomerService>();
        services.AddScoped<ICustomerDirectory, CustomerDirectory>();
        services.AddAuthorization(options => options.AddPolicy(CrmPermissions.Read, policy => policy.RequireClaim(Permissions.ClaimType, CrmPermissions.Read)));
    }
    public static Microsoft.OData.Edm.IEdmModel ReadModel()
    {
        var model = new ODataConventionModelBuilder();
        model.EntitySet<CustomerDto>("Customers");
        return model.GetEdmModel();
    }
    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        const string path = "/api/v1/crm/customers";
        endpoints.MapGet(path + "/lookup/{id:guid}", (Guid id, CustomerService service, CancellationToken ct) => ResolveLookup(id, service, ct)).RequirePermission(CrmPermissions.Lookup);
        endpoints.MapPost(path + "/lookup", (QueryRequest query, CustomerService service, CancellationToken ct) => service.LookupAsync(query, ct)).RequirePermission(CrmPermissions.Lookup).VerifyCsrf();
        endpoints.MapPost(path + "/query", (QueryRequest query, CustomerService service, CancellationToken ct) => service.QueryAsync(query, ct)).RequirePermission(CrmPermissions.Read).VerifyCsrf();
        endpoints.MapGet(path + "/{id:guid}", async (Guid id, CustomerService service, HttpContext context, CancellationToken ct) =>
        {
            var result = await service.GetAsync(id, ct);
            if (result is null) return Results.NotFound();
            context.Response.Headers.ETag = '"' + result.Version + '"'; return Results.Ok(result);
        }).RequirePermission(CrmPermissions.Read);
        endpoints.MapPost(path, async (CustomerInput input, CustomerService service, HttpContext context, CancellationToken ct) =>
        {
            var result = (await service.SaveAsync(null, input, null, Actor(context), ct))!;
            context.Response.Headers.ETag = '"' + result.Version + '"'; return Results.Created($"{path}/{result.Data.Id}", result);
        }).RequirePermission(CrmPermissions.Write).RequirePermission(CrmPermissions.Read).VerifyCsrf();
        endpoints.MapPut(path + "/{id:guid}", async (Guid id, CustomerInput input, CustomerService service, HttpContext context, CancellationToken ct) =>
        {
            if (!context.Request.Headers.ContainsKey("If-Match")) return Results.Problem(statusCode: 428, title: "If-Match is required.");
            var result = await service.SaveAsync(id, input, context.Request.Headers.IfMatch, Actor(context), ct);
            if (result is null) return Results.NotFound();
            context.Response.Headers.ETag = '"' + result.Version + '"'; return Results.Ok(result);
        }).RequirePermission(CrmPermissions.Write).RequirePermission(CrmPermissions.Read).VerifyCsrf();
        endpoints.MapDelete(path + "/{id:guid}", async (Guid id, CustomerService service, HttpContext context, CancellationToken ct) =>
        {
            if (!context.Request.Headers.ContainsKey("If-Match")) return Results.Problem(statusCode: 428, title: "If-Match is required.");
            return await service.DeleteAsync(id, context.Request.Headers.IfMatch, ct) ? Results.NoContent() : Results.NotFound();
        }).RequirePermission(CrmPermissions.Delete).RequirePermission(CrmPermissions.Read).VerifyCsrf();
    }
    private static async Task<IResult> ResolveLookup(Guid id, CustomerService service, CancellationToken ct)
    {
        var record = await service.ResolveLookupAsync(id, ct);
        return record is null ? Results.Content("null", "application/json") : Results.Json(record);
    }
    private static string Actor(HttpContext context) => Actors.GetId(context.User);
}
[Authorize(Policy = CrmPermissions.Read)]
public sealed class CustomersController(CrmDbContext db) : ODataController
{
    [ReadOnlyQuery]
    public IQueryable<CustomerDto> Get() => db.Customers.AsNoTracking().Select(c => new CustomerDto { Id = c.Id, Code = c.Code, Name = c.Name, Email = c.Email, Active = c.Active, ModifiedAt = c.ModifiedAt });
}
