using BqAtlas.Sample.Engagement;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BqAtlas.Sample.Migrations.PostgreSql;

public sealed class EngagementDbContextFactory : IDesignTimeDbContextFactory<EngagementDbContext>
{
    public EngagementDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<EngagementDbContext>().UseNpgsql("Host=localhost;Database=bqatlas;Username=bqatlas;Password=design-only", o => o.MigrationsAssembly(typeof(EngagementDbContextFactory).Assembly.FullName)).Options);
}
