'use strict';
const assert=require('node:assert/strict');
const spec=require('./fixtures/ai-boost-preservation.json');
function previousRolesRelease(file,source) {
  source=require('./video_fixes_preservation').previousAiBoostRelease(file,source);
  for(const {before,after} of [...(spec[file]?.edits || [])].reverse()) {
    assert.equal(source.split(after).length-1,1,`AI boost edit drift: ${file}`);source=source.replace(after,before);
  }
  return source;
}
module.exports={spec,previousRolesRelease};
