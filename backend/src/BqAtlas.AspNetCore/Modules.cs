using BqAtlas.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
namespace BqAtlas.AspNetCore;

public interface IBqAtlasModule
{
    ModuleDefinition Definition { get; }
    void ConfigureServices(IServiceCollection services, IConfiguration configuration);
    void MapEndpoints(IEndpointRouteBuilder endpoints);
}
public sealed class BqAtlasRegistry
{
    private readonly List<IBqAtlasModule> modules = [];
    private readonly List<ResourceDescriptor> resources = [];
    public IReadOnlyList<string> ModuleIds => ModuleGraph.Order(modules.Select(x => x.Definition));
    public IReadOnlyList<ResourceDescriptor> Resources => resources;
    public void AddResource(ResourceDescriptor resource)
    {
        if (resources.Any(x => x.Id == resource.Id)) throw new InvalidOperationException($"Duplicate resource: {resource.Id}");
        resources.Add(resource);
    }
    public void AddModule(IBqAtlasModule module) => modules.Add(module);
    public void Configure(IServiceCollection services, IConfiguration config)
    {
        foreach (var id in ModuleIds) modules.Single(x => x.Definition.Id == id).ConfigureServices(services, config);
    }
    public void Map(IEndpointRouteBuilder endpoints)
    {
        foreach (var id in ModuleIds) modules.Single(x => x.Definition.Id == id).MapEndpoints(endpoints);
    }
}
