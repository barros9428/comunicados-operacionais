'use strict';
const $=id=>document.getElementById(id), STORAGE='parafraseador_v3_';
const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(STORAGE+k))??d}catch{return d}};
const put=(k,v)=>{try{localStorage.setItem(STORAGE+k,JSON.stringify(v));return true}catch{notify('Armazenamento indisponível neste navegador.',true);return false}};
let results={}, explanations=[], lastSource='', selected='corrigido', previous={}, speech=null, busy=false;
const names={corrigido:'✓ Corrigida',formal:'💼 Formal',objetivo:'🎯 Objetiva',simples:'🌿 Simples',cordial:'🤝 Cordial',detalhado:'📝 Detalhado',whatsapp:'💬 WhatsApp',operacional:'🚰 Comunicado operacional'};
const styles=['corrigido','formal','objetivo'];
function notify(msg,error=false,good=false){$('status').textContent=msg;$('status').className='notice'+(error?' error':good?' good':'')}
function clean(t){return t.replace(/\s+/g,' ').trim()}
function baseFix(input){
 let s=clean(input);if(!s)return '';
 const accents={amanha:'amanhã',reuniao:'reunião',nao:'não',tambem:'também',voce:'você',voces:'vocês',sera:'será',ate:'até',informacao:'informação',situacao:'situação',previsao:'previsão',horario:'horário',manutencao:'manutenção',agua:'água',ja:'já',esta:'está',estao:'estão',possivel:'possível',atencao:'atenção',asvezes:'às vezes'};
 s=s.replace(/\b(amanha|reuniao|nao|tambem|voce|voces|sera|ate|informacao|situacao|previsao|horario|manutencao|agua|ja|esta|estao|possivel|atencao)\b/gi,m=>accents[m.toLowerCase()]||m);
 s=s.replace(/\s+([,.!?;:])/g,'$1').replace(/([,.!?;:])(?=\S)/g,'$1 ');
 s=s.replace(/\b(\d{1,2})\s*(?:horas?|h)\s*(?:da|de)\s*tarde\b/gi,(_,h)=>String((Number(h)%12)+12)+'h').replace(/\b(\d{1,2})\s*(?:horas?|h)\s*(?:da|de)\s*manh[aã]\b/gi,(_,h)=>Number(h)+'h');
 s=s.replace(/\b(\d{1,2}):\s*(\d{2})\b/g,(_,h,m)=>Number(h)+'h'+(m==='00'?'':m));
 // Apenas segmentações conservadoras; não tenta interpretar frases ambíguas.
 s=s.replace(/\b(amanhã|hoje|ontem)\s+(?=(?:eu|nós|todos|haverá|teremos)\b)/gi,'$1, ');
 s=s.replace(/\b(por favor)\s+(?=(?:todos|me|compareçam|avisem)\b)/gi,'$1, ');
 s=s.replace(/\s{2,}/g,' ').trim();
 s=s[0].toUpperCase()+s.slice(1);
 if(!/[.!?]$/.test(s))s+='.';
 return s;
}
function applyRules(text,rules){let s=text;for(const [pattern,replacement] of rules)s=s.replace(pattern,replacement);return s}
const grammarRules=[
[/\bagente\b/gi,'a gente'],[/\bcomcerteza\b/gi,'com certeza'],[/\bderrepente\b/gi,'de repente'],
[/\bconcerteza\b/gi,'com certeza'],[/\bporisso\b/gi,'por isso'],[/\bapartir de\b/gi,'a partir de'],
[/\bpra\b/gi,'para'],[/\bpro\b/gi,'para o'],[/\bpros\b/gi,'para os'],
[/\bta\b/gi,'está'],[/\btá\b/gi,'está'],[/\bto\b/gi,'estou'],[/\btô\b/gi,'estou'],
[/\bvc\b/gi,'você'],[/\bvcs\b/gi,'vocês'],[/\bqdo\b/gi,'quando'],[/\bpq\b/gi,'porque'],
[/\bmais\s+(?=(?:eu|você|ele|ela|nós|eles|isso|não|hoje|amanhã)\b)/gi,'mas '],
[/\bvai ter uma reunião\b/gi,'haverá uma reunião'],

[/\bcom todos os operadores\b/gi,'com todos os operadores'],
[/\bseje\b/gi,'seja'],[/\bmenas\b/gi,'menos'],[/\bconcerteza\b/gi,'com certeza'],
[/\bdeica\b/gi,'deixa'],[/\bdeicha\b/gi,'deixa'],[/\bconcerteza\b/gi,'com certeza'],[/\bexcessão\b/gi,'exceção'],[/\bprevilégio\b/gi,'privilégio'],[/\batravez\b/gi,'através']
];
const formalRules=[
[/\b(?:eu vou precisar|vou precisar)\b/gi,'será necessário'],
[/\b(?:eu quero|quero)\b/gi,'solicito'],
[/\b(?:a gente vai|nós vamos)\b/gi,'iremos'],
[/\b(?:vai ter)\b/gi,'haverá'],
[/\b(?:tem que)\b/gi,'é necessário'],

[/\b(?:me avisa|me avise)\b/gi,'por gentileza, informe-me'],
[/\b(?:tá bom|tudo bem)\b/gi,'de acordo'],
[/\b(?:obrigado pela ajuda)\b/gi,'agradeço pela colaboração'],


[/\b(?:falar sobre)\b/gi,'tratar de'],
[/\b(?:pedir)\b/gi,'solicitar']
];
const conciseRules=[
[/\b(?:gostaria de informar que)\b/gi,'Informo que'],
[/\b(?:venho por meio desta informar que)\b/gi,'Informo que'],
[/\b(?:eu vou precisar de)\b/gi,'Preciso de'],
[/\b(?:eu vou precisar)\b/gi,'Preciso'],
[/\b(?:eu gostaria de)\b/gi,'Quero'],
[/\b(?:por gentileza|por favor)\b/gi,''],
[/\b(?:com o objetivo de)\b/gi,'para'],
[/\b(?:no dia de amanhã)\b/gi,'amanhã'],
[/\b(?:neste momento)\b/gi,'agora'],
[/\b(?:todos os operadores)\b/gi,'os operadores'],
[/\b(?:é necessário que)\b/gi,''],
[/\b(?:eu quero)\b/gi,'Quero']
];
const formalPhrases=[
 [/\b(?:amanhã|hoje)\s+(?:eu\s+)?vou precisar de uma reunião com todos os operadores\b/gi,m=>m.toLowerCase().startsWith('amanhã')?'Amanhã, será necessário realizar uma reunião com todos os operadores':'Hoje, será necessário realizar uma reunião com todos os operadores'],
 [/\b(?:eu quero|quero)\s+(?:todos\s+)?presentes\b/gi,'Solicito a presença de todos'],
 [/\b(?:me avisa|me avise)\b/gi,'Peço que me informe'],
 [/\b(?:vai ter uma reunião)\b/gi,'haverá uma reunião'],
 [/\b(?:a gente precisa)\b/gi,'é necessário que nós'],
 [/\b(?:não vai dar)\b/gi,'não será possível'],
 [/\b(?:preciso falar com)\b/gi,'preciso conversar com'],
 [/\b(?:tá tudo certo)\b/gi,'está tudo confirmado']
];
const objectivePhrases=[
 [/\b(?:amanhã|hoje)\s+(?:eu\s+)?vou precisar de uma reunião com todos os operadores\b/gi,m=>m.toLowerCase().startsWith('amanhã')?'Reunião com todos os operadores amanhã':'Reunião com todos os operadores hoje'],
 [/\b(?:eu vou precisar de uma reunião)\b/gi,'Preciso de uma reunião'],
 [/\b(?:gostaria de solicitar)\b/gi,'Solicito'],
 [/\b(?:gostaria de saber se)\b/gi,'Quero saber se'],
 [/\b(?:por meio desta)\b/gi,''],
 [/\b(?:com a finalidade de)\b/gi,'para'],
 [/\b(?:venho informar que)\b/gi,'Informo que']
];
function polishPunctuation(text){
 let s=text.replace(/\s+([,.!?;:])/g,'$1').replace(/,\s*,/g,',').replace(/\s{2,}/g,' ').trim();
 s=s.replace(/\b(amanhã|hoje|ontem),?\s+(?=(?:haverá|teremos|será necessário|preciso|solicito)\b)/gi,'$1, ');
 return s;
}
function normalize(t){return baseFix(t).replace(/\s{2,}/g,' ').replace(/\s+([,.!?;:])/g,'$1').replace(/([.!?])\s*([a-záàâãéêíóôõúç])/g,(_,a,b)=>a+' '+b.toUpperCase())}
function protect(text){const dict=get('dictionary',[]).filter(x=>typeof x==='string'&&x.trim()).sort((a,b)=>b.length-a.length);let s=text;const saved=[];for(const phrase of dict){const at=s.toLowerCase().indexOf(phrase.toLowerCase());if(at>=0){const token='ZZPROTEGIDO'+saved.length+'ZZ';saved.push(s.slice(at,at+phrase.length));s=s.slice(0,at)+token+s.slice(at+phrase.length)}}return {text:s,restore:t=>t.replace(/ZZPROTEGIDO(\d+)ZZ/g,(_,i)=>saved[Number(i)]??'')}}
// Motor local: corrige erros comuns e reformula construções reconhecidas.
// Não tenta inventar significados quando a frase é ambígua.
function rewriteKnownPhrases(s,kind){
 const formal=kind==='formal'||kind==='cordial'||kind==='operacional'||kind==='detalhado';
 const objective=kind==='objetivo'||kind==='simples'||kind==='whatsapp';
 if(formal){
  s=applyRules(s,[
   [/\bdeixa isso para\b/gi,'deixe isso para'],
   [/\bdeixa (isso|essa|esse|esta|este)\b/gi,'deixe $1'],
   [/\bme manda\b/gi,'envie-me'],
   [/\bme fala\b/gi,'informe-me'],
   [/\bme diz\b/gi,'informe-me'],
   [/\bpreciso que você\b/gi,'solicito que você'],
   [/\bquero saber\b/gi,'gostaria de saber'],
   [/\bvou falar com\b/gi,'conversarei com'],
   [/\bme ajuda\b/gi,'ajude-me'],
   [/\btem como\b/gi,'seria possível'],
   [/\bvai começar\b/gi,'terá início'],
   [/\bvai terminar\b/gi,'será concluído'],
   [/\bavisar todo mundo\b/gi,'comunicar a todos'],
   [/\ba gente precisa\b/gi,'precisamos'],
   [/\bnão dá para\b/gi,'não é possível'],
   [/\bficar de olho\b/gi,'acompanhar'],
   [/\bdar uma olhada\b/gi,'verificar']
  ]);
 }
 if(objective){
  s=applyRules(s,[
   [/\b(?:eu )?vou precisar de\b/gi,'Preciso de'],
   [/\b(?:eu )?vou precisar\b/gi,'Preciso'],
   [/\b(?:eu )?gostaria de pedir\b/gi,'Peço'],
   [/\b(?:eu )?gostaria de saber\b/gi,'Quero saber'],
   [/\b(?:eu )?gostaria de informar que\b/gi,'Informo que'],
   [/\b(?:eu )?quero que você\b/gi,'Peço que você'],
   [/\b(?:eu )?estou entrando em contato para\b/gi,'Entro em contato para'],
   [/\b(?:por gentileza|por favor)\s*,?\s*/gi,''],
   [/\b(?:no dia de amanhã)\b/gi,'amanhã'],
   [/\b(?:neste momento)\b/gi,'agora']
  ]);
 }
 return s;
}
function localRewrite(source,kind,instruction=''){
 const safe=protect(source);
 let s=applyRules(safe.text,grammarRules);
 // Pontuação de vocativos reconhecíveis, sem mudar o conteúdo.
 s=s.replace(/^(amor|amiga?|querida?|pessoal|gente)\s+(?=(?:seu|sua|por favor|preciso|me|deixa|você)\b)/i,'$1, ');
 s=s.replace(/\b(seu idiota|sua idiota)\s+(?=(?:deixa|pare|para|faz|faça)\b)/gi,'$1, ');
 if(kind==='formal'||kind==='cordial'||kind==='operacional'||kind==='detalhado'){
   s=applyRules(s,formalPhrases);
   s=applyRules(s,formalRules);
 }
 if(kind==='objetivo'||kind==='simples'||kind==='whatsapp'){
   s=applyRules(s,objectivePhrases);
   s=applyRules(s,conciseRules);
 }
 s=rewriteKnownPhrases(s,kind);
 if(kind==='cordial'&&!/\b(?:por favor|por gentileza)\b/i.test(s))s='Por gentileza, '+s.charAt(0).toLowerCase()+s.slice(1);
 if(kind==='operacional')s='Comunicado: '+s.charAt(0).toLowerCase()+s.slice(1);
 if(kind==='formal'&&$('tone').value==='respeitoso'&&!/\b(?:por favor|por gentileza)\b/i.test(s))s='Por gentileza, '+s.charAt(0).toLowerCase()+s.slice(1);
 if(instruction&&/\b(?:curto|resum|diret|objetiv)\b/i.test(instruction))s=applyRules(s,objectivePhrases.concat(conciseRules));
 s=safe.restore(s);
 s=normalize(polishPunctuation(s));
 if($('length').value==='curto'&&kind!=='corrigido')s=normalize(applyRules(s,conciseRules));
 return s;
}
function fallback(t){return {corrigido:localRewrite(t,'corrigido'),formal:localRewrite(t,'formal'),objetivo:localRewrite(t,'objetivo')}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function wordDiff(original,changed){let a=new Set(original.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]);return changed.split(/(\s+)/).map(w=>{let k=w.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');return k&&!a.has(k)?'<mark>'+escapeHtml(w)+'</mark>':escapeHtml(w)}).join('')}
function render(){const box=$('resultCards');box.innerHTML='';for(const [key,value] of Object.entries(results)){const card=document.createElement('article');card.className='result';card.innerHTML='<div class="resultHead"><strong>'+escapeHtml(names[key]||key)+'</strong><span class="muted">Editável</span></div><textarea aria-label="Texto '+escapeHtml(key)+'"></textarea><div class="diff" hidden></div><div class="resultActions"><button data-act="copy">📋 Copiar</button><button data-act="share">↗ Compartilhar</button><button data-act="diff">Comparar</button><button data-act="undo">↶ Desfazer</button><button data-act="select">Usar esta versão</button></div>';const ta=card.querySelector('textarea');ta.value=value;ta.addEventListener('input',()=>{results[key]=ta.value});card.querySelectorAll('button').forEach(b=>b.addEventListener('click',async()=>{const act=b.dataset.act;if(act==='copy'){await copyText(ta.value)}else if(act==='share'){if(navigator.share){try{await navigator.share({text:ta.value})}catch(e){if(e.name!=='AbortError')notify('Não foi possível compartilhar.',true)}}else window.open('https://wa.me/?text='+encodeURIComponent(ta.value),'_blank','noopener')}else if(act==='diff'){let el=card.querySelector('.diff');el.hidden=!el.hidden;if(!el.hidden)el.innerHTML='<strong>Palavras novas destacadas:</strong><p>'+wordDiff(lastSource,ta.value)+'</p>'}else if(act==='undo'){ta.value=previous[key]??value;results[key]=ta.value}else{selected=key;notify('Versão selecionada: '+(names[key]||key),false,true)}}));box.appendChild(card)}if(!Object.keys(results).length)box.innerHTML='<div class="empty">Suas três versões aparecerão aqui.</div>'}
async function copyText(text){try{await navigator.clipboard.writeText(text);notify('Texto copiado!',false,true)}catch{notify('Não foi possível copiar automaticamente. Selecione e copie o texto.',true)}}
function detectWarnings(input,outputs){const out=[];if(/\b(?:coisar|coisa|trem|negócio)\b/i.test(input))out.push('Há palavras vagas no texto (como “coisar”). Confirme o significado antes de compartilhar.');if(/\b(?:amanh[aã]|hoje|ontem)\b/i.test(input)&&/\b(?:\d{1,2})(?:h|:\d{2})?\b/.test(input)===false)out.push('Confira se há um horário que precisa ser informado.');if(/\b(?:às|as)\s*\d{1,2}(?!\s*(?:h|:|horas|da tarde|da manhã|da noite))\b/i.test(input))out.push('Horário ambíguo: confirme se é manhã ou tarde.');const originalNumbers=(input.match(/\d+(?:[.,:]\d+)*/g)||[]).sort().join('|');for(const v of Object.values(outputs)){const numbers=(v.match(/\d+(?:[.,:]\d+)*/g)||[]).sort().join('|');if(numbers!==originalNumbers){out.push('Confira os números e horários: a reescrita pode ter alterado a forma de apresentação.');break}}return [...new Set(out)]}
function showWarnings(w){$('warnings').hidden=!w.length;$('warnings').textContent=w.join('\n')}
async function generate(keys=styles,instruction=''){
 const source=$('source').value.trim();if(!source){notify('Digite ou fale um texto antes de gerar.',true);$('source').focus();return}
 if(source.length>5000){notify('Limite de 5.000 caracteres.',true);return}
 if(busy)return;busy=true;$('generate').disabled=true;$('generate').textContent='⏳ Revisando...';lastSource=source;
 try{previous={...results};if(keys.length===3)results={};for(const k of keys)results[k]=localRewrite(source,k,instruction);
 explanations=['Revisão local por regras de ortografia, pontuação e substituições frequentes.','A versão formal emprega substituições mais profissionais; a objetiva reduz expressões comuns.','Esta ferramenta não compreende o contexto como uma IA: confira o resultado antes de usar.'];
 render();
 const warnings=detectWarnings(source,results);
 if(keys.length===3&&new Set([results.corrigido,results.formal,results.objetivo]).size===1){
   warnings.unshift('Não foi possível criar três paráfrases distintas com segurança. As regras locais não compreendem todas as frases.');
 }
 showWarnings(warnings);$('mode').textContent='✓ Revisão local';notify('Revisão local concluída. Confira a pontuação e o significado antes de compartilhar.',false,true);
 }catch(e){notify('Não foi possível revisar o texto: '+e.message,true)}finally{busy=false;$('generate').disabled=false;$('generate').textContent='✦ Gerar 3 versões'}
}
function showHistory(){const h=get('history',[]);$('history').innerHTML='';if(!h.length){$('history').textContent='Nenhum texto salvo.';return}for(const entry of h){const item=document.createElement('div');item.className='historyItem';const p=document.createElement('div');p.className='preview';p.textContent=(entry.favorite?'★ ':'')+new Date(entry.date).toLocaleString('pt-BR')+' — '+entry.source;item.appendChild(p);const group=document.createElement('div');group.className='tools';[['Abrir',()=>{ $('source').value=entry.source;lastSource=entry.source;results={...entry.results};previous={...results};render();$('count').textContent=entry.source.length+' caracteres';window.scrollTo({top:0,behavior:'smooth'})}],[(entry.favorite?'★':'☆'),()=>{entry.favorite=!entry.favorite;put('history',h);showHistory()}],['Excluir',()=>{put('history',h.filter(x=>x.id!==entry.id));showHistory()}]].forEach(([t,fn])=>{const b=document.createElement('button');b.textContent=t;b.addEventListener('click',fn);group.appendChild(b)});item.appendChild(group);$('history').appendChild(item)}}
$('source').addEventListener('input',()=>{$('count').textContent=$('source').value.length+' caracteres'});
$('generate').addEventListener('click',()=>generate());$('clearBtn').addEventListener('click',()=>{$('source').value='';$('count').textContent='0 caracteres';$('source').focus()});
$('styles').addEventListener('click',e=>{const k=e.target.closest('button')?.dataset.style;if(k)generate([k])});$('reviseBtn').addEventListener('click',()=>{const instruction=$('instruction').value.trim();if(!instruction)return notify('Escreva uma instrução para revisar.',true);generate([selected],instruction)});
$('explainBtn').addEventListener('click',()=>{const e=$('explanations');e.hidden=!e.hidden;e.textContent=explanations.length?explanations.join('\n'):'Nenhuma explicação disponível para esta geração.'});
$('saveBtn').addEventListener('click',()=>{if(!lastSource||!Object.keys(results).length)return notify('Gere um texto antes de salvar.',true);let h=get('history',[]);h.unshift({id:Date.now()+Math.random(),date:Date.now(),source:lastSource,results:{...results},favorite:false});put('history',h.slice(0,100));showHistory();notify('Texto salvo neste navegador.',false,true)});
$('deleteAll').addEventListener('click',()=>{if(confirm('Apagar todo o histórico salvo neste navegador?')){put('history',[]);showHistory()}});
$('exportBtn').addEventListener('click',()=>{const data={version:3,history:get('history',[]),dictionary:get('dictionary',[])};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='parafraseador-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$('importFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.history)||data.history.length>1000)throw Error('Backup inválido');const valid=data.history.filter(x=>typeof x.source==='string'&&x.source.length<=5000&&x.results&&typeof x.results==='object').slice(0,100);if(!confirm('Importar '+valid.length+' registros? Isso substituirá seu histórico.'))return;put('history',valid);if(Array.isArray(data.dictionary))put('dictionary',data.dictionary.filter(x=>typeof x==='string').slice(0,100));showHistory();notify('Backup importado.',false,true)}catch{notify('Não foi possível importar o arquivo.',true)}finally{e.target.value=''}});
$('dictBtn').addEventListener('click',()=>{$('dictionary').value=get('dictionary',[]).join('\n');$('dictDialog').showModal()});$('saveDict').addEventListener('click',()=>{put('dictionary',$('dictionary').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,100));notify('Dicionário salvo.',false,true)});
$('micBtn').addEventListener('click',()=>{const Rec=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Rec)return notify('Reconhecimento de voz indisponível. Use o microfone do teclado do celular.',true);if(speech){speech.stop();return}speech=new Rec();speech.lang='pt-BR';speech.continuous=true;speech.interimResults=true;let committed=$('source').value.trim();let finalized='';speech.onresult=e=>{let partial='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalized+=' '+t;else partial+=' '+t} $('source').value=[committed,finalized.trim(),partial.trim()].filter(Boolean).join(' ').trim();$('count').textContent=$('source').value.length+' caracteres'};speech.onerror=e=>{if(e.error!=='aborted')notify('Microfone: '+e.error+'. Você pode usar o teclado de voz.',true)};speech.onend=()=>{speech=null;$('micBtn').textContent='🎙️ Falar';notify('Ditado finalizado. Confira a transcrição antes de gerar.')};try{speech.start();$('micBtn').textContent='⏹ Parar';notify('Ouvindo... toque em Parar quando terminar.')}catch{speech=null;notify('Não foi possível iniciar o microfone.',true)}});
showHistory();
