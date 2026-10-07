'use strict';
const assert=require('node:assert/strict');
const spec=require('./fixtures/mega-preservation.json');
function previousCharacterRelease(file,source){
  source=require('./mimic_preservation').previousMegaRelease(file,source);
  for(const {before,after} of spec[file]?.edits||[]){
    assert.equal(source.split(after).length-1,1,`Mega edit drift: ${file}`);source=source.replace(after,before);
  }
  return source;
}
module.exports={previousCharacterRelease,spec};
