// Builds the folder tree shown in the Proposed Changes panel from proposed target paths ("A/B/file.ext").
// Each item is a path string or {path, id, source}; id and source let the panel link a file to where it came from.
export function folderTree(items) {
 const root={name:'',folders:new Map(),files:[]};
 for(const item of items) {
  const {path,id=null,source=null}=typeof item==='string'?{path:item}:item;
  const parts=String(path).split('/').filter(Boolean),file=parts.pop();if(!file)continue;let node=root;
  for(const part of parts){if(!node.folders.has(part))node.folders.set(part,{name:part,folders:new Map(),files:[]});node=node.folders.get(part);}
  node.files.push({name:file,id,source});
 }
 const finish=node=>{const folders=[...node.folders.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(finish);
  return {name:node.name,folders,files:node.files.sort((a,b)=>a.name.localeCompare(b.name)),count:node.files.length+folders.reduce((sum,folder)=>sum+folder.count,0)};};
 return finish(root);
}
// Renders a tree from folderTree() into nested lists. Folder rows show how many files they hold;
// a file row shows its original path underneath when it moved or was renamed.
export function renderTree(doc,tree) {
 const list=doc.createElement('ul');list.className='tree';
 for(const folder of tree.folders) {
  const item=doc.createElement('li'),details=doc.createElement('details'),summary=doc.createElement('summary'),name=doc.createElement('span'),count=doc.createElement('span');details.open=true;
  name.className='tree-folder';name.textContent=folder.name;count.className='tree-count';count.textContent=`${folder.count} ${folder.count===1?'file':'files'}`;
  summary.append(name,count);details.append(summary,renderTree(doc,folder));item.append(details);list.append(item);
 }
 for(const file of tree.files) {
  const item=doc.createElement('li');item.className='tree-file';
  if(file.id){item.dataset.fileId=file.id;item.tabIndex=0;}
  const name=doc.createElement('span');name.textContent=file.name;item.append(name);
  if(file.source&&file.source!==file.name){const from=doc.createElement('span');from.className='tree-from';from.textContent=`from ${file.source}`;item.append(from);}
  list.append(item);
 }
 return list;
}
