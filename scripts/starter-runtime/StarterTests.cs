using System.Data.Common;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AcmeErp.Crm;
using Microsoft.EntityFrameworkCore;
using Xunit;

public sealed class StarterFixture : IAsyncLifetime
{
    public readonly string Email = "admin@starter.test";
    public readonly string Password = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)) + "aA1!";
    public Uri Address { get; private set; } = null!;
    private string database = "", connection = "", provider = "", hostPath = "", hostDirectory = "";
    private Process? server;
    private Task? output, error;
    private readonly StringBuilder diagnostics = new();
    public async Task InitializeAsync()
    {
        var source = Environment.GetEnvironmentVariable("BQATLAS_TEST_CONNECTION") ?? throw new InvalidOperationException("A disposable database server is required.");
        provider = Environment.GetEnvironmentVariable("BQATLAS_TEST_PROVIDER") ?? "postgresql";
        if (provider is not ("postgresql" or "sqlserver")) throw new InvalidOperationException("Unsupported provider.");
        database = "bqatlas_starter_" + Guid.NewGuid().ToString("N");
        var builder = new DbConnectionStringBuilder { ConnectionString = source }; builder["Database"] = database; connection = builder.ConnectionString;
        hostPath = Environment.GetEnvironmentVariable("BQATLAS_STARTER_HOST") ?? throw new InvalidOperationException("The runner must identify the generated host assembly.");
        hostDirectory = Environment.GetEnvironmentVariable("BQATLAS_STARTER_DIRECTORY") ?? throw new InvalidOperationException("The runner must identify the generated host content root.");
        await RecordDatabaseLifecycle("allocated");
        await Migrate(); await Start();
        await RecordDatabaseLifecycle("running");
    }
    private ProcessStartInfo Command(params string[] args)
    {
        var start = new ProcessStartInfo("dotnet") { WorkingDirectory = hostDirectory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        start.ArgumentList.Add(hostPath); foreach (var arg in args) start.ArgumentList.Add(arg);
        start.Environment["ConnectionStrings__Application"] = connection; start.Environment["Database__Provider"] = provider;
        start.Environment["Authentication__Mode"] = "local"; start.Environment["Authentication__Bearer__Enabled"] = "false";
        start.Environment["ASPNETCORE_ENVIRONMENT"] = "Development"; start.Environment["ASPNETCORE_URLS"] = "http://127.0.0.1:0";
        start.Environment["Bootstrap__Email"] = Email; start.Environment["Bootstrap__Password"] = Password;
        start.Environment["Logging__LogLevel__Default"] = "Warning"; start.Environment["Logging__LogLevel__Microsoft.Hosting.Lifetime"] = "Information";
        return start;
    }
    public async Task Migrate()
    {
        using var process = Process.Start(Command("--migrate"))!;
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(120));
        try { await process.WaitForExitAsync(timeout.Token); } catch { process.Kill(entireProcessTree: true); throw; }
        Assert.True(process.ExitCode == 0, (await stdout) + (await stderr));
    }
    private async Task Start()
    {
        diagnostics.Clear();
        server = Process.Start(Command())!;
        var ready = new TaskCompletionSource<Uri>(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task Read(StreamReader stream)
        {
            while (await stream.ReadLineAsync() is { } line)
            {
                lock (diagnostics) { if (diagnostics.Length < 16000) diagnostics.AppendLine(line); }
                var match = Regex.Match(line, @"Now listening on:\s+(http://127\.0\.0\.1:\d+)");
                if (match.Success) ready.TrySetResult(new Uri(match.Groups[1].Value));
            }
        }
        output = Read(server.StandardOutput); error = Read(server.StandardError);
        var exit = server.WaitForExitAsync();
        var completed = await Task.WhenAny(ready.Task, exit, Task.Delay(TimeSpan.FromSeconds(90)));
        if (completed != ready.Task) throw new InvalidOperationException("Generated starter did not become ready. " + diagnostics);
        Address = await ready.Task;
    }
    public async Task Stop()
    {
        if (server is null) return;
        if (!server.HasExited) { server.Kill(entireProcessTree: true); await server.WaitForExitAsync(); }
        if (output is not null) await output; if (error is not null) await error;
        server.Dispose(); server = null;
    }
    public async Task RestartAndReapplyMigrations() { await Stop(); await Migrate(); await Start(); }
    public async Task BrowserReview()
    {
        var path = Environment.GetEnvironmentVariable("BQATLAS_BROWSER_REVIEW");
        if (string.IsNullOrEmpty(path)) return;
        var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write };
        if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        await using (var stream = new FileStream(path, options))
            await JsonSerializer.SerializeAsync(stream, new { origin = Address.GetLeftPart(UriPartial.Authority), email = Email, password = Password });
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(40));
            while (!File.Exists(path + ".done")) await Task.Delay(1000, timeout.Token);
        }
        finally { File.Delete(path); }
    }
    public HttpClient Client(CookieContainer? cookies = null) => new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = true, CookieContainer = cookies ?? new CookieContainer() }) { BaseAddress = Address };
    public static async Task Csrf(HttpClient client)
    {
        var token = await client.GetFromJsonAsync<JsonElement>("/api/v1/session/csrf"); client.DefaultRequestHeaders.Remove("X-BQATLAS-CSRF"); client.DefaultRequestHeaders.Add("X-BQATLAS-CSRF", token.GetProperty("token").GetString());
    }
    private async Task RecordDatabaseLifecycle(string status, string? failureType = null)
    {
        var path = Environment.GetEnvironmentVariable("BQATLAS_DATABASE_LIFECYCLE");
        if (string.IsNullOrEmpty(path)) return;
        // Keep recovery metadata free of connection strings, credentials and exception messages.
        var temporary = path + ".tmp";
        await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(new
        {
            provider, database, status, failureType, recordedAt = DateTimeOffset.UtcNow
        }));
        File.Move(temporary, path, overwrite: true);
    }
    public async Task DisposeAsync()
    {
        await Stop();
        if (string.IsNullOrEmpty(connection)) return;
        await RecordDatabaseLifecycle("cleanup-pending");
        try
        {
            var options = new DbContextOptionsBuilder<CrmDbContext>(); if (provider == "postgresql") options.UseNpgsql(connection); else options.UseSqlServer(connection);
            await using var db = new CrmDbContext(options.Options);
            if (!database.StartsWith("bqatlas_starter_", StringComparison.Ordinal) || db.Database.GetDbConnection().Database != database)
                throw new InvalidOperationException("Refusing cleanup of an unexpected database.");
            await db.Database.EnsureDeletedAsync();
            await RecordDatabaseLifecycle("deleted");
        }
        catch (Exception exception)
        {
            await RecordDatabaseLifecycle("cleanup-failed", exception.GetType().FullName);
            throw;
        }
    }
}
public sealed class StarterTests(StarterFixture fixture) : IClassFixture<StarterFixture>
{
    private static async Task<JsonElement> Json(HttpResponseMessage response, HttpStatusCode expected)
    {
        var text = await response.Content.ReadAsStringAsync(); Assert.True(response.StatusCode == expected, $"Expected {expected}, received {response.StatusCode}: {text}"); return JsonDocument.Parse(text).RootElement.Clone();
    }
    private static HttpRequestMessage Versioned(HttpMethod method, string path, string version, object? body = null)
    {
        var request = new HttpRequestMessage(method, path); request.Headers.TryAddWithoutValidation("If-Match", '"' + version + '"'); if (body is not null) request.Content = JsonContent.Create(body); return request;
    }
    [Fact]
    public async Task PackagedStarterRunsMigrationsLoginCrudAndQuoteSubmissionAndSurvivesRestart()
    {
        var cookies = new CookieContainer(); using var client = fixture.Client(cookies);
        var index = await client.GetStringAsync("/"); Assert.Contains("<app-root", index);
        var script = Regex.Match(index, "<script[^>]+src=\"([^\"]+\\.js)\""); Assert.True(script.Success, "The generated Angular entry bundle must be served.");
        var javascript = await client.GetAsync(script.Groups[1].Value); Assert.Equal(HttpStatusCode.OK, javascript.StatusCode); Assert.True((await javascript.Content.ReadAsByteArrayAsync()).Length > 1000);
        var session = await client.GetFromJsonAsync<JsonElement>("/api/v1/session"); Assert.False(session.GetProperty("authenticated").GetBoolean()); Assert.Equal("local", session.GetProperty("authMode").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/manifest")).StatusCode);
        var login = new { email = fixture.Email, password = fixture.Password };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/auth/login", login)).StatusCode);
        await StarterFixture.Csrf(client); Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/auth/login", login)).StatusCode); await StarterFixture.Csrf(client);
        session = await client.GetFromJsonAsync<JsonElement>("/api/v1/session"); Assert.True(session.GetProperty("authenticated").GetBoolean()); Assert.Contains(session.GetProperty("permissions").EnumerateArray(), p => p.GetString() == "sales.quotes.submit");
        var manifest = await client.GetFromJsonAsync<JsonElement>("/api/v1/manifest"); Assert.Contains(manifest.GetProperty("resources").EnumerateArray(), r => r.GetProperty("id").GetString() == "crm.customers"); Assert.Contains(manifest.GetProperty("resources").EnumerateArray(), r => r.GetProperty("id").GetString() == "sales.quotes");
        const string customers = "/api/v1/crm/customers";
        var customerInput = new { code = "STARTER-1", name = "Starter Customer", email = "customer@starter.test", active = true };
        var customer = await Json(await client.PostAsJsonAsync(customers, customerInput), HttpStatusCode.Created); var customerId = customer.GetProperty("data").GetProperty("id").GetString()!; var originalVersion = customer.GetProperty("version").GetString()!;
        var changedInput = new { code = "STARTER-1", name = "Updated Starter Customer", email = "customer@starter.test", active = true };
        using (var update = Versioned(HttpMethod.Put, customers + "/" + customerId, originalVersion, changedInput)) customer = await Json(await client.SendAsync(update), HttpStatusCode.OK);
        using (var stale = Versioned(HttpMethod.Put, customers + "/" + customerId, originalVersion, customerInput)) Assert.Equal(HttpStatusCode.PreconditionFailed, (await client.SendAsync(stale)).StatusCode);
        var lookup = await Json(await client.PostAsJsonAsync(customers + "/lookup", new { search = "STARTER-1", page = 0, pageSize = 25 }), HttpStatusCode.OK); Assert.Equal(customerId, Assert.Single(lookup.GetProperty("items").EnumerateArray()).GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(customers, new { code = "bad/code", name = "Invalid", email = "", active = true })).StatusCode);
        var odata = await Json(await client.GetAsync("/odata/v1/crm/Customers?$filter=Code%20eq%20'STARTER-1'&$top=10"), HttpStatusCode.OK); Assert.Equal(customerId, Assert.Single(odata.GetProperty("value").EnumerateArray()).GetProperty("Id").GetString());
        const string quotes = "/api/v1/sales/quotes";
        var quoteInput = new { customerId, date = "2026-09-26", currency = "USD", lines = new[] { new { id = Guid.NewGuid(), description = "Precision", quantity = "2.125", unitPrice = "12.3456" }, new { id = Guid.NewGuid(), description = "Half cent", quantity = "1", unitPrice = "0.005" } } };
        var quote = await Json(await client.PostAsJsonAsync(quotes, quoteInput), HttpStatusCode.Created); var quoteId = quote.GetProperty("data").GetProperty("id").GetString()!; var draftVersion = quote.GetProperty("version").GetString()!;
        Assert.Equal("26.24", quote.GetProperty("data").GetProperty("total").GetString()); Assert.True(quote.GetProperty("capabilities").GetProperty("edit").GetBoolean());
        var key = Guid.NewGuid().ToString();
        using (var submit = Versioned(HttpMethod.Post, quotes + "/" + quoteId + "/submit", draftVersion)) { submit.Headers.Add("Idempotency-Key", key); quote = await Json(await client.SendAsync(submit), HttpStatusCode.OK); }
        Assert.Equal("submitted", quote.GetProperty("data").GetProperty("status").GetString()); Assert.False(quote.GetProperty("capabilities").GetProperty("edit").GetBoolean()); Assert.False(quote.GetProperty("capabilities").GetProperty("delete").GetBoolean());
        var submittedVersion = quote.GetProperty("version").GetString()!;
        using (var replay = Versioned(HttpMethod.Post, quotes + "/" + quoteId + "/submit", draftVersion)) { replay.Headers.Add("Idempotency-Key", key); var repeated = await Json(await client.SendAsync(replay), HttpStatusCode.OK); Assert.Equal(submittedVersion, repeated.GetProperty("version").GetString()); }
        using (var immutable = Versioned(HttpMethod.Put, quotes + "/" + quoteId, submittedVersion, quoteInput)) Assert.Equal(HttpStatusCode.Conflict, (await client.SendAsync(immutable)).StatusCode);
        var disposable = await Json(await client.PostAsJsonAsync(customers, new { code = "DELETE-1", name = "Disposable", email = "", active = true }), HttpStatusCode.Created);
        using (var delete = Versioned(HttpMethod.Delete, customers + "/" + disposable.GetProperty("data").GetProperty("id").GetString(), disposable.GetProperty("version").GetString()!)) Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(delete)).StatusCode);
        await fixture.RestartAndReapplyMigrations();
        using var restarted = fixture.Client(cookies); session = await restarted.GetFromJsonAsync<JsonElement>("/api/v1/session"); Assert.True(session.GetProperty("authenticated").GetBoolean());
        var persisted = await restarted.GetFromJsonAsync<JsonElement>(quotes + "/" + quoteId); Assert.Equal(submittedVersion, persisted.GetProperty("version").GetString()); Assert.Equal("26.24", persisted.GetProperty("data").GetProperty("total").GetString()); Assert.Equal("submitted", persisted.GetProperty("data").GetProperty("status").GetString());
        await StarterFixture.Csrf(restarted); Assert.Equal(HttpStatusCode.NoContent, (await restarted.PostAsync("/auth/logout", null)).StatusCode); Assert.Equal(HttpStatusCode.Unauthorized, (await restarted.GetAsync(quotes + "/" + quoteId)).StatusCode);
        Assert.False((await restarted.GetFromJsonAsync<JsonElement>("/api/v1/session")).GetProperty("authenticated").GetBoolean());
        await fixture.BrowserReview();
    }
}
