using BqAtlas.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BqAtlas.Sample.Migrations.PostgreSql;

public sealed class AtlasIdentityDbContextFactory : IDesignTimeDbContextFactory<AtlasIdentityDbContext>
{
    public AtlasIdentityDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<AtlasIdentityDbContext>().UseNpgsql("Host=localhost;Database=bqatlas;Username=bqatlas;Password=design-only", o => o.MigrationsAssembly(typeof(AtlasIdentityDbContextFactory).Assembly.FullName)).Options);
}
