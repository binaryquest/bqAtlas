using BqAtlas.Sample.Engagement;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BqAtlas.Sample.Migrations.SqlServer;

public sealed class EngagementDbContextFactory : IDesignTimeDbContextFactory<EngagementDbContext>
{
    public EngagementDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<EngagementDbContext>().UseSqlServer("Server=localhost;Database=bqatlas;User Id=sa;Password=design-only;TrustServerCertificate=true", o => o.MigrationsAssembly(typeof(EngagementDbContextFactory).Assembly.FullName)).Options);
}
