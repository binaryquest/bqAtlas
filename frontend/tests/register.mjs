import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='@bqatlas/contracts')return next(new URL('../projects/contracts/dist/index.js',import.meta.url).href,context);if(specifier==='@bqatlas/ui')return next(new URL('../dist/ui/fesm2022/bqatlas-ui.mjs',import.meta.url).href,context);return next(specifier,context);}});
