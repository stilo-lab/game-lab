'use strict';

// Keep the chosen visual style independently of the model's spelling/font choices.
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*/gu;
function parts(value, fallback = '📁') {
  const text = String(value).normalize('NFKC');
  const emoji = text.match(EMOJI)?.[0] || String(fallback).match(EMOJI)?.[0] || fallback;
  const label = text.replace(EMOJI, '').replace(/^[\s『』「」【】\[\]|│┃•·]+|[\s『』「」【】\[\]|│┃•·]+$/gu, '').trim();
  return {emoji, label};
}
function font(text, style) {
  const exceptions = {C:'ℂ',H:'ℍ',N:'ℕ',P:'ℙ',Q:'ℚ',R:'ℝ',Z:'ℤ'};
  return Array.from(text, c => {
    if (style === 'fancy' && exceptions[c]) return exceptions[c];
    const n = c.codePointAt(0);
    if (n >= 65 && n <= 90) return String.fromCodePoint((style === 'fancy' ? 0x1d538 : 0x1d400) + n - 65);
    if (n >= 97 && n <= 122) return String.fromCodePoint((style === 'fancy' ? 0x1d552 : 0x1d41a) + n - 97);
    return c;
  }).join('');
}
function applySelectedStyle(plan, style, base) {
  if (!['brackets','clean','fancy'].includes(style)) return plan;
  const oldCategories = new Map((base?.categories || []).map(c => [c.key,c]));
  const oldChannels = new Map((base?.categories || []).flatMap(c => c.channels).map(c => [c.key,c]));
  return {...plan, categories:plan.categories.map(cat => {
    const {emoji,label} = parts(cat.name, oldCategories.get(cat.key)?.name || '📁');
    return {...cat, name:style === 'fancy' ? `${emoji} | ${label.toUpperCase()} | ${emoji}` : `${emoji} ${label}`, channels:cat.channels.map(ch => {
      const old = oldChannels.get(ch.key);
      const {emoji,label} = parts(ch.name, old?.name || (ch.kind === 'voice' ? '🔊' : '💬'));
      return {...ch, name:style === 'clean' ? `${emoji}│${label.toLowerCase()}` : style === 'brackets' ? `『${emoji}』${font(label,style)}` : `${emoji}${font(label,style)}`};
    })};
  })};
}
function positionEntries(operations, record, cache) {
  if (!operations.restyle) return [];
  const entries = [];
  operations.categories.forEach((cat,position) => {
    const channel = record.categories[cat.key];
    if (cache.has(channel)) entries.push({channel,position});
    // Discord sorts text and voice into separate groups inside a category.
    for (const kind of ['text','voice']) {
      operations.channels.filter(ch => ch.category === cat.key && ch.kind === kind).forEach((ch,position) => {
        const channel = record.channels[ch.key];
        if (cache.has(channel)) entries.push({channel,position});
      });
    }
  });
  return entries;
}
module.exports = {applySelectedStyle,positionEntries};
