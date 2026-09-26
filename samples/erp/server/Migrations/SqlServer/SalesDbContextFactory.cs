using BqAtlas.Sample.Sales;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BqAtlas.Sample.Migrations.SqlServer;

public sealed class SalesDbContextFactory : IDesignTimeDbContextFactory<SalesDbContext>
{
    public SalesDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<SalesDbContext>().UseSqlServer("Server=localhost;Database=bqatlas;User Id=sa;Password=design-only;TrustServerCertificate=true", o => o.MigrationsAssembly(typeof(SalesDbContextFactory).Assembly.FullName)).Options);
}
