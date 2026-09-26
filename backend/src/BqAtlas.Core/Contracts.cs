using System.Security.Claims;
namespace BqAtlas.Core;

public sealed record FieldDescriptor(string Name, string Label, string Type = "string", bool Required = false, int? MaxLength = null, bool ReadOnly = false, string[]? Options = null, int? Scale = null, string? Maximum = null);
public sealed record ResourceDescriptor(string Id, string Title, string Endpoint, string ReadPermission, IReadOnlyList<FieldDescriptor> Fields, string KeyField = "id", string? ODataEndpoint = null);
public sealed record SortTerm(string Field, string Direction = "asc");
public sealed record FilterTerm(string Field, string Operator, string Value);
public sealed record QueryRequest(int Page = 0, int PageSize = 25, string Search = "", IReadOnlyList<SortTerm>? Sort = null, IReadOnlyList<FilterTerm>? Filters = null);
public sealed record PageResult<T>(IReadOnlyList<T> Items, long Total, int Page, int PageSize);
public sealed record RecordCapabilities(bool Edit, bool Delete, IReadOnlyList<string> Commands);
public sealed record RecordResult<T>(T Data, string Version, RecordCapabilities? Capabilities = null);
public sealed record SessionInfo(bool Authenticated, string? Id, string? Name, IReadOnlyList<string> Permissions, string AuthMode);
public sealed record ModuleDefinition(string Id, IReadOnlyList<string> Dependencies);
public sealed record ApplicationManifest(string ContractVersion, IReadOnlyList<string> Modules, IReadOnlyList<ResourceDescriptor> Resources);

public static class Permissions
{
    public const string ClaimType = "bqatlas.permission";
    public static bool Has(ClaimsPrincipal user, string permission) => user.Identity?.IsAuthenticated == true && user.HasClaim(ClaimType, permission);
    public static string[] Get(ClaimsPrincipal user) => user.FindAll(ClaimType).Select(x => x.Value).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
}
public sealed class ResourceValidationException(IReadOnlyDictionary<string, string[]> errors) : Exception("Validation failed.")
{
    public IReadOnlyDictionary<string, string[]> Errors { get; } = errors;
}
public sealed class VersionConflictException : Exception
{
    public VersionConflictException() : base("This record changed after you opened it. Reload before saving.") { }
}
public static class VersionToken
{
    public static string New() => Guid.NewGuid().ToString("N");
    public static bool Matches(string? expected, string actual) => !string.IsNullOrWhiteSpace(expected) && string.Equals(expected.Trim('"'), actual, StringComparison.Ordinal);
}

public sealed class BusinessConflictException(string message, string code = "business_conflict") : Exception(message)
{
    public string Code { get; } = code;
}
public static class Actors
{
    public static string GetId(ClaimsPrincipal user)
    {
        if (user.Identity?.IsAuthenticated != true) throw new InvalidOperationException("An authenticated actor is required.");
        if (user.FindFirst("iss")?.Value is { } issuer && user.FindFirst("sub")?.Value is { } subject)
        {
            var bytes = System.Text.Encoding.UTF8.GetBytes(issuer + "\n" + subject);
            return "oidc:" + Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(bytes));
        }
        return user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? throw new InvalidOperationException("Authenticated actor identity is missing.");
    }
}
