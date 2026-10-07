"use strict";
const assert=require('node:assert/strict');
const spec=require('./fixtures/character-preservation.json');
function previousStabilityRelease(file,source){
 source=require('./mega_preservation').previousCharacterRelease(file,source);
 for(const {before,after} of spec[file]?.edits || []){
  assert.equal(source.split(after).length-1,1,`Character edit drift: ${file}`);source=source.replace(after,before);
 }
 return source;
}
module.exports={previousStabilityRelease,spec};
