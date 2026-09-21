'use strict';
(()=>{const scene=document.getElementById('scene'),root=document.querySelector('.outpost'),frameButton=document.getElementById('frameButton');const targets=[{x:.80,y:.72},{x:.60,y:.57},{x:.415,y:.605}];
function map(){const w=scene.clientWidth,h=scene.clientHeight,mobile=matchMedia('(max-width:700px)').matches,cover=mobile&&!scene.classList.contains('full-frame'),scale=(cover?Math.max:Math.min)(w/16,h/9),iw=16*scale,ih=9*scale,left=cover?w-iw:(w-iw)/2,top=(h-ih)/2;document.querySelectorAll('.hotspot[data-station]').forEach(b=>{const t=targets[Number(b.dataset.station)],x=left+t.x*iw,y=top+t.y*ih;const lw=b.querySelector('.spot-label').offsetWidth;b.style.setProperty('--label-x',(Math.max(10+lw/2,Math.min(w-10-lw/2,x))-x)+'px');b.style.left=x+'px';b.style.top=y+'px';b.hidden=x<20||x>w-20||y<20||y>h-20;});const sky=scene.querySelector('.horizon-spot');const skyX=cover?32:left+iw*.53;const sw=sky.querySelector('.spot-label').offsetWidth;sky.style.setProperty('--label-x',(Math.max(10+sw/2,Math.min(w-10-sw/2,skyX))-skyX)+'px');sky.style.left=skyX+'px';sky.style.top=(cover?42:top+ih*.17)+'px';}
const skyNode=scene.querySelector('.horizon-spot');
scene.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=skyNode.getBoundingClientRect();skyNode.classList.toggle('sky-near',Math.hypot(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2)<85);});
const hideSkyLabel=()=>skyNode.classList.remove('sky-near');
scene.addEventListener('pointerleave',hideSkyLabel);
document.addEventListener('desertsky:open',hideSkyLabel);
window.addEventListener('blur',hideSkyLabel);
frameButton.addEventListener('click',()=>{const full=scene.classList.toggle('full-frame');frameButton.textContent=full?'Fill screen':'Fit full scene';frameButton.setAttribute('aria-pressed',String(full));map();});new ResizeObserver(map).observe(scene);map();
const restart=document.querySelector('.scene-actions [data-restart]');new MutationObserver(()=>root.classList.toggle('is-restarting',restart.disabled)).observe(restart,{attributes:true,attributeFilter:['disabled']});
})();
