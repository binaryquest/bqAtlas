using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using BqAtlas.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace BqAtlas.IntegrationTests;
public sealed class TestAccountEmailSender : IAccountEmailSender
{
    public bool Available => true;
    public ConcurrentQueue<AccountEmail> Messages { get; } = new();
    public Task SendAsync(AccountEmail message, CancellationToken ct) { Messages.Enqueue(message); return Task.CompletedTask; }
}
public class RecoveryTests(ApiFixture fixture):IClassFixture<ApiFixture>
{
    [Fact]
    public async Task ResetIsNonEnumeratingBoundToUserAndSingleUse()
    {
        using var client=fixture.Client();
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/auth/request-password-reset",new{email="writer@test.local"})).StatusCode);
        await ApiFixture.Csrf(client);
        var absent=await client.PostAsJsonAsync("/auth/request-password-reset",new{email="absent@test.local"});
        Assert.Equal(HttpStatusCode.Accepted,absent.StatusCode);
        Assert.Empty(fixture.Mail.Messages);
        var present=await client.PostAsJsonAsync("/auth/request-password-reset",new{email="writer@test.local"});
        Assert.Equal(HttpStatusCode.Accepted,present.StatusCode);Assert.Equal(await absent.Content.ReadAsStringAsync(),await present.Content.ReadAsStringAsync());
        var mail=Assert.Single(fixture.Mail.Messages);Assert.Equal("writer@test.local",mail.Recipient);
        var link=new Uri(mail.ActionUrl);Assert.Equal("127.0.0.1",link.Host);var query=QueryHelpers.ParseQuery(link.Query);
        var id=query["userId"].ToString();var token=query["token"].ToString();var password="Reset-"+Guid.NewGuid().ToString("N")+"aA1!";
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/auth/reset-password",new{userId=Guid.NewGuid().ToString(),token,newPassword=password})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/auth/reset-password",new{userId=id,token=token+"tampered",newPassword=password})).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsJsonAsync("/auth/reset-password",new{userId=id,token,newPassword=password})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/auth/reset-password",new{userId=id,token,newPassword=password+"changed"})).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.PostAsJsonAsync("/auth/login",new{email="writer@test.local",password=fixture.Password})).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsJsonAsync("/auth/login",new{email="writer@test.local",password})).StatusCode);
    }
}
public class ConfirmationTests(ApiFixture fixture):IClassFixture<ApiFixture>
{
    [Fact]
    public async Task ConfirmationRequiresTheCorrectPurposeBoundToken()
    {
        using(var scope=fixture.App.Services.CreateScope()) {
            var users=scope.ServiceProvider.GetRequiredService<UserManager<AtlasUser>>();
            var user=await users.FindByEmailAsync("writer@test.local");user!.EmailConfirmed=false;Assert.True((await users.UpdateAsync(user)).Succeeded);
        }
        using var client=fixture.Client();await ApiFixture.Csrf(client);
        Assert.Equal(HttpStatusCode.Accepted,(await client.PostAsJsonAsync("/auth/request-password-reset",new{email="writer@test.local"})).StatusCode);Assert.Empty(fixture.Mail.Messages);
        Assert.Equal(HttpStatusCode.Accepted,(await client.PostAsJsonAsync("/auth/request-confirmation",new{email="writer@test.local"})).StatusCode);
        var query=QueryHelpers.ParseQuery(new Uri(Assert.Single(fixture.Mail.Messages).ActionUrl).Query);var id=query["userId"].ToString();var token=query["token"].ToString();
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/auth/reset-password",new{userId=id,token,newPassword=fixture.Password+"Different"})).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsJsonAsync("/auth/confirm-email",new{userId=id,token})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/auth/reset-password",new{userId=id,token,newPassword=fixture.Password+"Different"})).StatusCode);
        using var check=fixture.App.Services.CreateScope();Assert.True((await check.ServiceProvider.GetRequiredService<UserManager<AtlasUser>>().FindByIdAsync(id))!.EmailConfirmed);
    }
}
