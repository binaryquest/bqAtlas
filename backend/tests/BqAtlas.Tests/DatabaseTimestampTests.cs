using BqAtlas.Core;
using Xunit;
namespace BqAtlas.Tests;

public class DatabaseTimestampTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(9)]
    [InlineData(10)]
    [InlineData(19)]
    public void TimestampPreservesMicrosecondsAndNormalizesOffset(int extraTicks)
    {
        var baseline = new DateTimeOffset(2026, 9, 26, 12, 0, 0, TimeSpan.FromHours(6));
        var input = baseline.AddTicks(extraTicks);
        var actual = DatabaseTimestamp.Normalize(input);
        Assert.Equal(baseline.UtcTicks + extraTicks / 10 * 10, actual.Ticks);
        Assert.Equal(TimeSpan.Zero, actual.Offset);
        Assert.Equal(actual, DatabaseTimestamp.Normalize(actual));
    }
}
