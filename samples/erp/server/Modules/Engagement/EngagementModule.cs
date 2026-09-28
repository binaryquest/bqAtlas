using BqAtlas.AspNetCore;
using BqAtlas.Core;
using BqAtlas.EntityFrameworkCore;
using BqAtlas.Sample.Crm.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
namespace BqAtlas.Sample.Engagement;

public sealed class EngagementModule(Action<DbContextOptionsBuilder> database) : IBqAtlasModule
{
    public ModuleDefinition Definition => new("engagement", ["crm"]);
    public static readonly string[] AllPermissions = [..new[]{"products","opportunities","activities"}.SelectMany(x => new[]{"read","write","delete"}.Select(p => $"engagement.{x}.{p}"))];
    public static readonly ResourceDescriptor[] Resources = [
        new("engagement.products", "Products", "/api/v1/engagement/products", "engagement.products.read", [new("code","SKU",Required:true,MaxLength:32),new("name","Product",Required:true,MaxLength:200),new("category","Category","enum",true,Options:["Stock","Service"]),new("unitPrice","Unit price","decimal",true,Scale:4,Maximum:"1000000000"),new("currency","Currency","enum",true,Options:["USD","EUR","BDT"]),new("active","Active","boolean")]),
        new("engagement.opportunities", "Pipeline", "/api/v1/engagement/opportunities", "engagement.opportunities.read", [new("name","Opportunity",Required:true,MaxLength:200),new("customerId","Customer",Required:true),new("stage","Stage","enum",true,Options:["Lead","Qualified","Proposal","Won","Lost"]),new("amount","Expected value","decimal",true,Scale:2,Maximum:"1000000000"),new("currency","Currency","enum",true,Options:["USD","EUR","BDT"]),new("expectedClose","Expected close","date",true),new("owner","Owner",Required:true,MaxLength:100),new("notes","Notes",MaxLength:2000)]),
        new("engagement.activities", "Activities", "/api/v1/engagement/activities", "engagement.activities.read", [new("name","Subject",Required:true,MaxLength:200),new("customerId","Customer",Required:true),new("kind","Type","enum",true,Options:["Call","Email","Meeting","Task"]),new("dueDate","Due date","date",true),new("status","Status","enum",true,Options:["Planned","Done","Cancelled"]),new("owner","Owner",Required:true,MaxLength:100),new("notes","Notes",MaxLength:2000)])];
    public void ConfigureServices(IServiceCollection services, IConfiguration configuration) => services.AddDbContext<EngagementDbContext>(database);
    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        Map<Product,ProductInput>(endpoints, Resources[0], EngagementRules.Apply);
        Map<Opportunity,OpportunityInput>(endpoints, Resources[1], EngagementRules.Apply);
        Map<Activity,ActivityInput>(endpoints, Resources[2], EngagementRules.Apply);
    }
    static void Map<T,TInput>(IEndpointRouteBuilder endpoints, ResourceDescriptor resource, Action<TInput,T> apply) where T : EngagementRecord, new()
    {
        var path = resource.Endpoint; var permission = resource.Id;
        var fields = resource.Fields.Where(x => x.Type != "decimal").ToDictionary(x => x.Name, x => char.ToUpperInvariant(x.Name[0]) + x.Name[1..]);
        async Task<PageResult<T>> Query(QueryRequest request, EngagementDbContext db, CancellationToken ct)
        {
            QueryRules.Validate(request, fields.Keys.ToHashSet());
            var query = db.Set<T>().AsNoTracking();
            var text = request.Search.Trim().ToUpperInvariant();
            if(text.Length > 0) query = query.Where(x => x.SearchName.Contains(text));
            foreach(var filter in request.Filters ?? [])
            {
                if(filter.Field != "customerId" || filter.Operator != "eq" || !Guid.TryParse(filter.Value, out var customerId)) EngagementRules.Fail("filters", "Only customerId eq is supported.");
                query = query.Where(x => EF.Property<Guid>(x,"CustomerId") == Guid.Parse(filter.Value));
            }
            IOrderedQueryable<T>? ordered = null;
            foreach(var sort in request.Sort ?? [])
            {
                var property = fields[sort.Field];
                ordered = ordered is null ? (sort.Direction == "asc" ? query.OrderBy(x => EF.Property<object>(x,property)) : query.OrderByDescending(x => EF.Property<object>(x,property))) : (sort.Direction == "asc" ? ordered.ThenBy(x => EF.Property<object>(x,property)) : ordered.ThenByDescending(x => EF.Property<object>(x,property)));
            }
            var total = await query.LongCountAsync(ct);
            var items = await (ordered ?? query.OrderBy(x => x.Name)).ThenBy(x => x.Id).Skip(request.Page * request.PageSize).Take(request.PageSize).ToListAsync(ct);
            return new(items,total,request.Page,request.PageSize);
        }
        endpoints.MapPost(path + "/query", Query).RequirePermission(resource.ReadPermission).VerifyCsrf();
        // Product selection is read-authorized and uses the same projection as its catalog.
        if(typeof(T) == typeof(Product))
        {
            endpoints.MapPost(path + "/lookup", Query).RequirePermission(resource.ReadPermission).VerifyCsrf();
            endpoints.MapGet(path + "/lookup/{id:guid}", async (Guid id, EngagementDbContext db, CancellationToken ct) => {
                var row = await db.Set<T>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id,ct);
                return row is null ? Results.Content("null","application/json") : Results.Json(row);
            }).RequirePermission(resource.ReadPermission);
        }
        endpoints.MapGet(path + "/{id:guid}", async (Guid id, EngagementDbContext db, HttpContext context, CancellationToken ct) => {
            var row = await db.Set<T>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id,ct);
            if(row is null) return Results.NotFound();
            context.Response.Headers.ETag = '"' + row.Version + '"'; return Results.Ok(new RecordResult<T>(row,row.Version));
        }).RequirePermission(resource.ReadPermission);
        async Task<IResult> Save(Guid? id, TInput input, EngagementDbContext db, ICustomerDirectory customers, HttpContext context, CancellationToken ct)
        {
            if(id is not null && !context.Request.Headers.ContainsKey("If-Match")) return Results.Problem(statusCode:428,title:"If-Match is required.");
            var row = id is null ? new T { Id = Guid.NewGuid() } : await db.Set<T>().SingleOrDefaultAsync(x => x.Id == id,ct);
            if(row is null) return Results.NotFound();
            if(id is not null && !VersionToken.Matches(context.Request.Headers.IfMatch,row.Version)) throw new VersionConflictException();
            apply(input,row);
            if(row is Opportunity opportunity) opportunity.CustomerName = await CustomerName(opportunity.CustomerId,customers,ct);
            if(row is Activity activity) activity.CustomerName = await CustomerName(activity.CustomerId,customers,ct);
            if(row is Product product && await db.Products.AnyAsync(x => x.Code == product.Code && x.Id != product.Id,ct)) EngagementRules.Fail("code","This SKU already exists.");
            row.SearchName = (row.Name + " " + (row is Product p ? p.Code : row is Opportunity o ? o.CustomerName + " " + o.Owner : row is Activity a ? a.CustomerName + " " + a.Owner : "")).ToUpperInvariant();
            row.Version = VersionToken.New(); row.ModifiedAt = DatabaseTimestamp.UtcNow; row.ModifiedBy = Actors.GetId(context.User);
            if(id is null) db.Set<T>().Add(row);
            await db.SaveWithConcurrencyAsync(ct);
            context.Response.Headers.ETag = '"' + row.Version + '"';
            return id is null ? Results.Created(path + "/" + row.Id,new RecordResult<T>(row,row.Version)) : Results.Ok(new RecordResult<T>(row,row.Version));
        }
        var create = endpoints.MapPost(path, (TInput input, EngagementDbContext db, ICustomerDirectory customers, HttpContext context, CancellationToken ct) => Save(null,input,db,customers,context,ct)).RequirePermission(permission + ".write").RequirePermission(resource.ReadPermission).VerifyCsrf();
        var update = endpoints.MapPut(path + "/{id:guid}", (Guid id,TInput input, EngagementDbContext db, ICustomerDirectory customers, HttpContext context, CancellationToken ct) => Save(id,input,db,customers,context,ct)).RequirePermission(permission + ".write").RequirePermission(resource.ReadPermission).VerifyCsrf();
        if(typeof(T) != typeof(Product)) { create.RequirePermission(CustomerAccess.Lookup); update.RequirePermission(CustomerAccess.Lookup); }
        endpoints.MapDelete(path + "/{id:guid}", async (Guid id, EngagementDbContext db, HttpContext context, CancellationToken ct) => {
            if(!context.Request.Headers.ContainsKey("If-Match")) return Results.Problem(statusCode:428,title:"If-Match is required.");
            var row = await db.Set<T>().SingleOrDefaultAsync(x => x.Id == id,ct);
            if(row is null) return Results.NotFound();
            if(!VersionToken.Matches(context.Request.Headers.IfMatch,row.Version)) throw new VersionConflictException();
            db.Remove(row); await db.SaveWithConcurrencyAsync(ct); return Results.NoContent();
        }).RequirePermission(permission + ".delete").RequirePermission(resource.ReadPermission).VerifyCsrf();
    }
    static async Task<string> CustomerName(Guid id, ICustomerDirectory directory, CancellationToken ct)
    {
        var customer = await directory.FindAsync(id,ct);
        if(customer is null || !customer.Active) EngagementRules.Fail("customerId","Choose an active customer.");
        return customer!.Name;
    }
}
