using Microsoft.AspNetCore.OData.Query;
namespace BqAtlas.OData;
/// <summary>Bounded reads. Expansion, arbitrary functions and $apply are deliberately excluded; inline counts support paged lists.</summary>
public sealed class ReadOnlyQueryAttribute : EnableQueryAttribute
{
    public ReadOnlyQueryAttribute()
    {
        PageSize = 50;
        MaxTop = 100;
        MaxSkip = 100000;
        MaxNodeCount = 40;
        MaxOrderByNodeCount = 3;
        AllowedQueryOptions = AllowedQueryOptions.Select | AllowedQueryOptions.Filter | AllowedQueryOptions.OrderBy | AllowedQueryOptions.Skip | AllowedQueryOptions.Top | AllowedQueryOptions.Count;
        AllowedFunctions = AllowedFunctions.Contains | AllowedFunctions.StartsWith | AllowedFunctions.ToLower;
    }
}
