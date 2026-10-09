// Builds the folder tree shown in the Proposed Changes panel from proposed target paths ("A/B/file.ext").
export function folderTree(paths) {
 const root={name:'',folders:new Map(),files:[]};
 for(const path of paths) {
  const parts=String(path).split('/').filter(Boolean),file=parts.pop();if(!file)continue;let node=root;
  for(const part of parts){if(!node.folders.has(part))node.folders.set(part,{name:part,folders:new Map(),files:[]});node=node.folders.get(part);}
  node.files.push(file);
 }
 const finish=node=>{const folders=[...node.folders.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(finish);
  return {name:node.name,folders,files:node.files.sort((a,b)=>a.localeCompare(b)),count:node.files.length+folders.reduce((sum,folder)=>sum+folder.count,0)};};
 return finish(root);
}
// Renders a tree from folderTree() into nested lists. Folder rows show how many files they hold.
export function renderTree(doc,tree) {
 const list=doc.createElement('ul');list.className='tree';
 for(const folder of tree.folders) {
  const item=doc.createElement('li'),details=doc.createElement('details'),summary=doc.createElement('summary');details.open=true;
  summary.textContent=`${folder.name} (${folder.count})`;details.append(summary,renderTree(doc,folder));item.append(details);list.append(item);
 }
 for(const file of tree.files){const item=doc.createElement('li');item.className='tree-file';item.textContent=file;list.append(item);}
 return list;
}
