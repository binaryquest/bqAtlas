using System.Security.Claims;
using BqAtlas.Core;
using BqAtlas.Sample.Crm;
using Xunit;
namespace BqAtlas.Tests;

public class FrameworkTests
{
    [Fact] public void ModulesAreOrderedByDependencies() => Assert.Equal(["crm", "sales"], ModuleGraph.Order([new("sales", ["crm"]), new("crm", [])]));
    [Fact] public void CyclesAreRejected() => Assert.Throws<InvalidOperationException>(() => ModuleGraph.Order([new("crm", ["sales"]), new("sales", ["crm"])]));
    [Fact] public void MissingDependenciesAreRejected() => Assert.Throws<InvalidOperationException>(() => ModuleGraph.Order([new("sales", ["crm"])]));
    [Fact] public void DuplicateModulesAreRejected() => Assert.Throws<InvalidOperationException>(() => ModuleGraph.Order([new("crm", []), new("crm", [])]));
    [Fact] public void AnonymousClaimsDoNotGrantAccess() => Assert.False(Permissions.Has(new ClaimsPrincipal(new ClaimsIdentity([new Claim(Permissions.ClaimType, CrmPermissions.Read)])), CrmPermissions.Read));
    [Fact] public void PermissionsAreExact() => Assert.False(Permissions.Has(new ClaimsPrincipal(new ClaimsIdentity([new Claim(Permissions.ClaimType, "crm.*")], "test")), CrmPermissions.Read));
    [Theory][InlineData(0)][InlineData(101)] public void PageSizeIsBounded(int size) => Assert.Throws<ResourceValidationException>(() => QueryRules.Validate(new(PageSize: size), new HashSet<string> { "code" }));
    [Fact] public void UnknownQueryFieldsAreRejected() => Assert.Throws<ResourceValidationException>(() => QueryRules.Validate(new(Sort: [new("internalSecret")]), new HashSet<string> { "code" }));
    [Fact] public void CustomerInputIsNormalized() { var c = CustomerRules.Validate(new(" acme-1 ", " Acme ", " ")); Assert.Equal("ACME-1", c.Code); Assert.Equal("Acme", c.Name); Assert.Null(c.Email); }
    [Theory]
    [InlineData("", "Acme", null)]
    [InlineData("A B", "Acme", null)]
    [InlineData("A", "", null)]
    [InlineData("A", "Acme", "invalid")]
    public void InvalidCustomersAreRejected(string code, string name, string? email) => Assert.Throws<ResourceValidationException>(() => CustomerRules.Validate(new(code, name, email)));
    [Fact] public void ConcurrencyTokensAreOpaqueAndExact() { var value = VersionToken.New(); Assert.True(VersionToken.Matches('"' + value + '"', value)); Assert.False(VersionToken.Matches(null, value)); Assert.False(VersionToken.Matches(VersionToken.New(), value)); }
}
