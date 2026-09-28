using System.Net;
using System.Net.Http.Json;
using BqAtlas.Core;
using BqAtlas.Sample.Crm;
using BqAtlas.Sample.Engagement;
using Xunit;
namespace BqAtlas.IntegrationTests;
public class EngagementTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    const string Root="/api/v1/engagement/";
    static ProductInput ProductInput()=>new("Consulting","TEST-"+Guid.NewGuid().ToString("N")[..12],"Service","125.1234","USD",true);
    static async Task<RecordResult<T>> Create<T>(HttpClient client,string path,object input)
    {
        var response=await client.PostAsJsonAsync(path,input);Assert.Equal(HttpStatusCode.Created,response.StatusCode);return (await response.Content.ReadFromJsonAsync<RecordResult<T>>())!;
    }
    static Task<HttpResponseMessage> Update(HttpClient client,string path,object input,string version)
    {
        var request=new HttpRequestMessage(HttpMethod.Put,path){Content=JsonContent.Create(input)};request.Headers.TryAddWithoutValidation("If-Match",'"'+version+'"');return client.SendAsync(request);
    }
    [Fact]
    public async Task CatalogPersistsPrecisePriceQueriesAndProtectsStaleWrites()
    {
        using var client=await fixture.Login();var input=ProductInput();var first=await Create<Product>(client,Root+"products",input);var path=Root+"products/"+first.Data.Id;
        Assert.Equal("125.1234",first.Data.UnitPrice);
        var query=await client.PostAsJsonAsync(Root+"products/query",new QueryRequest(Search:input.Code.ToLowerInvariant(),Sort:[new("code")]));Assert.Equal(HttpStatusCode.OK,query.StatusCode);Assert.Single((await query.Content.ReadFromJsonAsync<PageResult<Product>>())!.Items);
        Assert.Equal(first.Data.Id,(await client.GetFromJsonAsync<Product>(Root+"products/lookup/"+first.Data.Id))!.Id);
        Assert.Equal(HttpStatusCode.PreconditionRequired,(await client.PutAsJsonAsync(path,input)).StatusCode);
        var changed=await Update(client,path,input with {Name="Updated service"},first.Version);Assert.Equal(HttpStatusCode.OK,changed.StatusCode);
        var second=(await changed.Content.ReadFromJsonAsync<RecordResult<Product>>())!;
        Assert.Equal(HttpStatusCode.PreconditionFailed,(await Update(client,path,input,first.Version)).StatusCode);
        var raw=await client.GetStringAsync(path);Assert.DoesNotContain("modifiedBy",raw);Assert.DoesNotContain("searchName",raw);
        using var delete=new HttpRequestMessage(HttpMethod.Delete,path);delete.Headers.TryAddWithoutValidation("If-Match",second.Version);Assert.Equal(HttpStatusCode.NoContent,(await client.SendAsync(delete)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync(path)).StatusCode);
    }
    [Fact]
    public async Task PipelineAndFollowupsValidateCustomersAndFilterByAccount()
    {
        using var client=await fixture.Login();var customer=await Create<CustomerDto>(client,"/api/v1/crm/customers",new CustomerInput("ENG-"+Guid.NewGuid().ToString("N")[..10],"Engagement account",null));
        var input=new OpportunityInput("Rollout",customer.Data.Id,"Proposal","1000.12","USD",new(2026,10,1),"Alex","Discuss scope");
        var opportunity=await Create<Opportunity>(client,Root+"opportunities",input);Assert.Equal(customer.Data.Name,opportunity.Data.CustomerName);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync(Root+"opportunities",input with {CustomerId=Guid.NewGuid()})).StatusCode);
        var filter=new QueryRequest(Filters:[new("customerId","eq",customer.Data.Id.ToString())],Sort:[new("expectedClose")]);
        var query=await client.PostAsJsonAsync(Root+"opportunities/query",filter);Assert.Equal(HttpStatusCode.OK,query.StatusCode);Assert.Equal(opportunity.Data.Id,Assert.Single((await query.Content.ReadFromJsonAsync<PageResult<Opportunity>>())!.Items).Id);
        var activity=await Create<Activity>(client,Root+"activities",new ActivityInput("Follow up",customer.Data.Id,new(2026,10,1),"Call","Planned","Alex",""));
        var done=await Update(client,Root+"activities/"+activity.Data.Id,new ActivityInput("Follow up",customer.Data.Id,new(2026,10,1),"Call","Done","Alex","Discussed scope"),activity.Version);
        Assert.Equal(HttpStatusCode.OK,done.StatusCode);Assert.Equal("Done",(await done.Content.ReadFromJsonAsync<RecordResult<Activity>>())!.Data.Status);
    }
    [Fact]
    public async Task PermissionAndCsrfChecksProtectAllNewResources()
    {
        using var reader=await fixture.Login("reader@test.local");using var writer=await fixture.Login();
        foreach(var resource in new[]{"products","opportunities","activities"})
        {
            Assert.Equal(HttpStatusCode.Forbidden,(await reader.PostAsJsonAsync(Root+resource+"/query",new QueryRequest())).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,(await reader.GetAsync(Root+resource+"/"+Guid.NewGuid())).StatusCode);
        }
        writer.DefaultRequestHeaders.Remove("X-BQATLAS-CSRF");Assert.Equal(HttpStatusCode.BadRequest,(await writer.PostAsJsonAsync(Root+"products",ProductInput())).StatusCode);
    }
    [Fact]
    public async Task QueryRejectsUnsupportedFiltersAndSorts()
    {
        using var client=await fixture.Login();
        foreach(var query in new[]{new QueryRequest(Sort:[new("unitPrice")]),new QueryRequest(Filters:[new("active","eq","true")]),new QueryRequest(Filters:[new("customerId","eq","bad")]),new QueryRequest(PageSize:101)})
            Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync(Root+"products/query",query)).StatusCode);
    }
}
