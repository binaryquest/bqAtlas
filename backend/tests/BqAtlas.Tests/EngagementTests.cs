using BqAtlas.Core;
using BqAtlas.Sample.Engagement;
using Xunit;
public class EngagementTests
{
    [Theory]
    [InlineData("-1")][InlineData("1e3")][InlineData("1.12345")][InlineData("1000000001")][InlineData("")]
    public void CatalogRejectsInvalidPrice(string price) => Assert.Throws<ResourceValidationException>(()=>EngagementRules.Apply(new ProductInput("Service","SVC","Service",price,"USD",true),new Product()));
    [Fact]
    public void CatalogPreservesExactDecimalAndNormalizesSku()
    {
        var row=new Product();EngagementRules.Apply(new ProductInput(" Service "," svc-1 ","Service","12.3456","USD",true),row);
        Assert.Equal("SVC-1",row.Code);Assert.Equal("12.3456",row.UnitPrice);Assert.Equal("Service",row.Name);
    }
    [Fact]
    public void PipelineValidatesStageAndDate()
    {
        var input=new OpportunityInput("Rollout",Guid.NewGuid(),"Imaginary","500","USD",new(2026,10,1),"Alex","");
        Assert.Throws<ResourceValidationException>(()=>EngagementRules.Apply(input,new Opportunity()));
        Assert.Throws<ResourceValidationException>(()=>EngagementRules.Apply(input with {Stage="Lead",ExpectedClose=default},new Opportunity()));
    }
    [Fact]
    public void FollowUpRequiresOwnerAndValidStatus()
    {
        var input=new ActivityInput("Call",Guid.NewGuid(),new(2026,10,1),"Call","Done","Alex","");
        Assert.Throws<ResourceValidationException>(()=>EngagementRules.Apply(input with {Owner=" "},new Activity()));
        Assert.Throws<ResourceValidationException>(()=>EngagementRules.Apply(input with {Status="Unknown"},new Activity()));
    }
    [Fact]
    public void AllResourcesHaveDedicatedPermissions() => Assert.All(EngagementModule.Resources,r=>Assert.Contains(r.ReadPermission,EngagementModule.AllPermissions));
}
