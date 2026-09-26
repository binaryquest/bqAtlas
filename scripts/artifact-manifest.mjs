import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export function artifactHashes(root) {
  return Object.fromEntries(['npm', 'nuget'].flatMap(kind =>
    readdirSync(join(root, 'artifacts', kind)).filter(name => /\.(tgz|nupkg)$/.test(name)).sort().map(name => {
      const relative = `${kind}/${name}`;
      return [relative, createHash('sha256').update(readFileSync(join(root, 'artifacts', relative))).digest('hex')];
    })));
}
export function writeArtifactManifest(root) {
  const artifacts = artifactHashes(root);
  if (Object.keys(artifacts).length !== 10) throw new Error('Expected four npm and six NuGet artifacts.');
  writeFileSync(join(root, 'artifacts', 'release-manifest.json'), JSON.stringify({
    version: '0.1.0-alpha.1', contractVersion: '1.0',
    createdAt: new Date().toISOString(), distribution: 'local-unpublished',
    artifacts,
  }, null, 2) + '\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  writeArtifactManifest(fileURLToPath(new URL('..', import.meta.url)));
