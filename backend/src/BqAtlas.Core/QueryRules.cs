namespace BqAtlas.Core;

public static class QueryRules
{
    public static void Validate(QueryRequest query, IReadOnlySet<string> fields)
    {
        var errors = new Dictionary<string, string[]>();
        if (query.Page < 0 || query.Page > 100000) errors["page"] = ["Page must be between 0 and 100000."];
        if (query.PageSize is < 1 or > 100) errors["pageSize"] = ["Page size must be between 1 and 100."];
        if (query.Search is null || query.Search.Length > 200) errors["search"] = ["Search is limited to 200 characters."];
        if (query.Sort?.Count > 5 || query.Filters?.Count > 10) errors["query"] = ["Too many sort or filter terms."];
        foreach (var term in query.Sort ?? [])
            if (term is null || !fields.Contains(term.Field) || term.Direction is not ("asc" or "desc")) errors["sort"] = ["Unsupported sort field or direction."];
        foreach (var term in query.Filters ?? [])
            if (term is null || !fields.Contains(term.Field) || term.Operator is not ("eq" or "contains" or "startsWith") || term.Value is null || term.Value.Length > 200) errors["filters"] = ["Unsupported filter field, operator or value."];
        if (errors.Count > 0) throw new ResourceValidationException(errors);
    }
}
