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
        start.Environment["Authentication__Mode"] = Environment.GetEnvironmentVariable("BQATLAS_STARTER_AUTH") ?? "local"; start.Environment["Authentication__Bearer__Enabled"] = "false";
        start.Environment["ASPNETCORE_ENVIRONMENT"] = "Development"; start.Environment["ASPNETCORE_URLS"] = Environment.GetEnvironmentVariable("BQATLAS_STARTER_URLS") ?? "http://127.0.0.1:0";
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
