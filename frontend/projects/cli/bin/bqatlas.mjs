#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {resourceCommand} from './lib/resource-command.mjs';
const args=process.argv.slice(2);
if(args[0]==='generate'&&args[1]==='crud'){resourceCommand(args.slice(2));process.exit(0);}
if(args[0]!=='scaffold' || args[1]!=='master-data') {
 console.log('Usage: bqatlas generate crud --spec resource.json --out ./module [--dry-run] [--regenerate]\n       bqatlas scaffold master-data --module Purchasing --entity Supplier --plural Suppliers --out ./supplier-module [--dry-run]\nGenerates a code/name/email/active master-data module, contracts, REST/OData endpoints, and an Atlas CRUD feature.');
 process.exit(args.includes('--help')||args.length===0?0:1);
}
const options={};
for(let i=2;i<args.length;i++){
 const option=args[i];
 if(option==='--dry-run') {if(options.dryRun)throw new Error('Duplicate --dry-run.');options.dryRun=true;continue;}
 if(!['--module','--entity','--plural','--out'].includes(option)||!args[i+1]||args[i+1].startsWith('--')||options[option.slice(2)])throw new Error('Unknown, missing or duplicate option.');
 options[option.slice(2)]=args[++i];
}
for(const key of ['module','entity','plural'])if(!/^[A-Z][A-Za-z0-9]{1,40}$/.test(options[key]??''))throw new Error(`${key} must be a PascalCase identifier (2–41 characters).`);
if(!options.out)throw new Error('--out is required.');
if(options.entity===options.plural)throw new Error('Entity and plural must differ.');
const target=resolve(options.out);if(existsSync(target))throw new Error('Output already exists; scaffolding never overwrites existing files.');
const id=options.module.toLowerCase(),collection=options.plural.toLowerCase();
const replacements={'BqAtlas.Sample.Crm':`App.Modules.${options.module}`,Customers:options.plural,Customer:options.entity,Crm:options.module,crm:id,customers:collection,customer:options.entity.toLowerCase()};
function transform(value){return value.replace(/BqAtlas\.Sample\.Crm|Customers|Customer|Crm|crm|customers|customer/g,token=>replacements[token]);}
const files=new Map();
for(const [source,path] of [['Customers.cs',`server/Modules/${options.module}/${options.plural}.cs`],['CrmModule.cs',`server/Modules/${options.module}/${options.module}Module.cs`],['CustomerSummary.cs',`server/Modules/${options.module}.Contracts/${options.entity}Summary.cs`]])files.set(path,transform(readFileSync(new URL('../templates/'+source,import.meta.url),'utf8')));
files.set(`server/Modules/${options.module}.Contracts/${options.module}.Contracts.csproj`,'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><IsPackable>false</IsPackable></PropertyGroup></Project>\n');
files.set(`server/Modules/${options.module}/${options.module}.csproj`,`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><IsPackable>false</IsPackable><ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><FrameworkReference Include="Microsoft.AspNetCore.App"/><ProjectReference Include="../${options.module}.Contracts/${options.module}.Contracts.csproj"/>${['AspNetCore','EntityFrameworkCore','OData'].map(name=>`<PackageReference Include="BqAtlas.${name}" Version="0.1.0-alpha.1"/>`).join('')}</ItemGroup></Project>\n`);
files.set('client/feature.ts',`import type {CrudFeature} from '@bqatlas/angular';\nexport const feature: CrudFeature = ${JSON.stringify({resource:`${id}.${collection}`,title:options.plural,icon:'grid',writePermission:`${id}.${collection}.write`,deletePermission:`${id}.${collection}.delete`,defaults:{code:'',name:'',email:'',active:true}},null,2)};\n`);
files.set('README.md',`# ${options.module} module\n\nGenerated source is yours to edit. This preview scaffolds the standard code/name/email/active master-data shape. Arbitrary schema generation and business aggregates are later milestones.\n\nCopy server/Modules into your starter and reference ${options.module}/${options.module}.csproj from the host and both migration projects. Add registry.AddModule(new ${options.module}Module(options => ConfigureDatabase(options, "${id}"))) and registry.AddResource(${options.module}Module.Resource) before registry.Configure. Add the controller assembly to MVC and AddRouteComponents("odata/v1/${id}", ${options.module}Module.ReadModel()). Add the module DbContext migration operation to the host's --migrate block. Generate a design-time factory and migration in each provider project using the CRM factories as the reference. Grant the ${id}.${collection} permission IDs explicitly. Register client/feature.ts with CrudWorkspace.register in your Angular app.\n\nThe generator does not edit your composition root, grant permissions, or apply database migrations automatically.\n`);
files.set(`tests/${options.module}.Tests/${options.module}.Tests.csproj`,`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><IsPackable>false</IsPackable><IsTestProject>true</IsTestProject><ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><ProjectReference Include="../../server/Modules/${options.module}/${options.module}.csproj"/><PackageReference Include="Microsoft.AspNetCore.TestHost" Version="10.0.10"/><PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.3.0"/><PackageReference Include="xunit" Version="2.9.2"/><PackageReference Include="xunit.runner.visualstudio" Version="3.1.5"><PrivateAssets>all</PrivateAssets></PackageReference></ItemGroup></Project>\n`);
files.set(`tests/${options.module}.Tests/ResourceTests.cs`,`using App.Modules.${options.module};
using BqAtlas.Core;
using Xunit;
namespace App.Tests;
public class ResourceTests
{
    [Fact]
    public void BlankCodeCannotBecomeAValidRecord()
    {
        Assert.Throws<ResourceValidationException>(() => ${options.entity}Rules.Validate(new ${options.entity}Input(" ", "Valid name", null)));
    }
    [Fact]
    public void NormalizationPreservesBusinessValues()
    {
        var value = ${options.entity}Rules.Validate(new ${options.entity}Input(" sup-1 ", " Supplier ", null, false));
        Assert.Equal("SUP-1", value.Code);
        Assert.Equal("Supplier", value.Name);
        Assert.False(value.Active);
    }
    [Fact]
    public void ResourceHasAnExplicitReadPermission()
    {
        Assert.Equal("${id}.${collection}.read", ${options.module}Module.Resource.ReadPermission);
    }
}
`);
files.set(`tests/${options.module}.Tests/PermissionTests.cs`,transform(readFileSync(new URL('../templates/PermissionTests.cs',import.meta.url),'utf8')));
files.set('README.md', files.get('README.md') + `\nRun the baseline validation and metadata tests with dotnet test tests/${options.module}.Tests. Add HTTP/database tests for application-specific permission policies and persistence behavior.\n\nUse --dry-run to print the generation manifest without creating files. The manifest records source hashes; it does not authorize automatic regeneration over edited source.\n`);
const manifest={schemaVersion:1,generator:'@bqatlas/cli',version:'0.1.0-alpha.1',kind:'master-data',inputs:{module:options.module,entity:options.entity,plural:options.plural},files:[...files].map(([path,content])=>({path,sha256:createHash('sha256').update(content).digest('hex')})).sort((a,b)=>a.path.localeCompare(b.path))};
const manifestText=JSON.stringify(manifest,null,2)+'\n';
if(options.dryRun){console.log(manifestText);process.exit(0);}
files.set('bqatlas.generation.json',manifestText);
mkdirSync(target,{recursive:true});for(const [path,content] of files){const file=resolve(target,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,content,{flag:'wx'});}
console.log(`Created ${files.size} files in ${target}. See README.md for explicit module registration and migration steps.`);
