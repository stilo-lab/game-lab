'use strict';
const assert = require('node:assert/strict');
const spec = require('./fixtures/pixel-display-preservation.json');
function previousGeneralRelease(file, source) {
  source=require('./new_mimic_preservation').previousPixelRelease(file,source);
  for (const { before, after } of [...(spec[file]?.edits || [])].reverse()) {
    assert.equal(source.split(after).length - 1, 1, `Pixel display edit drift: ${file}`);
    source = source.replace(after, before);
  }
  return source;
}
module.exports = { previousGeneralRelease, spec };
