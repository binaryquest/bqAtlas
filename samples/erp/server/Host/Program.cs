using System.Threading.RateLimiting;
using BqAtlas.AspNetCore;
using BqAtlas.Identity;
using BqAtlas.Sample.Crm;
using BqAtlas.Sample.Sales;
using BqAtlas.Sample.Engagement;
using Microsoft.AspNetCore.OData;
using Microsoft.EntityFrameworkCore;
var builder = WebApplication.CreateBuilder(args);
var authMode = builder.Configuration["Authentication:Mode"] ?? "local";
if (authMode is not ("local" or "oidc")) throw new InvalidOperationException("Authentication:Mode must be local or oidc.");
void ConfigureDatabase(DbContextOptionsBuilder options, string schema)
{
    var database = builder.Configuration["Database:Provider"] ?? "postgresql";
    if (database is not ("postgresql" or "sqlserver")) throw new InvalidOperationException("Database:Provider must be postgresql or sqlserver.");
    var connection = builder.Configuration.GetConnectionString("Application") ?? throw new InvalidOperationException("Set ConnectionStrings:Application.");
    if (database == "postgresql") options.UseNpgsql(connection, db => db.MigrationsAssembly("BqAtlas.Sample.Migrations.PostgreSql").MigrationsHistoryTable("__EFMigrationsHistory", schema));
    else options.UseSqlServer(connection, db => db.MigrationsAssembly("BqAtlas.Sample.Migrations.SqlServer").MigrationsHistoryTable("__EFMigrationsHistory", schema));
}
var registry = new BqAtlasRegistry();
registry.AddModule(new CrmModule(options => ConfigureDatabase(options, "crm")));
registry.AddResource(CrmModule.Resource);
registry.AddModule(new SalesModule(options => ConfigureDatabase(options, "sales")));
registry.AddResource(SalesModule.Resource);
registry.AddModule(new EngagementModule(options => ConfigureDatabase(options, "engagement")));
foreach(var resource in EngagementModule.Resources) registry.AddResource(resource);
builder.Services.AddBqAtlasHttp(registry);
builder.Services.AddExceptionHandler<BqAtlas.Sample.DatabaseConflictHandler>();
registry.Configure(builder.Services, builder.Configuration);
if (authMode == "local") { builder.Services.AddBqAtlasIdentity(options => ConfigureDatabase(options, "identity")); builder.Services.AddBqAtlasAccountEmail(builder.Configuration, builder.Environment); }
else builder.Services.AddBqAtlasOidc(builder.Configuration);
builder.Services.AddBqAtlasBearer(builder.Configuration, authMode == "local" ? Microsoft.AspNetCore.Identity.IdentityConstants.ApplicationScheme : BqAtlasAuthentication.CookieScheme);
builder.Services.AddControllers().AddApplicationPart(typeof(CustomersController).Assembly).AddOData(options => options.Select().Filter().OrderBy().Count().SetMaxTop(100).AddRouteComponents("odata/v1/crm", CrmModule.ReadModel()));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var app = builder.Build();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment()) { app.UseHsts(); app.UseHttpsRedirection(); }
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/auth") || context.Request.Path.StartsWithSegments("/odata")) context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next(context);
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
app.MapBqAtlas(authMode);
if (authMode == "local") app.MapBqAtlasIdentity(); else app.MapBqAtlasOidc();
registry.Map(app); app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
// Migrations are an explicit deployment operation, never a side effect of ordinary startup.
if (args.Contains("--migrate"))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<CrmDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<SalesDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<EngagementDbContext>().Database.MigrateAsync();
    if (authMode == "local") await scope.ServiceProvider.GetRequiredService<AtlasIdentityDbContext>().Database.MigrateAsync();
    return;
}
if (authMode == "local") await app.Services.BootstrapDevelopmentUserAsync(builder.Configuration, app.Environment, CrmPermissions.All.Concat(SalesPermissions.All).Concat(EngagementModule.AllPermissions));
if (args.Contains("--grant-development-permissions"))
{
    if (authMode != "local") throw new InvalidOperationException("Development permission grants require local Identity mode.");
    await app.Services.GrantDevelopmentPermissionsAsync(builder.Configuration, app.Environment, CrmPermissions.All.Concat(SalesPermissions.All).Concat(EngagementModule.AllPermissions));
    return;
}
if (args.Contains("--seed-crm-demo"))
{
    await BqAtlas.Sample.CrmDemoSeed.Run(app.Services, app.Environment);
    return;
}
app.Run();
public partial class Program { }
