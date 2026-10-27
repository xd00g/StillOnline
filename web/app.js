'use strict';
const $=id=>document.getElementById(id);
const idle=$('idle'),restart=$('restart'),scene=$('scene'),poster=$('poster');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let motion=!reduced.matches,busy=false,sound=false,recoveryTimer,audioFrame=0,radioOpen=false,skyOpen=false;
let returnFocus=null,history=[],historyIndex=0,currentPhase='online';
const stationAudio=new StationAudio();
const panelOpen=()=>Boolean(document.querySelector('dialog[open]'));
const practicalFlicker=new PracticalFlicker(scene,()=>motion&&!busy&&!panelOpen()&&!document.hidden);
const phases={online:['Still online','Quietly keeping things running.'],flicker:['Power unstable','The station is losing power.'],offline:['Generator stopped','The starter is turning over.'],rack:['Racks coming back','One machine at a time.'],interior:['Lights returning','Interior supply restored.'],sign:['Remote support returns','The sign is lit again.']};
const getSettings=()=>({motion,sound,busy,phase:currentPhase,panel:panelOpen()});
function notifySettings(){document.dispatchEvent(new CustomEvent('station:settings',{detail:getSettings()}));}
function announce(text){$('announcement').textContent=text;}
function setPoster(src){poster.src=src;const source=poster.parentElement.querySelector('source');if(source)source.srcset=src;}
function phase(key){if(currentPhase===key)return;currentPhase=key;const [title,detail]=phases[key];$('stateTitle').textContent=title;$('stateDetail').textContent=detail;$('stateLamp').style.background=key==='offline'?'#d99c78':key==='online'?'#a9cda5':'#eab577';announce(title+'. '+detail);notifySettings();}
function updateMotion(){
 practicalFlicker.sync();$('motionButton').textContent=motion?'Motion on':'Motion off';$('motionButton').setAttribute('aria-pressed',String(motion));scene.classList.toggle('still',!motion);
 if(motion&&!document.hidden&&!busy&&!panelOpen())idle.play().catch(()=>announce('Animation could not play. The still scene is ready to explore.'));else idle.pause();
 notifySettings();
}
function finish(){clearTimeout(recoveryTimer);restart.pause();restart.hidden=true;idle.hidden=false;busy=false;setPoster('assets/station.webp');document.querySelectorAll('[data-restart]').forEach(b=>b.disabled=false);phase('online');updateMotion();}
function startRestart(){
 if(busy)return;window.StationInspection?.close();busy=true;notifySettings();practicalFlicker.sync();document.querySelectorAll('[data-restart]').forEach(b=>b.disabled=true);
 if(!motion){setPoster('assets/outage.webp');phase('offline');recoveryTimer=setTimeout(finish,1800);return;}
 idle.pause();restart.hidden=false;idle.hidden=true;restart.currentTime=2;phase('flicker');restart.play().catch(()=>{scene.classList.add('still');setPoster('assets/outage.webp');phase('offline');recoveryTimer=setTimeout(finish,1800);});
}
restart.addEventListener('timeupdate',()=>{if(!busy)return;const t=restart.currentTime;phase(t<3?'flicker':t<5?'offline':t<6.8?'rack':t<8?'interior':t<10?'sign':'online');});
restart.addEventListener('ended',finish);restart.addEventListener('error',()=>{if(busy){finish();announce('The animation could not load. The station is still available.');}});
document.querySelectorAll('[data-restart]').forEach(b=>b.addEventListener('click',startRestart));
$('motionButton').addEventListener('click',()=>{motion=!motion;if(busy)finish();updateMotion();});
reduced.addEventListener('change',e=>{motion=!e.matches;if(busy)finish();updateMotion();});
function soundFrame(){audioFrame=0;if(!document.hidden&&sound){stationAudio.update(busy&&motion,restart.currentTime);audioFrame=requestAnimationFrame(soundFrame);}}
function syncSoundFrames(){if(sound&&!document.hidden){if(!audioFrame)audioFrame=requestAnimationFrame(soundFrame);}else{cancelAnimationFrame(audioFrame);audioFrame=0;}}
async function setSound(value){try{await stationAudio.enable(Boolean(value));sound=Boolean(value);syncSoundFrames();$('soundButton').textContent=sound?'Sound on':'Sound off';$('soundButton').setAttribute('aria-pressed',String(sound));notifySettings();return true;}catch{announce('This browser could not start audio. The scene works without it.');return false;}}
$('soundButton').addEventListener('click',()=>setSound(!sound));
window.StationControls=Object.freeze({getState:getSettings,setSound});
document.addEventListener('visibilitychange',()=>{practicalFlicker.sync();if(document.hidden){idle.pause();restart.pause();stationAudio.suspend();}else{if(sound)stationAudio.resume();if(busy&&motion&&!panelOpen())restart.play().catch(finish);else updateMotion();}syncSoundFrames();notifySettings();});
function syncPanel(){
 practicalFlicker.sync();stationAudio.setSky(skyOpen||radioOpen);
 if(panelOpen()){idle.pause();restart.pause();}else if(busy&&motion&&!document.hidden)restart.play().catch(finish);else updateMotion();
 notifySettings();
}
for(const kind of ['desertsky','stationracks','stationradio']){
 document.addEventListener(kind+':open',()=>{if(kind==='desertsky')skyOpen=true;if(kind==='stationradio')radioOpen=true;syncPanel();});
 document.addEventListener(kind+':close',()=>{if(kind==='desertsky')skyOpen=false;if(kind==='stationradio')radioOpen=false;syncPanel();});
}
function openDialog(dialog){returnFocus=document.activeElement;dialog.showModal();syncPanel();}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('close',()=>{returnFocus?.focus();syncPanel();});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
function paragraph(parent,text){const p=document.createElement('p');p.textContent=text;parent.append(p);return p;}
function info(){
 const area=$('infoContent');area.replaceChildren();$('infoTitle').textContent='Field notes';const image=new Image();image.src='assets/station.webp';image.alt='The full station at dusk.';image.width=1920;image.height=1080;area.append(image);
 paragraph(area,'Still Online is an original interactive Mojave scene by xD00g and Nebulys. The station is weathered, the pumps are dry, and the equipment inside is still running.');
 paragraph(area,'Tune the shortwave receiver. Sweep the wall and equipment with the work light. In the terminal, type diagnose to investigate the failed uplink, or logs to read what the last operator left behind. Repatch and restart RELAY-01, then try ping relay.');
 paragraph(area,'Dust, distant headlights, and a storm beyond the ridge occasionally pass through. You can also type weather in the terminal to choose a cue, then close the console to watch it.');
 const small=document.createElement('small');small.textContent='Fictional local simulation. Radio broadcasts, service records, and replies are authored for the artwork. The radio music and ambience are synthesized in your browser. No real network commands or live weather. Sound is optional. The official site measures feature use; terminal text and wiring details are not sent. Tracking honors Do Not Track and Global Privacy Control.';area.append(small);openDialog($('infoDialog'));
}
$('aboutButton').addEventListener('click',info);
document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{
 if(b.dataset.open==='terminal'){openDialog($('terminalDialog'));$('command').focus();}
 else if(b.dataset.open==='radio')window.StationRadio?.open({returnFocus:b});
 else window.StationRacks?.open({returnFocus:b});
}));
document.querySelectorAll('[data-sky]').forEach(b=>b.addEventListener('click',()=>window.DesertSky?DesertSky.open({returnFocus:b}):announce('The sky could not load. Reload to try again.')));
document.querySelectorAll('[data-inspection]').forEach(b=>b.addEventListener('click',()=>window.StationInspection?.toggle({returnFocus:b})));
const responses={
 help:'STATION CONSOLE\n\ndiagnose    trace the failed uplink\nlogs        operator records\nrelay       current repair state\nping relay  contact the ridge station\nstatus      equipment and power\nradio       open the shortwave receiver\nlight       pick up the inspection light\nweather     environmental cues\nreboot      restart the generator\nlinks       Nebulys and xD00g\nclear       clear the console\n\nThe station and its records are fictional.',
 ls:'logs/maintenance.log\nnotes/relay-wiring.txt\nlogs/backup.log\nlogs/relay-reply.log\nlast-good-backup.tar',
 about:'A roadside station converted into a makeshift data center.\nAn original interactive scene by xD00g and Nebulys.',
 whoami:'operator / local console',
 ping:'Use ping relay to check the simulated ridge uplink.'
};
function output(text,cls){const p=paragraph($('terminalOutput'),text);if(cls)p.className=cls;while($('terminalOutput').children.length>60)$('terminalOutput').firstElementChild.remove();$('terminalOutput').scrollTop=$('terminalOutput').scrollHeight;}
function command(value){
 const input=value.trim();if(!input)return;history.push(input);history=history.slice(-50);historyIndex=history.length;output('station:~ $ '+input,'entered');const key=input.toLowerCase();
 const repair=window.StationRelay?.command(input);
 if(repair!==null&&repair!==undefined)output(repair);
 else if(key==='clear')$('terminalOutput').replaceChildren();
 else if(key==='status')output('LOCAL SIMULATION\n'+phases[currentPhase].join('\n')+'\n\n'+(window.StationRacks?.getState().map(d=>d.name+'  '+(!d.powered?'OFF':d.booting?'BOOTING':d.linked?'LINK / PORT '+String(d.port).padStart(2,'0'):'NO LINK')).join('\n')||'Racks unavailable')+'\n\n'+(window.StationRelay?.describe()||''));
 else if(key==='reboot'){output(busy?'Restart already in progress.':'Starting generator recovery.');$('terminalDialog').close();startRestart();}
 else if(key==='radio'){const focus=returnFocus;returnFocus=null;$('terminalDialog').close();StationRadio.open({returnFocus:focus});}
 else if(key==='light'){const focus=returnFocus;returnFocus=null;$('terminalDialog').close();StationInspection.open({returnFocus:focus});}
 else if(key==='weather')output('CUES\nweather gust\nweather headlights\nweather lightning\n\nEnter one, then close the console. Automatic events also arrive occasionally while motion is on.');
 else if(key.startsWith('weather ')){const kind=key.split(/\s+/)[1];if(!['gust','headlights','lightning'].includes(kind))output('Unknown cue. Use weather to list them.');else{const result=window.StationAtmosphere?.preview(kind);output(result?.ok?'Cue queued. Close the console and watch the desert.':'Cue unavailable. Turn motion on and wait for power recovery.');}}
 else if(key==='links'){const p=document.createElement('p');for(const [label,url]of[['xD00g','https://www.doogster.com/'],['Nebulys','https://www.nebulys.net/']]){const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode('   '));}$('terminalOutput').append(p);}
 else output(responses[key]||(key.startsWith('cat ')?'File not found. Use logs or ls to see the available records.':'Command not found. Try help.'));
 $('command').value='';
}
$('terminalForm').addEventListener('submit',e=>{e.preventDefault();command($('command').value);});
document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{command(b.dataset.command);if($('terminalDialog').open)$('command').focus();}));
$('command').addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();historyIndex=Math.max(0,Math.min(history.length,historyIndex+(e.key==='ArrowUp'?-1:1)));$('command').value=history[historyIndex]||'';}});
updateMotion();window.StationAtmosphere?.start();
