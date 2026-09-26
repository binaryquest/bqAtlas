using BqAtlas.Core;
using Microsoft.EntityFrameworkCore;
namespace BqAtlas.EntityFrameworkCore;

public static class Concurrency
{
    public static async Task SaveWithConcurrencyAsync(this DbContext db, CancellationToken cancellationToken = default)
    {
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateConcurrencyException) { throw new VersionConflictException(); }
    }
}
