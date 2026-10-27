'use strict';
(() => {
  const scene = document.getElementById('scene');
  const marks = [
    {id:'relay', x:.499, y:.588, width:.052, height:.035, angle:-.025, lines:['UPLINK  02','RESTART RELAY'], title:'A strip of tape behind the rack', text:'UPLINK 02. RESTART RELAY. The pencil is fresher than the dust around it.'},
    {id:'generator', x:.763, y:.681, width:.041, height:.024, angle:.015, lines:['OIL / 1147 H'], title:'Generator service mark', text:'An oil change at 1,147 hours. The old reading has been crossed out twice.'},
    {id:'pump', x:.196, y:.641, width:.026, height:.028, angle:.025, lines:['DRY','DO NOT PRIME'], title:'The pump is dry', text:'Someone scratched a warning into the panel. The station has been using the space for something else.'}
  ];
  let active=false, suspended=false, previousFocus=null, restoreFrame=false, canvas,ctx,layer,caption,frame=0;
  let point={x:.76,y:.68}, layout={left:0,top:0,iw:1,ih:1}, currentMark=null;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function build(){
    if(layer)return;
    layer=document.createElement('div');layer.className='inspection-layer';layer.hidden=true;
    layer.innerHTML='<canvas class="inspection-beam" tabindex="0" role="img" aria-label="Move the inspection light with the pointer, touch, or arrow keys. Press Escape to put it down." aria-describedby="inspection-help"></canvas><div class="inspection-caption"><p id="inspection-help">Sweep the equipment. Arrow keys move the beam.</p><p class="inspection-finding" role="status" aria-live="polite"></p><button type="button" class="inspection-close">Put light down <span aria-hidden="true">×</span></button></div>';
    scene.append(layer);canvas=layer.querySelector('canvas');ctx=canvas.getContext('2d');caption=layer.querySelector('.inspection-finding');
    layer.querySelector('button').addEventListener('click',()=>close());
    canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);move(e);});
    canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||canvas.hasPointerCapture(e.pointerId))move(e);});
    for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
    canvas.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();return;}
      const keys={ArrowLeft:[-.025,0],ArrowRight:[.025,0],ArrowUp:[0,-.035],ArrowDown:[0,.035]};
      if(keys[e.key]){e.preventDefault();point.x=clamp(point.x+keys[e.key][0],0,1);point.y=clamp(point.y+keys[e.key][1],0,1);queue();}
    });
    new ResizeObserver(resize).observe(scene);
    new MutationObserver(resize).observe(scene,{attributes:true,attributeFilter:['class']});
  }
  function resize(){
    if(!canvas)return;
    const w=scene.clientWidth,h=scene.clientHeight,cover=matchMedia('(max-width:700px)').matches&&!scene.classList.contains('full-frame');
    const scale=(cover?Math.max:Math.min)(w/16,h/9),iw=scale*16,ih=scale*9;
    layout={left:cover?w-iw:(w-iw)/2,top:(h-ih)/2,iw,ih};
    const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);queue();
  }
  function move(e){const r=canvas.getBoundingClientRect();point.x=clamp((e.clientX-r.left-layout.left)/layout.iw,0,1);point.y=clamp((e.clientY-r.top-layout.top)/layout.ih,0,1);queue();}
  function queue(){if(active&&!suspended&&!frame)frame=requestAnimationFrame(draw);}
  function draw(){
    frame=0;if(!active||suspended||!ctx)return;
    const {left,top,iw,ih}=layout,x=left+point.x*iw,y=top+point.y*ih,r=Math.max(85,Math.min(190,iw*.14));
    ctx.clearRect(0,0,scene.clientWidth,scene.clientHeight);
    ctx.save();ctx.beginPath();ctx.rect(left,top,iw,ih);ctx.clip();
    const within=[];
    for(const m of marks){
      const mx=left+m.x*iw,my=top+m.y*ih,d=Math.hypot(mx-x,my-y);
      if(d>r*.75)continue;
      within.push({mark:m,d});
      ctx.save();ctx.translate(mx,my);ctx.rotate(m.angle);ctx.globalAlpha=clamp(1-d/(r*.9),0,1)*.85;
      const mw=m.width*iw,mh=m.height*ih;ctx.fillStyle='#b5a17a';ctx.fillRect(-mw/2,-mh/2,mw,mh);
      ctx.fillStyle='#554931';for(let j=0;j<20;j++){const px=((j*17)%97)/97,py=((j*29)%83)/83;ctx.globalAlpha*=.99;ctx.fillRect(-mw/2+px*mw,-mh/2+py*mh,Math.max(.5,mw*.013),Math.max(.5,mh*.04));}
      ctx.fillStyle='#27231d';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${Math.max(4,iw*.0047)}px Consolas, monospace`;
      m.lines.forEach((line,i)=>ctx.fillText(line,0,(i-(m.lines.length-1)/2)*mh*.35,mw*.9));ctx.restore();
    }
    ctx.fillStyle='rgba(2,5,8,.65)';ctx.fillRect(left,top,iw,ih);
    ctx.globalCompositeOperation='destination-out';
    const hole=ctx.createRadialGradient(x,y,0,x,y,r);hole.addColorStop(0,'rgba(0,0,0,1)');hole.addColorStop(.24,'rgba(0,0,0,.99)');hole.addColorStop(.55,'rgba(0,0,0,.86)');hole.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=hole;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.globalCompositeOperation='source-over';
    const light=ctx.createRadialGradient(x,y,0,x,y,r);light.addColorStop(0,'rgba(255,229,167,.22)');light.addColorStop(.4,'rgba(239,204,136,.13)');light.addColorStop(1,'rgba(239,204,136,0)');ctx.fillStyle=light;ctx.fillRect(x-r,y-r,r*2,r*2);
    // Maintenance marks occupy the wall itself and only become legible inside the beam.
    for(const {mark:m,d} of within){
      const mx=left+m.x*iw,my=top+m.y*ih,mw=m.width*iw,mh=m.height*ih;
      ctx.save();ctx.translate(mx,my);ctx.rotate(m.angle);ctx.globalAlpha=clamp(1-d/(r*.75),0,1)*.8;ctx.fillStyle='#b5a17a';ctx.fillRect(-mw/2,-mh/2,mw,mh);ctx.fillStyle='#30291e';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${Math.max(4,iw*.0047)}px Consolas, monospace`;m.lines.forEach((line,i)=>ctx.fillText(line,0,(i-(m.lines.length-1)/2)*mh*.35,mw*.9));ctx.restore();
    }
    ctx.restore();
    const nearest=within.sort((a,b)=>a.d-b.d)[0]?.mark;
    if((nearest?.id||null)!==currentMark){currentMark=nearest?.id||null;caption.replaceChildren();if(nearest){const title=document.createElement('strong');title.textContent=nearest.title;caption.append(title,document.createTextNode(nearest.text));}layer.classList.toggle('has-finding',Boolean(nearest));}
  }
  function sync(){
    suspended=document.hidden||Boolean(document.querySelector('dialog[open]'))||Boolean(window.StationControls?.getState().busy);
    if(layer)layer.hidden=!active||suspended;
    if(suspended){cancelAnimationFrame(frame);frame=0;}else queue();
  }
  function open({returnFocus}={}){
    build();if(!ctx)return false;if(window.StationControls?.getState().busy)return false;
    previousFocus=returnFocus||document.activeElement;active=true;
    if(matchMedia('(max-width:700px)').matches&&!scene.classList.contains('full-frame')){document.getElementById('frameButton').click();restoreFrame=true;}
    document.querySelectorAll('[data-inspection]').forEach(b=>b.setAttribute('aria-pressed','true'));
    point={x:.499,y:.588};resize();sync();if(!suspended)canvas.focus({preventScroll:true});document.dispatchEvent(new CustomEvent('stationinspection:open'));return true;
  }
  function close(){
    if(!active)return;active=false;layer.hidden=true;cancelAnimationFrame(frame);frame=0;
    if(restoreFrame&&scene.classList.contains('full-frame'))document.getElementById('frameButton').click();restoreFrame=false;
    document.querySelectorAll('[data-inspection]').forEach(b=>b.setAttribute('aria-pressed','false'));previousFocus?.focus({preventScroll:true});document.dispatchEvent(new CustomEvent('stationinspection:close'));
  }
  document.addEventListener('station:settings',sync);document.addEventListener('visibilitychange',sync);
  new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  window.StationInspection=Object.freeze({open,close,toggle(options){return active?(close(),false):open(options);},getState:()=>({active,suspended,point:{...point},finding:currentMark}),focus(id){const m=marks.find(m=>m.id===id);if(!m)return false;point={x:m.x,y:m.y};queue();return true;}});
})();
