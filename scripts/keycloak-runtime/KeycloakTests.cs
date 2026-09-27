using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Xunit;

public sealed class KeycloakTests(StarterFixture fixture) : IClassFixture<StarterFixture>
{
    private readonly Uri provider = new(Environment.GetEnvironmentVariable("Authentication__Oidc__Authority")!);
    private static string Attribute(string tag, string name) => WebUtility.HtmlDecode(Regex.Match(tag, "\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", RegexOptions.IgnoreCase).Groups[1].Value);
    private (Uri Action, Dictionary<string, string> Fields) Form(string html, Uri? source = null)
    {
        var match = Regex.Match(html, @"<form\b[^>]*>[\s\S]*?</form>", RegexOptions.IgnoreCase);
        Assert.True(match.Success, "Expected the provider's HTML form.");
        var action = new Uri(source ?? provider, Attribute(match.Value[..(match.Value.IndexOf('>') + 1)], "action"));
        Assert.True(action.GetLeftPart(UriPartial.Authority) == provider.GetLeftPart(UriPartial.Authority) || action.GetLeftPart(UriPartial.Authority) == fixture.Address.GetLeftPart(UriPartial.Authority), "Refusing a form outside the isolated application/provider.");
        var fields = new Dictionary<string, string>();
        foreach (Match input in Regex.Matches(match.Value, @"<input\b[^>]*>", RegexOptions.IgnoreCase))
        {
            var name = Attribute(input.Value, "name");
            if (name.Length > 0) fields[name] = Attribute(input.Value, "value");
        }
        return (action, fields);
    }
    private async Task<HttpResponseMessage> Follow(HttpClient client, HttpResponseMessage response)
    {
        for (var i = 0; i < 12; i++)
        {
            if ((int)response.StatusCode is < 300 or >= 400) return response;
            var next = new Uri(response.RequestMessage!.RequestUri!, response.Headers.Location!);
            Assert.True(next.GetLeftPart(UriPartial.Authority) == provider.GetLeftPart(UriPartial.Authority) || next.GetLeftPart(UriPartial.Authority) == fixture.Address.GetLeftPart(UriPartial.Authority), "Unexpected redirect origin.");
            response.Dispose(); response = await client.GetAsync(next);
        }
        throw new InvalidOperationException("Too many authentication redirects.");
    }
    private async Task<HttpClient> Login(string username)
    {
        var client = new HttpClient(new LoopbackCookieHandler(fixture.Address, provider)) { BaseAddress = fixture.Address };
        var challenge = await client.GetAsync("/auth/login");
        Assert.Equal(HttpStatusCode.Redirect, challenge.StatusCode);
        // .NET 10 uses pushed authorization requests when Keycloak advertises PAR.
        // In that case the challenge is in the backchannel request; the isolated
        // Keycloak client requires S256, so successful login also verifies PKCE.
        var query = challenge.Headers.Location!.Query;
        Assert.True(query.Contains("request_uri=") || query.Contains("code_challenge_method=S256"));
        var loginPage = await Follow(client, challenge);
        var loginHtml = await loginPage.Content.ReadAsStringAsync();
        Assert.True(loginHtml.Contains("name=\"username\""), "Expected login form; provider status " + loginPage.StatusCode + "; notices: " + string.Join(" ", Regex.Matches(loginHtml, @"<(?:p|h1)[^>]*>([^<]*)</(?:p|h1)>").Select(m => WebUtility.HtmlDecode(m.Groups[1].Value))));
        var form = Form(loginHtml);
        Assert.Equal(provider.GetLeftPart(UriPartial.Authority), form.Action.GetLeftPart(UriPartial.Authority));
        form.Fields["username"] = username;
        form.Fields["password"] = Environment.GetEnvironmentVariable("BQATLAS_KEYCLOAK_PASSWORD")!;
        var response = await Follow(client, await client.PostAsync(form.Action, new FormUrlEncodedContent(form.Fields)));
        // ASP.NET's default OIDC response mode is form_post. Submit the real provider's
        // code/state fields to the actual callback; never mint an application ticket here.
        var html = await response.Content.ReadAsStringAsync();
        if (html.Contains("<form", StringComparison.OrdinalIgnoreCase))
        {
            var callback = Form(html);
            Assert.Equal(fixture.Address.GetLeftPart(UriPartial.Authority), callback.Action.GetLeftPart(UriPartial.Authority));
            Assert.Equal("/signin-oidc", callback.Action.AbsolutePath);
            Assert.True(callback.Fields.ContainsKey("code") && callback.Fields.ContainsKey("state"));
            response = await Follow(client, await client.PostAsync(callback.Action, new FormUrlEncodedContent(callback.Fields)));
        }
        var session = await client.GetFromJsonAsync<JsonElement>("/api/v1/session");
        Assert.True(session.GetProperty("authenticated").GetBoolean());
        Assert.Equal("oidc", session.GetProperty("authMode").GetString());
        await StarterFixture.Csrf(client);
        return client;
    }
    private static async Task<JsonElement> Json(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>());
    }
    private static HttpRequestMessage Write(HttpMethod method, string path, string version, object? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add("If-Match", '"' + version + '"');
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }
    [Fact]
    public async Task LiveProviderRolesProtectDraftsAndDirectApisAndLogoutEndsBothSessions()
    {
        using var anonymous = fixture.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/manifest")).StatusCode);
        using var admin = await Login("admin");
        const string customers = "/api/v1/crm/customers", quotes = "/api/v1/sales/quotes";
        var customerInput = new { code = "OIDC-1", name = "Live provider fixture", active = true };
        var customer = await Json(await admin.PostAsJsonAsync(customers, customerInput), HttpStatusCode.Created);
        var customerId = customer.GetProperty("data").GetProperty("id").GetString();
        var customerVersion = customer.GetProperty("version").GetString()!;
        var quoteInput = new { customerId, date = "2026-09-27", currency = "USD", lines = new[] { new { id = Guid.NewGuid(), description = "Draft", quantity = "2", unitPrice = "12.50" } } };
        var quote = await Json(await admin.PostAsJsonAsync(quotes, quoteInput), HttpStatusCode.Created);
        var quoteId = quote.GetProperty("data").GetProperty("id").GetString();
        var quoteVersion = quote.GetProperty("version").GetString()!;
        Assert.True(quote.GetProperty("capabilities").GetProperty("edit").GetBoolean());

        using var reader = await Login("reader");
        var session = await reader.GetFromJsonAsync<JsonElement>("/api/v1/session");
        Assert.Equal(new[] { "crm.customers.lookup", "crm.customers.read", "sales.quotes.read" }, session.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()).Order().ToArray());
        var manifest = await reader.GetFromJsonAsync<JsonElement>("/api/v1/manifest");
        Assert.Equal(2, manifest.GetProperty("resources").GetArrayLength());
        await Json(await reader.GetAsync(customers + "/" + customerId));
        await Json(await reader.GetAsync("/odata/v1/crm/Customers?$count=true&$top=10"));
        await Json(await reader.PostAsJsonAsync(customers + "/lookup", new { search = "OIDC-1", page = 0, pageSize = 10 }));
        var draft = await Json(await reader.GetAsync(quotes + "/" + quoteId));
        Assert.Equal("draft", draft.GetProperty("data").GetProperty("status").GetString());
        Assert.False(draft.GetProperty("capabilities").GetProperty("edit").GetBoolean());
        Assert.False(draft.GetProperty("capabilities").GetProperty("delete").GetBoolean());
        Assert.Empty(draft.GetProperty("capabilities").GetProperty("commands").EnumerateArray());
        foreach (var request in new[] {
            Write(HttpMethod.Post, customers, customerVersion, customerInput),
            Write(HttpMethod.Put, customers + "/" + customerId, customerVersion, customerInput),
            Write(HttpMethod.Delete, customers + "/" + customerId, customerVersion),
            Write(HttpMethod.Post, quotes, quoteVersion, quoteInput),
            Write(HttpMethod.Put, quotes + "/" + quoteId, quoteVersion, quoteInput),
            Write(HttpMethod.Delete, quotes + "/" + quoteId, quoteVersion),
            Write(HttpMethod.Post, quotes + "/" + quoteId + "/submit", quoteVersion) })
        { using (request) Assert.Equal(HttpStatusCode.Forbidden, (await reader.SendAsync(request)).StatusCode); }
        Assert.Equal(customerVersion, (await Json(await admin.GetAsync(customers + "/" + customerId))).GetProperty("version").GetString());
        Assert.Equal(quoteVersion, (await Json(await admin.GetAsync(quotes + "/" + quoteId))).GetProperty("version").GetString());

        using var unassigned = await Login("unassigned");
        Assert.Empty((await unassigned.GetFromJsonAsync<JsonElement>("/api/v1/session")).GetProperty("permissions").EnumerateArray());
        Assert.Empty((await unassigned.GetFromJsonAsync<JsonElement>("/api/v1/manifest")).GetProperty("resources").EnumerateArray());
        foreach (var path in new[] { customers + "/" + customerId, quotes + "/" + quoteId, "/odata/v1/crm/Customers?$count=true&$top=10" })
            Assert.Equal(HttpStatusCode.Forbidden, (await unassigned.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await unassigned.PostAsJsonAsync(customers + "/query", new { page = 0, pageSize = 10 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await unassigned.PostAsJsonAsync(customers + "/lookup", new { search = "OIDC-1", page = 0, pageSize = 10 })).StatusCode);

        var logout = await Follow(reader, await reader.PostAsync("/auth/logout", null));
        var logoutHtml = await logout.Content.ReadAsStringAsync();
        if (logoutHtml.Contains("<form", StringComparison.OrdinalIgnoreCase))
        {
            var form = Form(logoutHtml, logout.RequestMessage!.RequestUri); form.Fields["confirmLogout"] = "";
            await Follow(reader, await reader.PostAsync(form.Action, new FormUrlEncodedContent(form.Fields)));
        }
        Assert.False((await reader.GetFromJsonAsync<JsonElement>("/api/v1/session")).GetProperty("authenticated").GetBoolean());
        Assert.Equal(HttpStatusCode.Unauthorized, (await reader.GetAsync(quotes + "/" + quoteId)).StatusCode);
        var nextLogin = await Follow(reader, await reader.GetAsync("/auth/login"));
        Assert.Contains("name=\"username\"", await nextLogin.Content.ReadAsStringAsync());
    }
}

// Browsers treat localhost/loopback as trustworthy for Secure cookies even during
// HTTP development. HttpClient's default CookieContainer does not. Emulate only
// that browser exception for the two explicit loopback test origins; production
// cookie settings and OIDC validation remain untouched.
internal sealed class LoopbackCookieHandler(Uri application, Uri provider) : DelegatingHandler(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
{
    private readonly CookieContainer cookies = new();
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var uri = request.RequestUri!;
        if (!IPAddress.TryParse(uri.Host, out var address) || !IPAddress.IsLoopback(address) ||
            (uri.GetLeftPart(UriPartial.Authority) != application.GetLeftPart(UriPartial.Authority) && uri.GetLeftPart(UriPartial.Authority) != provider.GetLeftPart(UriPartial.Authority)))
            throw new InvalidOperationException("The development cookie adapter only allows the isolated loopback origins.");
        var cookieUri = new UriBuilder(uri) { Scheme = "https" }.Uri;
        var header = cookies.GetCookieHeader(cookieUri);
        if (header.Length > 0) request.Headers.TryAddWithoutValidation("Cookie", header);
        var response = await base.SendAsync(request, cancellationToken);
        if (response.Headers.TryGetValues("Set-Cookie", out var values))
            foreach (var value in values) cookies.SetCookies(cookieUri, value);
        return response;
    }
}
