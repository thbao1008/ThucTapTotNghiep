import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {parse}=require('@babel/parser'),traverse=require('@babel/traverse').default;
export function missingUiBindings(source,file='component.jsx'){
 const ast=parse(source,{sourceType:'module',plugins:['jsx']}),missing=[];
 const check=p=>{const name=p.node.name;if(!(/^use[A-Z]/.test(name)||['UiText','UiOption','TranslationToggle','englishText'].includes(name)))return;if(!p.scope.hasBinding(name))missing.push({file,line:p.node.loc.start.line,name});};
 traverse(ast,{ReferencedIdentifier:check});
 return missing.filter((item,index)=>missing.findIndex(other=>other.line===item.line&&other.name===item.name)===index);
}
export function checkSourceBindings(root){
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):/\.(?:jsx|js)$/.test(entry.name)?[path.join(dir,entry.name)]:[]);
 return walk(root).flatMap(file=>missingUiBindings(fs.readFileSync(file,'utf8'),file));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const missing=checkSourceBindings(fileURLToPath(new URL('../src',import.meta.url)));
 if(missing.length){for(const item of missing)console.error(`${item.file}:${item.line} Missing binding: ${item.name}`);process.exitCode=1;}
 else console.log('Frontend hook/UI bindings: passed');
}
