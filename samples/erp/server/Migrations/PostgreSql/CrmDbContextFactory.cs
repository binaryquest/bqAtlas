using BqAtlas.Sample.Crm;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BqAtlas.Sample.Migrations.PostgreSql;

public sealed class CrmDbContextFactory : IDesignTimeDbContextFactory<CrmDbContext>
{
    public CrmDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<CrmDbContext>().UseNpgsql("Host=localhost;Database=bqatlas;Username=bqatlas;Password=design-only", o => o.MigrationsAssembly(typeof(CrmDbContextFactory).Assembly.FullName)).Options);
}
