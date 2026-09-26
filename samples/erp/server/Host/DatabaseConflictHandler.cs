using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Npgsql;
namespace BqAtlas.Sample;

public sealed class DatabaseConflictHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not DbUpdateException update || !(update.InnerException is PostgresException { SqlState: "23505" } || update.InnerException is SqlException { Number: 2601 or 2627 })) return false;
        await Results.Problem(statusCode: 409, title: "A record with the same unique value already exists.", extensions: new Dictionary<string, object?> { ["code"] = "unique_conflict" }).ExecuteAsync(context);
        return true;
    }
}
