export interface AtlasTreeNode {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** True for a branch whose children may not have loaded yet. undefined children means unloaded. */
  hasChildren?: boolean;
  loading?: boolean;
  error?: string;
  /** Optional display values for AtlasTreeGrid columns. */
  values?: Readonly<Record<string, string | number>>;
  children?: readonly AtlasTreeNode[];
}
export interface AtlasTreeRow {
  node: AtlasTreeNode;
  level: number;
  parent: string | null;
  position: number;
  size: number;
  expanded: boolean;
}
/** Filtering includes ancestors of matches. Search expansion does not change saved expansion. */
export function flattenTree(
  nodes: readonly AtlasTreeNode[],
  expanded: readonly string[],
  query = "",
): AtlasTreeRow[] {
  const term = query.trim().toLocaleLowerCase();
  const matches = (node: AtlasTreeNode): boolean =>
    !term ||
    `${node.label} ${node.description ?? ""}`
      .toLocaleLowerCase()
      .includes(term) ||
    !!node.children?.some(matches);
  const result: AtlasTreeRow[] = [];
  const visit = (
    siblings: readonly AtlasTreeNode[],
    level: number,
    parent: string | null,
  ) => {
    const shown = siblings.filter(matches);
    shown.forEach((node, index) => {
      const open =
        (!!node.children?.length || !!node.hasChildren) &&
        (!!term || expanded.includes(node.id));
      result.push({
        node,
        level,
        parent,
        position: index + 1,
        size: shown.length,
        expanded: open,
      });
      if (open) visit(node.children ?? [], level + 1, node.id);
    });
  };
  visit(nodes, 1, null);
  return result;
}
export function findTreeNode(
  nodes: readonly AtlasTreeNode[],
  id: string | null,
): AtlasTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findTreeNode(node.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}
