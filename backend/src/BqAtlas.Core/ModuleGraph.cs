namespace BqAtlas.Core;

public static class ModuleGraph
{
    public static IReadOnlyList<string> Order(IEnumerable<ModuleDefinition> modules)
    {
        var map = new Dictionary<string, ModuleDefinition>(StringComparer.Ordinal);
        foreach (var module in modules)
        {
            if (string.IsNullOrWhiteSpace(module.Id) || !map.TryAdd(module.Id, module))
                throw new InvalidOperationException($"Duplicate or empty module id: {module.Id}");
        }
        var state = new Dictionary<string, int>(StringComparer.Ordinal);
        var result = new List<string>();
        void Visit(string id)
        {
            if (!map.TryGetValue(id, out var module)) throw new InvalidOperationException($"Missing module dependency: {id}");
            if (state.TryGetValue(id, out var value))
            {
                if (value == 1) throw new InvalidOperationException($"Module dependency cycle at {id}");
                return;
            }
            state[id] = 1;
            foreach (var dependency in module.Dependencies.Order(StringComparer.Ordinal)) Visit(dependency);
            state[id] = 2;
            result.Add(id);
        }
        foreach (var id in map.Keys.Order(StringComparer.Ordinal)) Visit(id);
        return result;
    }
}
