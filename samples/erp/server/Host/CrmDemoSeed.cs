using BqAtlas.Core;
using BqAtlas.Sample.Crm;
using BqAtlas.Sample.Sales;
using BqAtlas.Sample.Sales.Contracts;
using BqAtlas.Sample.Engagement;
using Microsoft.EntityFrameworkCore;
namespace BqAtlas.Sample;

// Explicit, development-only sample data. Re-running preserves edited records.
public static class CrmDemoSeed
{
    public static async Task Run(IServiceProvider services, IHostEnvironment environment)
    {
        if(!environment.IsDevelopment()) throw new InvalidOperationException("CRM demo seeding is only available in Development.");
        await using var scope = services.CreateAsyncScope();
        var crm = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var customerService = scope.ServiceProvider.GetRequiredService<CustomerService>();
        var db = scope.ServiceProvider.GetRequiredService<EngagementDbContext>();
        var sales = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        var quoteService = scope.ServiceProvider.GetRequiredService<QuoteService>();
        const string actor = "bqatlas-crm-demo";
        var names = new[]{("DEMO-NORTH", "Northwind Trading", "alex@northwind.example"),("DEMO-ALPINE", "Alpine Studio", "morgan@alpine.example"),("DEMO-SUMMIT", "Summit Manufacturing", "sam@summit.example"),("DEMO-HARBOR", "Harbor Logistics", "lee@harbor.example")};
        var codes = names.Select(n=>n.Item1).ToArray();
        if(await crm.Customers.AnyAsync(c=>codes.Contains(c.Code) && c.ModifiedBy != actor)) throw new InvalidOperationException("A demo customer code is already in use or was edited. Demo seeding stopped without replacing records.");
        var customers = new List<Customer>();
        foreach(var (code,name,email) in names)
        {
            var row = await crm.Customers.SingleOrDefaultAsync(c=>c.Code==code);
            if(row is null) { await customerService.SaveAsync(null,new(code,name,email),null,actor,default); row=await crm.Customers.SingleAsync(c=>c.Code==code); }
            customers.Add(row);
        }
        var products = new[]{("DEMO-CONSULT","Implementation consulting","Service","125.0000"),("DEMO-TRAIN","Team training workshop","Service","500.0000"),("DEMO-SUPPORT","Priority support plan","Service","250.0000"),("DEMO-SCANNER","Warehouse barcode scanner","Stock","189.9500"),("DEMO-LABEL","Shipping label pack","Stock","24.5000")};
        foreach(var (code,name,category,price) in products)
        {
            if(await db.Products.AnyAsync(p=>p.Code==code)) continue;
            var row=new Product{Id=Guid.NewGuid()}; EngagementRules.Apply(new ProductInput(name,code,category,price,"USD",true),row); Stamp(row,actor,code); db.Products.Add(row);
        }
        var today=DateOnly.FromDateTime(DateTime.Today);
        var deals=new[]{("Warehouse rollout","Qualified","8400.00",0),("Customer portal launch","Proposal","12500.00",1),("Support renewal","Won","3000.00",0),("Production planning","Lead","18000.00",2),("Dispatch modernization","Qualified","6200.00",3),("Legacy platform replacement","Lost","4500.00",1)};
        foreach(var (name,stage,amount,index) in deals)
        {
            var id=StableId("opportunity:"+name); if(await db.Opportunities.AnyAsync(o=>o.Id==id))continue;
            var customer=customers[index];var row=new Opportunity{Id=id,CustomerName=customer.Name};
            EngagementRules.Apply(new OpportunityInput(name,customer.Id,stage,amount,"USD",today.AddDays(14+index*7),index%2==0?"Alex Morgan":"Jamie Lee","Demo opportunity. Open the record to change stage, value and next steps."),row);Stamp(row,actor,customer.Name+" "+row.Owner);db.Opportunities.Add(row);
        }
        var activities=new[]{("Confirm rollout requirements","Call","Planned",0,-1),("Present portal proposal","Meeting","Planned",1,1),("Send production discovery notes","Email","Done",2,0),("Book dispatch workshop","Task","Planned",3,3),("Review renewal success","Call","Planned",0,7)};
        foreach(var(name,kind,status,index,days) in activities)
        {
            var id=StableId("activity:"+name);if(await db.Activities.AnyAsync(a=>a.Id==id))continue;
            var customer=customers[index];var row=new Activity{Id=id,CustomerName=customer.Name};
            EngagementRules.Apply(new ActivityInput(name,customer.Id,today.AddDays(days),kind,status,"Alex Morgan","Capture the outcome here and set the status to Done when completed."),row);Stamp(row,actor,customer.Name+" "+row.Owner);db.Activities.Add(row);
        }
        await db.SaveChangesAsync();
        foreach(var customer in customers.Take(3))
        {
            if(await sales.Quotes.AnyAsync(q=>q.CustomerId==customer.Id))continue;
            await quoteService.SaveAsync(null,new QuoteInput(customer.Id,today,"USD",[new(Guid.NewGuid(),"Implementation consulting","8","125.0000"),new(Guid.NewGuid(),"Team training workshop","1","500.0000")]),null,actor,default);
        }
        Console.WriteLine("CRM demo ready: customers, products, pipeline, activities and draft quotes. Existing records were preserved.");
    }
    static Guid StableId(string name)=>new(System.Security.Cryptography.MD5.HashData(System.Text.Encoding.UTF8.GetBytes("bqatlas-demo:"+name)));
    static void Stamp(EngagementRecord row,string actor,string extra){row.ModifiedBy=actor;row.ModifiedAt=DateTimeOffset.UtcNow;row.SearchName=(row.Name+" "+extra).ToUpperInvariant();}
}
