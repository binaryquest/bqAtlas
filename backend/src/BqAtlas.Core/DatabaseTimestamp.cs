namespace BqAtlas.Core;

/// <summary>UTC timestamps with the microsecond precision shared by PostgreSQL and SQL Server.</summary>
public static class DatabaseTimestamp
{
    public static DateTimeOffset UtcNow => Normalize(DateTimeOffset.UtcNow);

    public static DateTimeOffset Normalize(DateTimeOffset value)
    {
        var ticks = value.UtcTicks;
        return new DateTimeOffset(ticks - ticks % TimeSpan.TicksPerMicrosecond, TimeSpan.Zero);
    }
}
