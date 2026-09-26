using BqAtlas.Sample.Crm;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BqAtlas.Sample.Migrations.SqlServer;

public sealed class CrmDbContextFactory : IDesignTimeDbContextFactory<CrmDbContext>
{
    public CrmDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<CrmDbContext>().UseSqlServer("Server=localhost;Database=bqatlas;User Id=sa;Password=design-only;TrustServerCertificate=true", o => o.MigrationsAssembly(typeof(CrmDbContextFactory).Assembly.FullName)).Options);
}
