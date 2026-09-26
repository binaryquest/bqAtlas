# Application menus

Register presentation nodes with `AtlasMenus` after registering resources with `CrudWorkspace`. Nodes have stable IDs, labels, optional translation keys, order and optional additional permissions. Groups contain children; leaf nodes target an existing resource or an explicitly registered command.

```ts
menus.register({
  id: 'sales', kind: 'group', label: 'Sales', labelKey: 'menu.sales', order: 20,
  children: [{ id: 'quotes', kind: 'resource', label: 'Quotes', resource: 'sales.quotes' }],
});
```

Render `<bqatlas-menu />` using the standalone `AtlasMenu` component. Its optional `translate` input accepts `(key, fallback) => string`, allowing the application to supply its own localization service. The component supports nested groups and native keyboard-accessible buttons, awaits commands, and displays action failures.

Resource entries require both a registered local feature and a permission-visible server resource. Command entries require a registered handler and its permission. Group permissions constrain every descendant; groups with no visible children disappear. Activation resolves the current visible tree again, preventing invocation through a stale menu after session permissions change. Backend endpoints remain responsible for authorization; menu visibility is only presentation.

Command handlers belong to trusted application code:

```ts
menus.registerCommand({ id: 'sales.refresh', permission: 'sales.quotes.read', run: async () => refreshQuotes() });
menus.register({ id: 'refresh-quotes', kind: 'command', label: 'Refresh quotes', command: 'sales.refresh' });
```

Registration rejects duplicate IDs across nested groups, invalid labels/order and excessive nesting. Menu nodes are cloned so mutations to caller-owned arrays cannot change the registered structure. The starter demonstrates CRM and Sales groups. Browser layout acceptance remains outstanding; routing/deep links and browser Back behavior are separate work.
