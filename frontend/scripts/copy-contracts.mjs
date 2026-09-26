import {cpSync,mkdirSync} from 'node:fs';
const target=new URL('../projects/contracts/dist/schemas/',import.meta.url);mkdirSync(target,{recursive:true});cpSync(new URL('../../contracts/v1/',import.meta.url),target,{recursive:true});
