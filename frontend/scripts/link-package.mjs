import {mkdirSync,symlinkSync,existsSync} from 'node:fs';
const name=process.argv[2];if(!['ui','angular'].includes(name))throw new Error('Unknown workspace package.');
const parent=new URL('../node_modules/@bqatlas/',import.meta.url);mkdirSync(parent,{recursive:true});
const target=new URL(name,parent);if(!existsSync(target))symlinkSync('../../dist/'+name,target,'dir');
