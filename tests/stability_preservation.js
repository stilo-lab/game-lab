"use strict";
const assert=require('node:assert/strict');
const spec=require('./fixtures/stability-preservation.json');
// Reconstruct the previous release by reversing only explicitly authorized edits.
// Existing preservation hashes still verify the same original code.
function previousRelease(file,source) {
  source=require('./character_preservation').previousStabilityRelease(file,source);
  for(const {before,after} of spec[file]?.edits || []) {
    assert.equal(source.split(after).length-1,1,`Stability edit drift: ${file}`);
    source=source.replace(after,before);
  }
  return source;
}
module.exports={previousRelease,spec};
