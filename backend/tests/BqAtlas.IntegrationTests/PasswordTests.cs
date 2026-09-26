using System.Net;
using System.Net.Http.Json;
using BqAtlas.Core;
using Xunit;
namespace BqAtlas.IntegrationTests;

public class PasswordTests(ApiFixture fixture):IClassFixture<ApiFixture>
{
    [Fact]
    public async Task PasswordChangeRequiresCurrentPasswordAndCsrfThenSignsOut()
    {
        const string path="/auth/change-password";
        var next="Changed-"+Guid.NewGuid().ToString("N")+"aA1!";
        using var anonymous=fixture.Client();
        Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.PostAsJsonAsync(path,new{currentPassword=fixture.Password,newPassword=next})).StatusCode);
        using var client=await fixture.Login();
        client.DefaultRequestHeaders.Remove("X-BQATLAS-CSRF");
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync(path,new{currentPassword=fixture.Password,newPassword=next})).StatusCode);
        await ApiFixture.Csrf(client);
        var wrong=await client.PostAsJsonAsync(path,new{currentPassword="Wrong-current-password!",newPassword=next});
        Assert.Equal(HttpStatusCode.BadRequest,wrong.StatusCode);Assert.Contains("currentPassword",await wrong.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync(path,new{currentPassword=fixture.Password,newPassword="weak"})).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsJsonAsync(path,new{currentPassword=fixture.Password,newPassword=next})).StatusCode);
        Assert.False((await client.GetFromJsonAsync<SessionInfo>("/api/v1/session"))!.Authenticated);
        await ApiFixture.Csrf(client);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.PostAsJsonAsync("/auth/login",new{email="writer@test.local",password=fixture.Password})).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsJsonAsync("/auth/login",new{email="writer@test.local",password=next})).StatusCode);
        Assert.True((await client.GetFromJsonAsync<SessionInfo>("/api/v1/session"))!.Authenticated);
    }
}
