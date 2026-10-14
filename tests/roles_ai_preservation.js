'use strict';
const assert=require('node:assert/strict');
const spec=require('./fixtures/roles-ai-preservation.json');
function previousMimicHostRelease(file,source) {
  source=require('./ai_boost_preservation').previousRolesRelease(file,source);
  for(const {before,after} of [...(spec[file]?.edits || [])].reverse()) {
    assert.equal(source.split(after).length-1,1,`Roles/AI edit drift: ${file}`);
    source=source.replace(after,before);
  }
  return source;
}
module.exports={spec,previousMimicHostRelease};
