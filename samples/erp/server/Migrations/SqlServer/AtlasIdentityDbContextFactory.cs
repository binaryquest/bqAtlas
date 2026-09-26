using BqAtlas.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BqAtlas.Sample.Migrations.SqlServer;

public sealed class AtlasIdentityDbContextFactory : IDesignTimeDbContextFactory<AtlasIdentityDbContext>
{
    public AtlasIdentityDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<AtlasIdentityDbContext>().UseSqlServer("Server=localhost;Database=bqatlas;User Id=sa;Password=design-only;TrustServerCertificate=true", o => o.MigrationsAssembly(typeof(AtlasIdentityDbContextFactory).Assembly.FullName)).Options);
}
