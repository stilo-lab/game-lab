'use strict';
const fs=require('node:fs'),path=require('node:path');
// Check local core modules before loading the application; optional games keep their isolation.
function checkInstallation(directory=__dirname){
  const ignored=new Set(['mimic_party','youtube_uploads']);const seen=new Set(),missing=new Set();
  function scan(file){
    if(seen.has(file))return;seen.add(file);
    if(!fs.existsSync(file)){missing.add(path.relative(directory,file));return;}
    const source=fs.readFileSync(file,'utf8');
    for(const match of source.matchAll(/\brequire\(\s*['"](\.\/?[^'"]+)['"]\s*\)/g)){
      const value=match[1],name=path.basename(value).replace(/\.js$/,'');if(ignored.has(name))continue;
      const resolved=path.resolve(path.dirname(file),value);
      if(!resolved.startsWith(directory+path.sep))continue;
      if(path.extname(resolved)&&path.extname(resolved)!=='.js')continue;
      scan(path.extname(resolved)?resolved:resolved+'.js');
    }
  }
  scan(path.join(directory,'index.js'));return [...missing].sort();
}
if(require.main===module){
  const missing=checkInstallation();
  if(missing.length){console.error('Pixel: Installation unvollständig. Folgende Dateien fehlen:\n'+missing.map(x=>'  src/'+x).join('\n')+'\nLade ALLE Dateien aus dem mitgelieferten src-Ordner in den vorhandenen GitHub-Ordner src hoch.');process.exitCode=1;}
  else console.log('Pixel: benötigte lokale Module vorhanden.');
}
module.exports={checkInstallation};
