import {Injectable, inject, signal} from '@angular/core';
import {AtlasSession} from './session';
import {CrudWorkspace} from './crud';

export type MenuNode = {
  id: string;
  label: string;
  labelKey?: string;
  order?: number;
  permission?: string;
} & ({kind:'group'; children:readonly MenuNode[]} | {kind:'resource'; resource:string} | {kind:'command'; command:string});
export interface MenuCommand {id:string; permission:string; run:()=>void|Promise<void>}

export function visibleMenu(nodes:readonly MenuNode[], permissions:ReadonlySet<string>, resources:ReadonlySet<string>, commands:ReadonlyMap<string,MenuCommand>):MenuNode[] {
  return [...nodes].sort((a,b)=>(a.order??0)-(b.order??0)||a.id.localeCompare(b.id)).flatMap<MenuNode>(node=>{
    if(node.permission&&!permissions.has(node.permission))return [];
    if(node.kind==='group') {const children=visibleMenu(node.children,permissions,resources,commands);return children.length?[{...node,children}]:[];}
    if(node.kind==='resource')return resources.has(node.resource)?[{...node}]:[];
    const command=commands.get(node.command);
    return command&&permissions.has(command.permission)?[{...node}]:[];
  });
}
export function validateMenu(nodes:readonly MenuNode[]):void {
  const ids=new Set<string>();
  const walk=(items:readonly MenuNode[],depth:number)=>{
    if(depth>12)throw new Error('Menu nesting exceeds twelve levels.');
    for(const item of items){
      if(!item.id||ids.has(item.id))throw new Error(`Duplicate or empty menu ID: ${item.id}`);
      ids.add(item.id);
      if(!item.label.trim()||!Number.isFinite(item.order??0))throw new Error('Menu labels and ordering must be valid.');
      if(item.kind==='group')walk(item.children,depth+1);
      else if(item.kind==='resource'?!item.resource:item.kind==='command'?!item.command:true)throw new Error('Invalid menu target.');
    }
  };
  walk(nodes,0);
}
@Injectable({providedIn:'root'})
export class AtlasMenus {
  private readonly session=inject(AtlasSession);
  private readonly crud=inject(CrudWorkspace);
  private readonly nodes=signal<readonly MenuNode[]>([]);
  private readonly commands=new Map<string,MenuCommand>();
  register(...nodes:MenuNode[]){const next=[...this.nodes(),...nodes];validateMenu(next);this.nodes.set(structuredClone(next));}
  registerCommand(command:MenuCommand){
    if(!command.id||!command.permission||this.commands.has(command.id))throw new Error('Menu commands require a unique ID and permission.');
    this.commands.set(command.id,command);
    this.nodes.update(nodes=>[...nodes]);
  }
  visible():MenuNode[]{
    if(!this.session.authenticated())return [];
    return visibleMenu(this.nodes(),new Set(this.session.info()!.permissions),new Set(this.crud.menus().map(feature=>feature.resource)),this.commands);
  }
  async activate(id:string):Promise<void>{
    const find=(nodes:readonly MenuNode[]):MenuNode|undefined=>{for(const node of nodes){if(node.id===id)return node;if(node.kind==='group'){const match=find(node.children);if(match)return match;}}return undefined;};
    const node=find(this.visible());
    if(!node||node.kind==='group')throw new Error('This menu action is unavailable.');
    if(node.kind==='resource')this.crud.openList(node.resource);
    else await this.commands.get(node.command)!.run();
  }
}
