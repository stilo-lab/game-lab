'use strict';
// Exact task templates and a bounded linear-expression parser, never JavaScript eval.
const context=require('./assistant_context');
const num=s=>Number(String(s).replace(',','.'));
const fmt=n=>Number(n.toPrecision(12)).toLocaleString('de-DE',{useGrouping:false,maximumSignificantDigits:12});
const finite=n=>{if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error('numeric limit');return n;};
const N='([-+]?\\d+(?:[.,]\\d+)?)';
function rational(n,d=1n){
  if(!d)throw Error('zero');if(d<0n){n=-n;d=-d;}
  if(n.toString(2).length>256||d.toString(2).length>256)throw Error('rational limit');
  let a=n<0n?-n:n,b=d;while(b){const next=a%b;a=b;b=next;}return {n:n/(a||1n),d:d/(a||1n)};
}
const add=(a,b)=>rational(a.n*b.d+b.n*a.d,a.d*b.d),neg=a=>({n:-a.n,d:a.d}),sub=(a,b)=>add(a,neg(b)),mul=(a,b)=>rational(a.n*b.n,a.d*b.d),div=(a,b)=>rational(a.n*b.d,a.d*b.n);
const real=a=>finite(Number(a.n)/Number(a.d));
function decimal(text){const [whole,tail='']=text.split('.');if(whole.length+tail.length>24)throw Error('literal limit');return rational(BigInt(whole+tail),10n**BigInt(tail.length));}
function linear(expression){
  const text=expression.replace(/\s/g,'').replace(/,/g,'.').replace(/(\d|\))(?=x|\()/g,'$1*').replace(/x(?=\()/g,'x*');
  const tokens=text.match(/\d+(?:\.\d+)?|x|[()+*/-]/g)||[];if(text.length>250||tokens.length>150||tokens.join('')!==text)throw Error('expression');
  let pos=0,depth=0,steps=0;const check=v=>{if(++steps>180)throw Error('limit');real(v.a);real(v.b);return v;};
  function atom(){if(++depth>40)throw Error('depth');let v,t=tokens[pos++];
    if(t==='('){v=sum();if(tokens[pos++]!==')')throw Error('bracket');}
    else if(t==='x')v={a:rational(1n),b:rational(0n)};else {if(!/^\d+(?:\.\d+)?$/.test(t||''))throw Error('number');v={a:rational(0n),b:decimal(t)};}depth--;return check(v);}
  function unary(){if(['+','-'].includes(tokens[pos])){const op=tokens[pos++];if(++depth>40)throw Error('depth');const v=unary();depth--;return check({a:op==='-'?neg(v.a):v.a,b:op==='-'?neg(v.b):v.b});}return atom();}
  function product(){let v=unary();while(['*','/'].includes(tokens[pos])){const op=tokens[pos++],r=unary();if(op==='*'){if(v.a.n&&r.a.n)throw Error('nonlinear');v=check({a:add(mul(v.a,r.b),mul(r.a,v.b)),b:mul(v.b,r.b)});}else{if(r.a.n||!r.b.n)throw Error('division');v=check({a:div(v.a,r.b),b:div(v.b,r.b)});}}return v;}
  function sum(){let v=product();while(['+','-'].includes(tokens[pos])){const op=tokens[pos++],r=product(),operation=op==='+'?add:sub;v=check({a:operation(v.a,r.a),b:operation(v.b,r.b)});}return v;}
  const result=sum();if(pos!==tokens.length)throw Error('rest');return result;
}
function equation(question){
  const q=context.norm(question).replace(/[?!]+$/,'').replace(/^(?:(?:lose|berechne)(?: bitte| mir)?(?: die gleichung)?|was ist x in|gleichung)\s*:?\s*/,'');
  if(!q.includes('=')||!q.includes('x'))return null;
  if(!/^[\dx\s.,()+*/=−-]+$/.test(q))return null;
  const parts=q.replace(/−/g,'-').split('=');if(parts.length!==2)return {kind:'unsupported',text:'Bitte gib eine einzelne lineare Gleichung mit x ein, zum Beispiel 2x + 3 = 11.'};
  try{
    const l=linear(parts[0]),r=linear(parts[1]),a=sub(l.a,r.a),b=sub(r.b,l.b);
    if(!a.n)return {kind:'equation',text:!b.n?'Die Gleichung gilt für jedes x.':'Die Gleichung hat keine Lösung.'};
    const exact=div(b,a),value=real(exact),left=add(mul(l.a,exact),l.b),right=add(mul(r.a,exact),r.b);
    if(sub(left,right).n)throw Error('verification');
    const result=exact.d===1n?String(exact.n):`${exact.n}/${exact.d} ≈ ${fmt(value)}`;
    return {kind:'equation',value,text:`x = ${result}\nProbe durch Einsetzen: ${fmt(real(left))} = ${fmt(real(right))}.`};
  }catch{return {kind:'unsupported',text:'Diese Gleichung kann der lokale Löser nicht zuverlässig auswerten. Er unterstützt lineare Gleichungen mit x, Klammern und Division durch Zahlen.'};}
}
function templates(question){
  const q=context.norm(question).replace(/[?!]+$/,'');let m;
  if((m=q.match(new RegExp('^'+N+' ([a-z][a-z -]{0,40}?) kosten '+N+' (?:euro|€)[.,]? (?:wie viel|wieviel|was) kosten '+N+' \\2$')))){
    const count=num(m[1]),price=num(m[3]),wanted=num(m[4]);if(count<=0||price<0||wanted<0)return {kind:'unsupported',text:'Für den Dreisatz brauche ich eine positive Ausgangsmenge und nichtnegative Kosten und Mengen.'};
    try{const each=finite(price/count),value=finite(each*wanted);return {kind:'proportion',value,text:`${fmt(price)} € ÷ ${fmt(count)} × ${fmt(wanted)} = ${fmt(value)} €\nVoraussetzung: gleicher Preis pro Stück, ohne Mengenrabatt.`};}catch{return null;}
  }
  if((m=q.match(/^(?:berechne(?: mir)?(?: den)?\s+|was ist der\s+)?(?:durchschnitt|mittelwert)(?: von| aus)?\s*:?\s*(.+)$/))){
    const list=m[1].split(/\s*;\s*|\s+und\s+|,\s+/).map(s=>s.trim());if(list.length<2||list.length>40||list.some(s=>!/^[-+]?\d+(?:[.,]\d+)?$/.test(s)))return {kind:'unsupported',text:'Nenne mindestens zwei Zahlen, getrennt durch Semikolon: Durchschnitt von 2; 4; 6. Dezimalkommas sind möglich.'};
    try{const values=list.map(num),sum=finite(values.reduce((a,b)=>finite(a+b),0)),value=finite(sum/values.length);return {kind:'average',value,text:`Durchschnitt: ${fmt(sum)} ÷ ${values.length} = ${fmt(value)}`};}catch{return null;}
  }
  if((m=q.match(/^(?:start|beginn)(?:zeit)?(?: um)?\s*:?\s*(\d{1,2}):(\d{2})\s*[,;]\s*dauer\s*:?\s*(.+?)(?:[,;]\s*(?:wann (?:ist (?:das )?ende|endet es)|ende))?$/))){
    const h=Number(m[1]),min=Number(m[2]);if(h>23||min>59)return {kind:'unsupported',text:'Die Startzeit muss zwischen 00:00 und 23:59 liegen.'};
    const pieces=m[3].matchAll(/(\d+)\s*(stunden?|h|minuten?|min)\b/g);let total=0,remaining=m[3],units=new Set();
    for(const part of pieces){const type=/^h|^st/.test(part[2])?'h':'min';if(units.has(type))return null;units.add(type);total+=Number(part[1])*(type==='h'?60:1);remaining=remaining.replace(part[0],'');}
    if(!units.size||remaining.replace(/\bund\b|\s/g,'')||total>10080||total<=0)return null;
    const finish=h*60+min+total,days=Math.floor(finish/1440),clock=finish%1440,time=String(Math.floor(clock/60)).padStart(2,'0')+':'+String(clock%60).padStart(2,'0');
    return {kind:'time',text:`Ende: ${time} Uhr${days===1?' am nächsten Tag':days>1?` nach ${days} Tagen`:''}.\n${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} Uhr + ${total} Minuten.`};
  }
  return null;
}
function calculation(question,tools){
  question=String(question??'').replace(/^(?:(?:nein|nee|ne)[,.! ]+(?:ich meine|ich mein|ich meinte)\s+|(?:ich meine|ich mein|ich meinte|korrektur:)\s+)/i,'');
  const exact=equation(question)||templates(question);if(exact)return exact;
  const answer=tools?.arithmetic?.(question);if(!answer)return null;
  const value=answer.match(/ = ([-+]?\d+(?:[.,]\d+)?)(?: %)?$/)?.[1];
  return value!==undefined&&Number.isFinite(num(value))?{kind:'arithmetic',text:answer,value:num(value)}:{kind:'unsupported',text:answer};
}
function followup(question,history,tools){
  const q=context.norm(question).replace(/[?!]+$/,'');
  const match=q.match(/^(?:und\s+)?(?:(?:das|dies|ergebnis)\s+)?(plus|minus|mal|geteilt durch|durch|hoch|[+*/-])\s+([-+]?\d+(?:[.,]\d+)?)(\s*%)?$/);
  const percent=q.match(/^(?:und\s+)?davon\s+([-+]?\d+(?:[.,]\d+)?)\s*(?:%|prozent)$/);
  if(!match&&!percent)return null;
  const d=context.conversation(question,history);let previous=null;
  // Recalculate from user input. Never trust a number in an earlier model answer.
  for(const user of d.users.slice(-6)){
    const next=calculation(user,tools);
    if(next&&Number.isFinite(next.value))previous=next;
    else if(previous){const n=apply(user,previous,tools);previous=n&&Number.isFinite(n.value)?n:null;}
  }
  return previous?apply(q,previous,tools):{kind:'unsupported',text:'Auf welches Rechenergebnis beziehst du dich? Schreib die Ausgangsrechnung dazu.'};
}
function apply(question,previous,tools){
  const q=context.norm(question).replace(/[?!]+$/,''),p=q.match(/^(?:und\s+)?davon\s+([-+]?\d+(?:[.,]\d+)?)\s*(?:%|prozent)$/);
  if(p){const value=previous.value*num(p[1])/100;if(!Number.isFinite(value)||Math.abs(value)>1e12)return null;return {kind:'arithmetic',value,text:`${p[1]} % von ${fmt(previous.value)} = ${fmt(value)}`};}
  const m=q.match(/^(?:und\s+)?(?:(?:das|dies|ergebnis)\s+)?(plus|minus|mal|geteilt durch|durch|hoch|[+*/-])\s+([-+]?\d+(?:[.,]\d+)?)(\s*%)?$/);if(!m)return null;
  const op={plus:'+',minus:'-',mal:'*',durch:'/', 'geteilt durch':'/',hoch:'^'}[m[1]]||m[1],expression=String(previous.value)+' '+op+' '+m[2]+(m[3]?'%':'');
  const result=tools?.arithmetic?.(expression);if(!result)return null;
  const value=result.match(/ = ([-+]?\d+(?:[.,]\d+)?)$/)?.[1];return {kind:'arithmetic',text:result,...(value!==undefined?{value:num(value)}:{})};
}
function solve(question,history=[],tools={}){return calculation(question,tools)||followup(question,history,tools);}
function knownConflict(rows,query){
  if(rows.length<2||!/(?:wann|start|beginn|uhr|event|veranstaltung)/.test(context.norm(query)))return null;
  const signatures=rows.filter(text=>!/(?:\bendet\b|\bende\b|\bschluss\b)/.test(context.norm(text))).map(text=>({text,slots:[...context.norm(text).matchAll(/\b(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b|\b\d{1,2}(?::\d{2})?\s*uhr\b/g)].map(m=>m[0]).sort().join('|')})).filter(s=>s.slots);
  if(signatures.length<2||new Set(signatures.map(s=>s.slots)).size<2)return null;
  // Only compare complete time facts for the same named subject, never unrelated events.
  const common=context.words(query).filter(w=>!['startet','start','beginn','uhrzeit'].includes(w));
  if(!common.some(w=>signatures.every(s=>context.words(s.text).includes(w))))return null;
  const slots=signatures.map(s=>s.slots.split('|'));
  const weekdays=slots.map(xs=>xs.filter(x=>!x.includes('uhr'))),times=slots.map(xs=>xs.filter(x=>x.includes('uhr')));
  if(![weekdays,times].some(groups=>groups.every(xs=>xs.length===1)&&new Set(groups.map(xs=>xs[0])).size>1))return null;
  return 'Für deine Frage finde ich mehrere Terminangaben im Serverwissen:\n'+signatures.slice(0,3).map(s=>'• '+s.text).join('\n')+'\nWelches Event beziehungsweise welcher Termin ist gemeint? Falls sich Angaben zum selben Event widersprechen, kann die Serververwaltung sie in /learn klären.';
}
module.exports={linear,equation,templates,calculation,solve,knownConflict};
