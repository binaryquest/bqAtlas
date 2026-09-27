import {readFileSync} from 'node:fs';
const q=value=>JSON.stringify(value).replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const cap=s=>s[0].toUpperCase()+s.slice(1);
const csType=f=>({boolean:'bool',integer:'int',date:'DateOnly',decimal:'decimal'}[f.type]??'string');
const literal=f=>f.type==='decimal'?`${f.default}m`:f.type==='date'?`DateOnly.ParseExact(${q(f.default)}, "yyyy-MM-dd", CultureInfo.InvariantCulture)`:q(f.default);
export function generateResource(s){
 const files=new Map(),m=s.module,e=s.entity,p=s.plural,id=s.resource.split('.')[0],collection=s.resource.split('.')[1];
 const ns=`App.Modules.${m}`,folder=`server/Modules/${m}`;
 const fields=s.fields,props=fields.map(f=>cap(f.name));
 const list=fields.map(f=>`c.${cap(f.name)}`).join(', ');
 const shape=fields.map(f=>`${f.type==='decimal'?'[property: JsonConverter(typeof(DecimalStringConverter))] ':''}${csType(f)} ${cap(f.name)}`).join(', ');
 const defaults=fields.map(literal).join(', ');
 const validation=fields.map(f=>{
  const n=cap(f.name),key=q(f.name),local=`v${n}`;let test;
  if(['string','email','enum'].includes(f.type)){
   test=`        var ${local} = (input.${n} ?? "").Trim();\n`;
   if(f.required)test+=`        if (${local}.Length == 0) errors[${key}] = ["This field is required."];\n`;
   if(f.maxLength)test+=`        if (${local}.Length > ${f.maxLength}) errors[${key}] = ["Text is too long."];\n`;
   if(f.type==='email')test+=`        if (${local}.Length > 0 && !new EmailAddressAttribute().IsValid(${local})) errors[${key}] = ["Enter a valid email address."];\n`;
   if(f.type==='enum')test+=`        if (!new string[] { ${f.options.map(q).join(', ')} }.Contains(${local}, StringComparer.Ordinal)) errors[${key}] = ["Choose an available option."];\n`;
   return test;
  }
  if(f.type==='decimal')return `        if (input.${n} < 0 || input.${n} > ${f.maximum}m || decimal.Round(input.${n}, ${f.scale}) != input.${n}) errors[${key}] = ["Decimal is outside the permitted range or scale."];\n`;
  return '';
 }).join('');
 const normalize=fields.filter(f=>['string','email','enum'].includes(f.type)).map(f=>`${cap(f.name)} = v${cap(f.name)}`).join(', ');
 const mapping=fields.map(f=>['string','email','enum'].includes(f.type)?`        entity.Property(c => c.${cap(f.name)}).HasMaxLength(${f.maxLength??Math.max(...f.options.map(v=>v.length))}).IsRequired();`:f.type==='decimal'?`        entity.Property(c => c.${cap(f.name)}).HasPrecision(18, ${f.scale});`:'').filter(Boolean).join('\n');
 const search=fields.filter(f=>['string','email','enum'].includes(f.type)).map(f=>`c.${cap(f.name)}.Contains(search)`).join(' || ');
 const filters=fields.map(f=>{
  const n=cap(f.name),key=q(f.name);
  if(['string','email','enum'].includes(f.type))return `                case ${key}: q = filter.Operator switch { "contains" => q.Where(c => c.${n}.Contains(filter.Value)), "startsWith" => q.Where(c => c.${n}.StartsWith(filter.Value)), _ => q.Where(c => c.${n} == filter.Value) }; break;`;
  const parse=f.type==='date'?`DateOnly.TryParseExact(filter.Value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var v${n})`:f.type==='decimal'?`decimal.TryParse(filter.Value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var v${n})`:f.type==='integer'?`int.TryParse(filter.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v${n})`:`bool.TryParse(filter.Value, out var v${n})`;
  return `                case ${key}: if (filter.Operator != "eq" || !${parse}) throw new ResourceValidationException(new Dictionary<string,string[]> { ["filters"] = ["Use equality with a valid ${f.type}."] }); q = q.Where(c => c.${n} == v${n}); break;`;
 }).join('\n');
 files.set(`${folder}/${p}.cs`,`using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using BqAtlas.Core;
using BqAtlas.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
namespace ${ns};
public static class ${m}Permissions
{
${Object.entries(s.permissions).map(([key,value])=>`    public const string ${cap(key)} = ${q(value)};`).join('\n')}
    public static readonly string[] All = [Read, Write, Delete, Lookup];
}
public sealed record ${e}Input(${fields.map(f=>`${f.required?'[property: JsonRequired] ':''}${f.type==='decimal'?'[property: JsonConverter(typeof(DecimalStringConverter))] ':''}${csType(f)} ${cap(f.name)}`).join(', ')});
public sealed record ${e}Dto(Guid Id, ${shape}, DateTimeOffset ModifiedAt)
{
    public ${e}Dto() : this(Guid.Empty, ${defaults}, default) { }
}
public sealed class ${e}
{
    public Guid Id { get; set; }
${fields.map(f=>`    public ${csType(f)} ${cap(f.name)} { get; set; } = ${literal(f)};`).join('\n')}
    public string Version { get; set; } = VersionToken.New();
    public DateTimeOffset ModifiedAt { get; set; }
    public string ModifiedBy { get; set; } = "";
    public ${e}Dto ToDto() => new(Id, ${props.join(', ')}, ModifiedAt);
}
public sealed class ${m}DbContext(DbContextOptions<${m}DbContext> options) : DbContext(options)
{
    public DbSet<${e}> ${p} => Set<${e}>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema(${q(id)});
        var entity = model.Entity<${e}>(); entity.HasKey(c => c.Id);
${mapping}
        entity.Property(c => c.Version).HasMaxLength(32).IsConcurrencyToken();
        entity.Property(c => c.ModifiedBy).HasMaxLength(256);
    }
}
public static partial class ${e}Rules
{
    public static ${e}Input Validate(${e}Input input)
    {
        var errors = new Dictionary<string,string[]>();
${validation}        var value = input${normalize?` with { ${normalize} }`:''};
        ValidateCustom(value, errors);
        if (errors.Count > 0) throw new ResourceValidationException(errors);
        return value;
    }
    static partial void ValidateCustom(${e}Input value, Dictionary<string,string[]> errors);
}
public sealed class ${e}Service(${m}DbContext db)
{
    private static readonly HashSet<string> Fields = [${fields.map(f=>q(f.name)).join(', ')}];
    public Task<PageResult<${e}Dto>> LookupAsync(QueryRequest request, CancellationToken ct) => QueryAsync(request, ct);
    public async Task<PageResult<${e}Dto>> QueryAsync(QueryRequest request, CancellationToken ct)
    {
        QueryRules.Validate(request, Fields);
        var q = db.${p}.AsNoTracking();
        var search = request.Search.Trim();
${search?`        if (search.Length > 0) q = q.Where(c => ${search});`:''}
        foreach (var filter in request.Filters ?? [])
            switch (filter.Field) {
${filters}
            }
        var total = await q.LongCountAsync(ct);
        IOrderedQueryable<${e}>? ordered = null;
        foreach (var sort in request.Sort ?? []) {
            System.Linq.Expressions.Expression<Func<${e}, object>> key = sort.Field switch { ${fields.map(f=>`${q(f.name)} => c => c.${cap(f.name)}`).join(', ')}, _ => c => c.Id };
            ordered = ordered is null ? (sort.Direction == "asc" ? q.OrderBy(key) : q.OrderByDescending(key)) : (sort.Direction == "asc" ? ordered.ThenBy(key) : ordered.ThenByDescending(key));
        }
        var page = (ordered ?? q.${s.list.sort.direction==='asc'?'OrderBy':'OrderByDescending'}(c => c.${cap(s.list.sort.field)})).ThenBy(c => c.Id).Skip(request.Page * request.PageSize).Take(request.PageSize);
        var rows = await page.Select(c => new ${e}Dto(c.Id, ${list}, c.ModifiedAt)).ToListAsync(ct);
        return new(rows, total, request.Page, request.PageSize);
    }
    public async Task<RecordResult<${e}Dto>?> GetAsync(Guid id, CancellationToken ct) => await db.${p}.AsNoTracking().SingleOrDefaultAsync(c => c.Id == id, ct) is { } row ? new(row.ToDto(), row.Version) : null;
    public async Task<RecordResult<${e}Dto>?> SaveAsync(Guid? id, ${e}Input input, string? expectedVersion, string actor, CancellationToken ct)
    {
        var value = ${e}Rules.Validate(input);
        var row = id is null ? new ${e} { Id = Guid.NewGuid() } : await db.${p}.SingleOrDefaultAsync(c => c.Id == id, ct);
        if (row is null) return null;
        if (id is not null && !VersionToken.Matches(expectedVersion, row.Version)) throw new VersionConflictException();
${fields.map(f=>`        row.${cap(f.name)} = value.${cap(f.name)};`).join('\n')}
        row.Version = VersionToken.New(); row.ModifiedAt = DatabaseTimestamp.UtcNow; row.ModifiedBy = actor;
        if (id is null) db.${p}.Add(row);
        await db.SaveWithConcurrencyAsync(ct); return new(row.ToDto(), row.Version);
    }
    public async Task<bool> DeleteAsync(Guid id, string? expectedVersion, CancellationToken ct)
    {
        var row = await db.${p}.SingleOrDefaultAsync(c => c.Id == id, ct);
        if (row is null) return false;
        if (!VersionToken.Matches(expectedVersion, row.Version)) throw new VersionConflictException();
        db.${p}.Remove(row); await db.SaveWithConcurrencyAsync(ct); return true;
    }
}
${fields.some(f=>f.type==='decimal')?`// Decimal JSON is string-only, keeping browser money values exact.
public sealed class DecimalStringConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String || !decimal.TryParse(reader.GetString(), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value)) throw new JsonException("Expected a non-negative decimal string.");
        return value;
    }
    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options) => writer.WriteStringValue(value.ToString(CultureInfo.InvariantCulture));
}`:''}
`);
 const replacements={'BqAtlas.Sample.Crm.Contracts':ns,'BqAtlas.Sample.Crm':ns,Customers:p,Customer:e,Crm:m,crm:id,customers:collection};
 const transform=value=>value.replace(/BqAtlas\.Sample\.Crm\.Contracts|BqAtlas\.Sample\.Crm|Customers|Customer|Crm|crm|customers/g,token=>replacements[token]);
 let module=transform(readFileSync(new URL('../../templates/CrmModule.cs',import.meta.url),'utf8'));
 const descriptor=s.form.fields.map(name=>fields.find(f=>f.name===name)).map(f=>`new(${q(f.name)}, ${q(f.label)}, Type: ${q(f.type)}, Required: ${f.required}${f.maxLength?`, MaxLength: ${f.maxLength}`:''}${f.options?`, Options: [${f.options.map(q).join(', ')}]`:''}${f.type==='decimal'?`, Scale: ${f.scale}, Maximum: ${q(f.maximum)}`:''})`).join(', ');
 module=module.replace(/public static ResourceDescriptor Resource =>[\s\S]*?;\n/,`public static ResourceDescriptor Resource => new(${q(s.resource)}, ${q(s.title)}, "/api/v1/${id}/${collection}", ${m}Permissions.Read, [${descriptor}], ODataEndpoint: "/odata/v1/${id}/${p}");\n`);
 module=module.replace(new RegExp(`        services.AddScoped<I${e}Directory, ${e}Directory>\\(\\);\\n`),'');
 module=module.replace(/new \w+Dto \{[^}]+\}/,`new ${e}Dto { Id = c.Id, ${fields.map(f=>`${cap(f.name)} = c.${cap(f.name)}`).join(', ')}, ModifiedAt = c.ModifiedAt }`);
 files.set(`${folder}/${m}Module.cs`,module);
 files.set(`${folder}/${e}Rules.Custom.cs`,`namespace ${ns};\n// User-owned: implement business rules here; keep framework validation in the generated file.\npublic static partial class ${e}Rules\n{\n    static partial void ValidateCustom(${e}Input value, Dictionary<string,string[]> errors)\n    {\n        // Example: errors["fieldName"] = ["Your business validation message."];\n    }\n}\n`);
 files.set(`${folder}/${m}.csproj`,`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><IsPackable>false</IsPackable><ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><FrameworkReference Include="Microsoft.AspNetCore.App"/>${['AspNetCore','EntityFrameworkCore','OData'].map(name=>`<PackageReference Include="BqAtlas.${name}" Version="0.1.0-alpha.1"/>`).join('')}</ItemGroup></Project>\n`);
 const tsType=f=>f.type==='boolean'?'boolean':f.type==='integer'?'number':f.type==='enum'?f.options.map(q).join(' | '):'string';
 files.set('client/feature.ts',`import type {CrudFeature} from '@bqatlas/angular';\nexport interface ${e}Input {\n${fields.map(f=>`  ${f.name}: ${tsType(f)};`).join('\n')}\n}\nexport interface ${e}Record extends ${e}Input {id: string; modifiedAt: string;}\nexport const defaults: ${e}Input = ${JSON.stringify(Object.fromEntries(fields.map(f=>[f.name,f.default])),null,2)};\nexport const feature: CrudFeature = {resource:${q(s.resource)},title:${q(s.title)},icon:'grid',writePermission:${q(s.permissions.write)},deletePermission:${q(s.permissions.delete)},defaults:{...defaults},listFields:${JSON.stringify(s.list.fields)}};\nexport const menu = {id:${q(s.resource)},kind:'resource' as const,label:${q(s.title)},resource:${q(s.resource)}};\n`);
 const testdir=`tests/${m}.Tests`;
 files.set(`${testdir}/${m}.Tests.csproj`,`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><IsPackable>false</IsPackable><IsTestProject>true</IsTestProject><ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><ProjectReference Include="../../${folder}/${m}.csproj"/>${[['Microsoft.EntityFrameworkCore.InMemory','10.0.10'],['Microsoft.AspNetCore.TestHost','10.0.10'],['Microsoft.NET.Test.Sdk','18.3.0'],['xunit','2.9.2'],['xunit.runner.visualstudio','3.1.5']].map(([name,version])=>`<PackageReference Include="${name}" Version="${version}"/>`).join('')}</ItemGroup></Project>\n`);
 const sample=fields.map(f=>({...f,default:['string','email','enum'].includes(f.type)?(f.required&&!f.default.trim()?(f.type==='email'?'a@b.co':'A'):f.default.trim()):f.default}));
 files.set('client/package.json',JSON.stringify({name:`${id}-${collection}-feature-tests`,private:true,type:'module',engines:{node:'>=24.15.0'},scripts:{test:'node --test feature.test.mjs'},dependencies:{'@bqatlas/angular':'0.1.0-alpha.1','@bqatlas/contracts':'0.1.0-alpha.1','@bqatlas/ui':'0.1.0-alpha.1','@angular/compiler':'22.1.7','@angular/core':'22.1.7','@angular/common':'22.1.7','@angular/forms':'22.1.7'}},null,2)+'\n');
 files.set('client/fixtures.json',JSON.stringify({fields:s.form.fields.map(name=>{const f=fields.find(f=>f.name===name);return {...f,maxLength:f.maxLength??null,readOnly:false,options:f.options??null};}),valid:Object.fromEntries(sample.map(f=>[f.name,f.default]))},null,2)+'\n');
 files.set('client/feature.test.mjs',`import '@angular/compiler';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFields,selectListFields,editableValues} from '@bqatlas/angular';
import {feature} from './feature.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures.json',import.meta.url),'utf8'));
test('representative input satisfies the resource descriptor',()=>{assert.deepEqual(validateFields(fixture.fields,fixture.valid),{});});
test('list fields resolve and request payloads exclude server-owned values',()=>{
 assert.deepEqual(selectListFields({fields:fixture.fields},feature.listFields).map(f=>f.name),feature.listFields);
 const payload=editableValues(fixture.fields,{...fixture.valid,id:'server-owned',version:'server-owned'});assert.deepEqual(payload,fixture.valid);
});
`);
 files.set(`${testdir}/ResourceTests.cs`,`using System.Globalization;
using System.Text.Json;
using ${ns};
using BqAtlas.Core;
using Microsoft.EntityFrameworkCore;
using Xunit;
namespace App.Tests;
public class ResourceTests
{
    private static ${e}Input Valid() => new(${sample.map(literal).join(', ')});
    [Fact] public void ValidInputAndExplicitPolicyArePreserved() { Assert.Equal(Valid(), ${e}Rules.Validate(Valid())); Assert.Equal(${q(s.permissions.read)}, ${m}Module.Resource.ReadPermission); }
    [Fact] public async Task CrudPreservesFieldsAndRejectsStaleWrites()
    {
        await using var db = new ${m}DbContext(new DbContextOptionsBuilder<${m}DbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var service = new ${e}Service(db); var ct = CancellationToken.None;
        var created = (await service.SaveAsync(null, Valid(), null, "test-actor", ct))!;
${props.map(n=>`        Assert.Equal(Valid().${n}, created.Data.${n});`).join('\n')}
        var loaded = (await service.GetAsync(created.Data.Id, ct))!; Assert.Equal(created.Version, loaded.Version);
        var updated = (await service.SaveAsync(loaded.Data.Id, Valid(), loaded.Version, "second-actor", ct))!;
        Assert.NotEqual(loaded.Version, updated.Version);
        await Assert.ThrowsAsync<VersionConflictException>(() => service.SaveAsync(loaded.Data.Id, Valid(), loaded.Version, "stale-actor", ct));
        Assert.True(await service.DeleteAsync(updated.Data.Id, updated.Version, ct)); Assert.Null(await service.GetAsync(updated.Data.Id, ct));
    }
${fields.filter(f=>f.type==='decimal').map(f=>`    [Fact] public void ${cap(f.name)}UsesExactJsonStringsAndRejectsExcessScale()
    {
        var value = Valid() with { ${cap(f.name)} = ${f.maximum}m };
        var json = JsonSerializer.Serialize(value);
        using var document = JsonDocument.Parse(json);
        Assert.Equal(JsonValueKind.String, document.RootElement.GetProperty(${q(cap(f.name))}).ValueKind);
        Assert.Equal(value, JsonSerializer.Deserialize<${e}Input>(json));
        Assert.Throws<ResourceValidationException>(() => ${e}Rules.Validate(Valid() with { ${cap(f.name)} = ${'0.'+'0'.repeat(f.scale)+'1'}m }));
    }`).join('\n')}
${fields.filter(f=>f.required&&['string','email'].includes(f.type)).map(f=>`    [Fact] public void ${cap(f.name)}CannotBeBlank() => Assert.Throws<ResourceValidationException>(() => ${e}Rules.Validate(Valid() with { ${cap(f.name)} = " " }));`).join('\n')}
}
`);
 files.set(`${testdir}/PermissionTests.cs`,transform(readFileSync(new URL('../../templates/PermissionTests.cs',import.meta.url),'utf8')));
 files.set('resource.json',JSON.stringify(s,null,2)+'\n');
 files.set('README.md',`# ${s.title}\n\nGenerated from resource.json. Copy server/Modules/${m} into your app and reference it from the host and both migration projects. Register ${m}Module with its DbContext provider callback, resource descriptor, MVC controller assembly and OData model (see the starter CRM module). Add explicit migration factories and reviewed migrations for each database. Grant the declared permissions deliberately. Register client/feature.ts with CrudWorkspace and AtlasMenus. See the [complete module-authoring walkthrough](https://github.com/binaryquest/bqAtlas/blob/main/docs/MODULE-AUTHORING.md) for tested composition steps.\n\nRun dotnet test tests/${m}.Tests. In client/, install the released framework dependencies (or local tarballs), then run npm test on Node 24.15+. The generated tests cover field preservation, CRUD state transitions, stale-write rejection, validation and endpoint permission denial. In-memory persistence tests do not qualify a database provider: add PostgreSQL and SQL Server integration tests for your application.\n\nKeep business rules in ${e}Rules.Custom.cs. Search uses provider string semantics; configure collations deliberately. REST decimal JSON uses strings. OData exposes native decimal EDM properties; clients must request IEEE754-compatible JSON to preserve exact decimal values. UUID keys, scalar fields and one resource per module are supported. Relationships, alternate keys, uniqueness and aggregates need explicit application code. The generator rejects unsupported spec properties. Use --regenerate --dry-run to preview updates, then --regenerate to replace unchanged generated files while preserving custom rules. Edited generated files, missing tracked files and untracked collisions are rejected. Do not edit or build while regeneration is running. Interrupted transactions retain .bqatlas-regeneration/journal.json and original files for recovery; never delete that directory without inspecting it.\n`);
 return files;
}
