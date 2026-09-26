import {spawnSync} from 'node:child_process';
import {mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const output=fileURLToPath(new URL('../../artifacts/npm/',import.meta.url));mkdirSync(output,{recursive:true});
for(const folder of ['projects/contracts','dist/ui','dist/angular','projects/cli']) {
 copyFileSync(fileURLToPath(new URL('../../LICENSE',import.meta.url)),fileURLToPath(new URL('../'+folder+'/LICENSE',import.meta.url)));
 copyFileSync(fileURLToPath(new URL('../../docs/SOURCE-NOTICE.md',import.meta.url)),fileURLToPath(new URL('../'+folder+'/SOURCE-NOTICE.md',import.meta.url)));
 const result=spawnSync('npm',['pack','--pack-destination',output],{cwd:fileURLToPath(new URL('../'+folder+'/',import.meta.url)),stdio:'inherit'});
 if(result.status!==0)process.exit(result.status??1);
}
