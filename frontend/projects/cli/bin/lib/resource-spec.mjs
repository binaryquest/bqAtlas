const names=/^[A-Z][A-Za-z0-9]{1,40}$/;
const fieldName=/^[a-z][A-Za-z0-9]{0,39}$/;
const reserved=new Set(['id','version','modifiedAt','modifiedBy','toDto','equals','getHashCode','toString','getType','finalize','memberwiseClone','equalityContract'].map(v=>v.toLowerCase()));
const decimalUnits=value=>{const [a,b='']=value.split('.');return BigInt(a)*10000n+BigInt(b.padEnd(4,'0'));};
const kinds=['string','email','boolean','integer','date','enum','decimal'];
function object(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object.`);for(const key of Object.keys(value))if(!keys.includes(key))throw new Error(`${label}: unsupported property ${key}.`);}
function text(value,label,max=100){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f]/.test(value))throw new Error(`Invalid ${label}.`);return value;}
export function validateResourceSpec(raw){
 object(raw,['schemaVersion','module','entity','plural','resource','title','key','permissions','fields','list','form'],'resource');
 if(raw.schemaVersion!==1)throw new Error('schemaVersion must be 1.');
 for(const key of ['module','entity','plural'])if(!names.test(raw[key]??'')||['Task','Guid','DateOnly','DateTimeOffset','String','System','DecimalStringConverter','CancellationToken','VersionToken','QueryRequest','DbContext','CultureInfo','ModelBuilder','ResourceDescriptor','JsonSerializer','IQueryable','IOrderedQueryable','Permissions','Actors'].includes(raw[key]))throw new Error(`${key} must be a PascalCase identifier.`);
 if(new Set([raw.module,raw.entity,raw.plural]).size!==3)throw new Error('Module, entity and plural identifiers must differ.');
 if(!/^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/.test(raw.resource??'')||raw.resource.split('.')[0]!==raw.module.toLowerCase())throw new Error('Resource ID must be module.collection in lowercase.');
 text(raw.title,'title');
 object(raw.key,['name','type'],'key');if(raw.key.name!=='id'||raw.key.type!=='uuid')throw new Error('This generator requires an id UUID key. Other key strategies need an application implementation.');
 object(raw.permissions,['read','write','delete','lookup'],'permissions');
 for(const name of ['read','write','delete','lookup'])if(!/^[a-z][a-z0-9.-]{2,119}$/.test(raw.permissions[name]??''))throw new Error(`Invalid ${name} permission.`);
 if(new Set(Object.values(raw.permissions)).size!==4)throw new Error('Each resource operation needs a distinct permission.');
 if(!Array.isArray(raw.fields)||raw.fields.length<1||raw.fields.length>40)throw new Error('Provide 1–40 fields.');
 const seen=new Set();
 for(const field of raw.fields){
  object(field,['name','label','type','required','maxLength','options','scale','maximum','default'],'field');
  if(!fieldName.test(field.name??'')||reserved.has(field.name.toLowerCase())||seen.has(field.name.toLowerCase())||field.name.toLowerCase()===raw.entity.toLowerCase())throw new Error('Invalid, reserved or duplicate field name.');seen.add(field.name.toLowerCase());
  text(field.label,'field label');if(!kinds.includes(field.type))throw new Error(`Unsupported field type ${field.type}.`);
  if(typeof field.required!=='boolean')throw new Error('Every field declares required.');
  if(['string','email'].includes(field.type)){if(!Number.isInteger(field.maxLength)||field.maxLength<1||field.maxLength>2000)throw new Error('Text fields require maxLength between 1 and 2000.');}
  else if(field.maxLength!==undefined)throw new Error('maxLength applies only to text fields.');
  if(field.type==='enum'){if(!Array.isArray(field.options)||!field.options.length||field.options.length>50||new Set(field.options).size!==field.options.length)throw new Error('Enum options must be distinct.');field.options.forEach(v=>{text(v,'enum option',100);if(v!==v.trim())throw new Error('Enum options cannot have surrounding whitespace.');});}else if(field.options!==undefined)throw new Error('options applies only to enum fields.');
  if(field.type==='decimal'){
   if(!Number.isInteger(field.scale)||field.scale<0||field.scale>4)throw new Error('Decimal scale must be 0–4.');
   if(typeof field.maximum!=='string'||!/^\d{1,14}(\.\d{1,4})?$/.test(field.maximum)|| (field.maximum.split('.')[1]?.length??0)>field.scale)throw new Error('Provide a non-negative decimal maximum with at most 14 integral digits and the declared scale.');
  }else if(field.scale!==undefined||field.maximum!==undefined)throw new Error('scale/maximum apply only to decimal fields.');
  const d=field.default;
  if(['string','email','enum','date','decimal'].includes(field.type)&&typeof d!=='string'||field.type==='boolean'&&typeof d!=='boolean'||field.type==='integer'&&(!Number.isInteger(d)||d< -2147483648||d>2147483647))throw new Error('Provide a default matching the field type.');
  if(['string','email'].includes(field.type)&&d.length>field.maxLength)throw new Error('Default exceeds maxLength.');
  if(field.type==='email'&&(field.maxLength<6||(d!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d))))throw new Error('Email fields require room for a valid address and a valid nonempty default.');
  if(field.type==='enum'&&!field.options.includes(d))throw new Error('Enum default must be one of its options.');
  if(field.type==='decimal'&&(!/^\d+(\.\d+)?$/.test(d)||(d.split('.')[1]?.length??0)>field.scale||decimalUnits(d)>decimalUnits(field.maximum)))throw new Error('Invalid decimal default.');
  if(field.type==='date'&&( !/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d||d.startsWith('0000')))throw new Error('Date default must be a calendar date.');
 }
 for(const name of ['list','form']){object(raw[name],name==='list'?['fields','sort']:['fields'],name);const fields=raw[name].fields;if(!Array.isArray(fields)||!fields.length||new Set(fields).size!==fields.length||fields.some(f=>!raw.fields.some(field=>field.name===f)))throw new Error(`Invalid ${name} field order.`);}
 if(raw.form.fields.length!==raw.fields.length)throw new Error('Form must include every editable field.');
 object(raw.list.sort,['field','direction'],'list.sort');if(!raw.fields.some(f=>f.name===raw.list.sort.field)||!['asc','desc'].includes(raw.list.sort.direction))throw new Error('Invalid default sort.');
 return structuredClone(raw);
}
