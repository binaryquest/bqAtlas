using BqAtlas.Sample.Sales;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BqAtlas.Sample.Migrations.PostgreSql;

public sealed class SalesDbContextFactory : IDesignTimeDbContextFactory<SalesDbContext>
{
    public SalesDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql("Host=localhost;Database=bqatlas;Username=bqatlas;Password=design-only", o => o.MigrationsAssembly(typeof(SalesDbContextFactory).Assembly.FullName)).Options);
}
