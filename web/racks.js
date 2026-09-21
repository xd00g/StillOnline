/* Still Online: a local, fictional rack-room simulation. No network requests. */
(() => {
  'use strict';
  const devices = [
    { id: 'relay', name: 'RELAY-01', role: 'Station relay', model: 'RS / 240', color: '#cfb782', port: 1 },
    { id: 'cache', name: 'CACHE-02', role: 'Local cache', model: 'STORE / 8', color: '#7dadae', port: 3 },
    { id: 'archive', name: 'ARCHIVE-03', role: 'Nightly archive', model: 'VAULT / 6', color: '#c27a4f', port: 5 },
    { id: 'beacon', name: 'BEACON-04', role: 'Desert beacon', model: 'RS / 120', color: '#a2ad77', port: 7 }
  ].map(device => ({ ...device, powered: true, bootUntil: 0 }));
  const BOOT_MS = 4200;
  const svgNS = 'http://www.w3.org/2000/svg';
  let dialog, board, wires, announcement, timer = 0, frame = 0, selected = null;
  let returnFocus = null, drag = null, suppressClick = false, resizeObserver, isOpen = false;
  const powerIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9M7 5.6a8 8 0 1 0 10 0"/></svg>';
  const restartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a8 8 0 1 1 .5 7M4 3v6h6"/></svg>';
  const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const bolt = '<i class="rack-bolt" aria-hidden="true"></i>';
  const bolts = '<div class="rack-bolts" aria-hidden="true">'+bolt.repeat(4)+'</div>';
  const get = id => devices.find(device => device.id === id);
  const booting = device => device.powered && device.bootUntil > Date.now();
  const linked = device => device.powered && !booting(device) && device.port !== null;
  const emit = name => document.dispatchEvent(new CustomEvent('stationracks:' + name));

  function server(device) {
    return `<section class="rack-machine" data-device="${device.id}" aria-label="${device.name}">
      ${bolts}${device.id==='cache'?'<img class="rack-note rack-note-cache" src="assets/rack-note-cache.png" alt="Use this one!" draggable="false">':''}<div class="rack-handle" aria-hidden="true"></div>
      <div class="rack-machine-top"><div><h3>${device.name}</h3><span class="rack-role">${device.role}</span></div><span class="rack-model">${device.model}</span></div>
      <div class="rack-drive-bank" aria-hidden="true">${[0,1,2,3].map(i=>`<span class="rack-drive"><i></i><b>0${i+1}</b><em></em></span>`).join('')}</div>
      <div class="rack-machine-bottom"><div class="rack-machine-actions"><button type="button" class="rack-power" data-power="${device.id}" aria-label="Power off ${device.name}" title="Power off ${device.name}">${powerIcon}</button><button type="button" class="rack-restart" data-restart-device="${device.id}" aria-label="Restart ${device.name}" title="Restart ${device.name}">${restartIcon}</button></div><span class="rack-device-state"></span><button type="button" class="rack-server-port" data-cable-id="${device.id}" aria-label="Select ${device.name} patch cable" title="Select ${device.name} patch cable" style="--cable-color:${device.color}"><i class="rack-jack" aria-hidden="true"></i><span>LAN</span><i class="rack-server-leds" aria-hidden="true"><b></b><b></b></i></button></div>
      <div class="rack-handle rack-handle-right" aria-hidden="true"></div>
    </section>`;
  }
  function mount() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'station-racks';
    dialog.setAttribute('aria-labelledby', 'racks-title');
    dialog.innerHTML = `<div class="racks-room">
      <header class="racks-header"><div><h2 id="racks-title">The server room</h2><p>Keep the outpost connected.</p></div><button type="button" class="racks-close" aria-label="Leave the server room">${closeIcon}<span>Back to station</span></button></header>
      <div class="racks-scroll"><div class="racks-workspace">
        <div class="racks-board">
          <div class="rack-cabinet rack-cabinet-a"><div class="rack-cabinet-cap"><span>STATION / A</span><span class="rack-inventory">SALVAGED EQUIPMENT</span></div><div class="rack-rail rack-rail-left" aria-hidden="true"></div><div class="rack-rail rack-rail-right" aria-hidden="true"></div>
            <section class="rack-switch" aria-label="Eight-port station switch">${bolts}<div class="rack-switch-title"><h3>STATION SWITCH</h3><span><i class="rack-switch-power"></i>12V DC</span></div><div class="rack-switch-ports">${Array.from({length:8},(_,i)=>`<button type="button" class="rack-switch-port" data-switch-port="${i+1}" aria-label="Switch port ${i+1}"><span class="rack-port-number">${String(i+1).padStart(2,'0')}</span><i class="rack-jack" aria-hidden="true"></i><span class="rack-port-lights" aria-hidden="true"><i></i><i></i></span></button>`).join('')}</div><div class="rack-switch-labels"><span>LINK / ACT</span><span>8 × COPPER</span></div></section>
            <div class="rack-blank rack-cable-brush" aria-hidden="true"><span></span></div>
            ${server(devices[0])}${server(devices[1])}<div class="rack-base" aria-hidden="true"></div>
          </div>
          <div class="rack-cabinet rack-cabinet-b"><div class="rack-cabinet-cap"><span>STATION / B</span><span class="rack-inventory">KEEP VENTS CLEAR</span></div><div class="rack-rail rack-rail-left" aria-hidden="true"></div><div class="rack-rail rack-rail-right" aria-hidden="true"></div>
            <div class="rack-power-unit" aria-label="Power conditioner">${bolts}<div class="rack-pdu-copy"><span>POWER CONDITIONER</span><b>117<span>V</span></b><small>GENERATOR FEED</small></div><div class="rack-pdu-vents"></div><div class="rack-pdu-lamp"></div><img class="rack-note rack-note-power" src="assets/rack-note-warning.png" alt="Do Not Unplug" draggable="false"></div>
            <div class="rack-blank rack-cable-brush" aria-hidden="true"><span></span></div>
            ${server(devices[2])}${server(devices[3])}<div class="rack-base" aria-hidden="true"></div>
          </div>
          <svg class="rack-wires" aria-hidden="true"></svg>
          <div class="rack-loose-tray" aria-label="Disconnected patch cables">${devices.map(device=>`<button type="button" class="rack-loose-cable" data-loose-cable="${device.id}" style="--cable-color:${device.color}" aria-label="Reconnect ${device.name} cable"><i class="rack-loose-plug" aria-hidden="true"></i><span>${device.name}</span></button>`).join('')}</div>
        </div>
      </div></div>
      <footer class="racks-footer"><div class="rack-patch-tool"><p class="rack-patch-hint">Drag a colored plug to another port. Drop it away to unplug.</p><div class="rack-patch-actions" hidden><span class="rack-selected-label"></span><label class="rack-route-label">Route to <select class="rack-route" aria-label="Route selected cable to switch port"><option value="">Choose port</option>${Array.from({length:8},(_,i)=>`<option value="${i+1}">Port ${String(i+1).padStart(2,'0')}</option>`).join('')}</select></label><button class="rack-unplug" type="button">Unplug</button><button class="rack-deselect" type="button">Done</button></div></div><div class="rack-footer-bottom"><p class="rack-announcement" role="status" aria-live="polite">All four machines linked. A fictional, local simulation.</p><button type="button" class="rack-reset">Reset wiring</button></div><p class="rack-keyboard-hint">Or select a cable, then a free port. Power and restart buttons work on each machine.</p></footer>
    </div>`;
    document.body.append(dialog);
    board = dialog.querySelector('.racks-board');
    wires = dialog.querySelector('.rack-wires');
    announcement = dialog.querySelector('.rack-announcement');
    dialog.querySelector('.racks-close').addEventListener('click', close);
    dialog.addEventListener('close', onClose);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('pointerdown', pointerDown);
    dialog.addEventListener('pointermove', pointerMove);
    dialog.addEventListener('pointerup', pointerUp);
    dialog.addEventListener('pointercancel', cancelDrag);
    dialog.querySelector('.rack-route').addEventListener('change', event => {
      if (selected && event.target.value) connect(selected, Number(event.target.value));
      event.target.value = '';
    });
    resizeObserver = new ResizeObserver(queueDraw);
    resizeObserver.observe(board);
    document.addEventListener('visibilitychange', visibilityChanged);
  }
  function say(text) { announcement.textContent = text; }
  function selectCable(id) {
    selected = id;
    const device = get(id);
    say(`${device.name} selected. Choose a free switch port, or Unplug.`);
    render();
  }
  function connect(id, port) {
    const device = get(id), occupied = devices.find(other => other.port === port && other.id !== id);
    if (occupied) { say(`Port ${String(port).padStart(2,'0')} is occupied by ${occupied.name}. Choose a free port.`); render(); return false; }
    device.port = port;
    say(`${device.name} connected to port ${String(port).padStart(2,'0')}. ${linked(device) ? 'Link restored.' : booting(device) ? 'Waiting for boot to finish.' : 'Power is off. The link stays dark.'}`);
    render(); return true;
  }
  function unplug(id) {
    const device = get(id); device.port = null;
    say(`${device.name} unplugged. Its switch link and activity lights are off.`);
    render();
  }
  function onClick(event) {
    if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.power) {
      const device = get(button.dataset.power); device.powered = !device.powered; device.bootUntil = device.powered ? Date.now() + BOOT_MS : 0;
      say(`${device.name} ${device.powered ? 'powering up. Booting for a few seconds.' : 'powered off. Its link and activity lights are off.'}`); render(); scheduleBoot();
    } else if (button.dataset.restartDevice) {
      const device = get(button.dataset.restartDevice); if (!device.powered || booting(device)) return;
      device.bootUntil = Date.now() + BOOT_MS; say(`${device.name} restarting. Link and activity are down until boot completes.`); render(); scheduleBoot();
    } else if (button.dataset.cableId) selectCable(button.dataset.cableId);
    else if (button.dataset.looseCable) selectCable(button.dataset.looseCable);
    else if (button.dataset.switchPort) {
      const port = Number(button.dataset.switchPort), device = devices.find(item => item.port === port);
      if (selected) connect(selected, port);
      else if (device) selectCable(device.id);
      else say(`Port ${String(port).padStart(2,'0')} is empty. Select a cable first.`);
    } else if (button.classList.contains('rack-unplug') && selected) unplug(selected);
    else if (button.classList.contains('rack-deselect')) { selected = null; render(); say('Cable set down. Select another plug or try a machine.'); }
    else if (button.classList.contains('rack-reset')) {
      devices.forEach((device,i) => { device.port = 1 + i*2; }); selected = null;
      say('Original wiring restored. Machine power states are unchanged.'); render();
    }
  }
  function pointerDown(event) {
    if (event.button !== 0) return;
    const target = event.target.closest('[data-switch-port], [data-loose-cable]'); if (!target) return;
    const id = target.dataset.looseCable || devices.find(device => device.port === Number(target.dataset.switchPort))?.id;
    if (!id) return;
    drag = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, target };
    target.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x-drag.startX,drag.y-drag.startY) > 5) {
      drag.active = true; selected = drag.id; dialog.classList.add('is-patching'); render(); say(`Moving ${get(drag.id).name} cable. Drop on a free port, or away from the switch to unplug.`);
    }
    if (drag.active) { event.preventDefault(); queueDraw(); }
  }
  function pointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag; drag = null;
    if (current.target.hasPointerCapture(event.pointerId)) current.target.releasePointerCapture(event.pointerId);
    dialog.classList.remove('is-patching');
    if (!current.active) return;
    suppressClick = true;
    const target = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-switch-port]');
    if (target && dialog.contains(target)) connect(current.id,Number(target.dataset.switchPort)); else unplug(current.id);
  }
  function cancelDrag() { if (!drag) return; drag = null; dialog.classList.remove('is-patching'); render(); }
  function scheduleBoot() {
    clearTimeout(timer); timer = 0;
    if (!dialog?.open || document.hidden) return;
    const pending = devices.filter(booting); if (!pending.length) return;
    timer = setTimeout(() => {
      timer = 0;
      const complete = devices.filter(device => device.bootUntil && device.bootUntil <= Date.now());
      complete.forEach(device => { device.bootUntil = 0; });
      if (complete.length) say(complete.map(device => `${device.name} ready. ${device.port !== null ? 'Link restored.' : 'Cable unplugged; link stays dark.'}`).join(' '));
      render(); scheduleBoot();
    }, Math.max(20, Math.min(...pending.map(device => device.bootUntil)) - Date.now() + 20));
  }
  function render() {
    if (!dialog) return;
    devices.forEach(device => {
      const node = dialog.querySelector(`[data-device="${device.id}"]`), isBooting = booting(device), isLinked = linked(device);
      node.classList.toggle('is-off',!device.powered); node.classList.toggle('is-booting',isBooting); node.classList.toggle('is-linked',isLinked);
      node.querySelector('.rack-device-state').textContent = !device.powered ? 'POWER OFF' : isBooting ? 'BOOTING…' : device.port === null ? 'NO LINK' : `ONLINE / ${String(device.port).padStart(2,'0')}`;
      const power = node.querySelector('.rack-power'); power.setAttribute('aria-label',`${device.powered?'Power off':'Power on'} ${device.name}`); power.title = power.getAttribute('aria-label'); power.setAttribute('aria-pressed',String(device.powered));
      node.querySelector('.rack-restart').disabled = !device.powered || isBooting;
      node.querySelector('.rack-server-port').setAttribute('aria-pressed',String(selected===device.id));
      const loose = dialog.querySelector(`[data-loose-cable="${device.id}"]`); loose.hidden = device.port !== null; loose.setAttribute('aria-pressed',String(selected===device.id));
    });
    dialog.querySelectorAll('[data-switch-port]').forEach(port => {
      const number = Number(port.dataset.switchPort), device = devices.find(item=>item.port===number);
      port.classList.toggle('is-occupied',Boolean(device)); port.classList.toggle('is-linked',Boolean(device && linked(device)));
      port.classList.toggle('is-selected',Boolean(device && device.id===selected));
      port.classList.toggle('is-available',Boolean(selected && !device));
      port.style.setProperty('--cable-color',device?.color || '#252824');
      port.setAttribute('aria-label',`Switch port ${number}${device ? `, ${device.name}, ${linked(device)?'linked':'link down'}` : ', empty'}${selected && !device ? ', connect selected cable' : ''}`);
      port.title = port.getAttribute('aria-label');
    });
    const active = selected && get(selected);
    dialog.querySelector('.rack-patch-hint').hidden = Boolean(active);
    dialog.querySelector('.rack-patch-actions').hidden = !active;
    if (active) {
      const label = dialog.querySelector('.rack-selected-label'); label.textContent = active.name; label.style.setProperty('--cable-color',active.color);
      dialog.querySelector('.rack-unplug').disabled = active.port === null;
      dialog.querySelectorAll('.rack-route option[value]').forEach(option => {
        if (!option.value) return;
        const number=Number(option.value), occupant=devices.find(item=>item.port===number);
        option.disabled=Boolean(occupant && occupant.id!==selected);
        option.textContent=`Port ${String(number).padStart(2,'0')}${occupant ? occupant.id===selected ? ' (current)' : ' (occupied)' : ''}`;
      });
    }
    queueDraw();
  }
  function queueDraw() { if (!dialog?.open || frame) return; frame=requestAnimationFrame(()=>{frame=0;drawCables();}); }
  function drawCables() {
    if (!dialog?.open) return;
    const rect=board.getBoundingClientRect();
    wires.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
    wires.setAttribute('width',rect.width); wires.setAttribute('height',rect.height);
    const center=element=>{const r=element.getBoundingClientRect();return {x:r.left+r.width/2-rect.left,y:r.top+r.height/2-rect.top};};
    wires.replaceChildren();
    devices.forEach((device,index)=>{
      const start=center(dialog.querySelector(`[data-cable-id="${device.id}"] .rack-jack`));
      let end, moving=drag?.active && drag.id===device.id;
      if(moving) end={x:drag.x-rect.left,y:drag.y-rect.top};
      else if(device.port!==null) end=center(dialog.querySelector(`[data-switch-port="${device.port}"] .rack-jack`));
      else end=center(dialog.querySelector(`[data-loose-cable="${device.id}"] .rack-loose-plug`));
      const bendX=Math.min(rect.width-10-index*4,start.x+30+index*5);
      const dip=start.y+36+index*5;
      const routeY=end.y+74+index*5;
      // Fixed cables follow the management rail and brush below the switch.
      // A picked-up or loose plug hangs naturally from its server.
      const path=(moving || device.port===null)
        ? `M ${start.x} ${start.y} C ${bendX+15} ${dip}, ${end.x+30} ${end.y+50}, ${end.x} ${end.y}`
        : `M ${start.x} ${start.y} C ${bendX+15} ${dip}, ${bendX} ${dip+18}, ${bendX} ${start.y-3} L ${bendX} ${routeY+24} Q ${bendX} ${routeY}, ${bendX-26} ${routeY} L ${end.x+25} ${routeY} C ${end.x-13} ${routeY}, ${end.x} ${end.y+28}, ${end.x} ${end.y}`;
      const group=document.createElementNS(svgNS,'g'); group.setAttribute('class',`rack-cable ${selected===device.id?'is-selected':''}`);
      for(const [stroke,width,opacity] of [['#080a08',8,.8],[device.color,5.5,1],['#f8e5c1',1,.3]]){
        const p=document.createElementNS(svgNS,'path');p.setAttribute('d',path);p.setAttribute('fill','none');p.setAttribute('stroke',stroke);p.setAttribute('stroke-width',width);p.setAttribute('opacity',opacity);p.setAttribute('stroke-linecap','round');group.append(p);
      }
      if(moving){const plug=document.createElementNS(svgNS,'rect');plug.setAttribute('x',end.x-7);plug.setAttribute('y',end.y-9);plug.setAttribute('width',14);plug.setAttribute('height',19);plug.setAttribute('rx',2);plug.setAttribute('fill',device.color);plug.setAttribute('stroke','#e0d4b8');group.append(plug);}
      wires.append(group);
    });
  }
  function visibilityChanged() { if (!dialog?.open) return; if (document.hidden) { clearTimeout(timer); timer=0; cancelAnimationFrame(frame); frame=0; } else { render(); scheduleBoot(); } }
  function onClose(event) {
    if (event && (event.currentTarget !== dialog || event.currentTarget.open)) return;
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(timer); timer=0; cancelAnimationFrame(frame); frame=0; cancelDrag();
    dialog.classList.remove('is-open'); emit('close');
    const target=returnFocus; returnFocus=null; if(target?.isConnected) target.focus({preventScroll:true});
  }
  function open(options={}) {
    mount(); if(dialog.open) return;
    returnFocus=options.returnFocus || document.activeElement;
    devices.forEach(device=>{if(device.bootUntil<=Date.now())device.bootUntil=0;});
    dialog.classList.toggle('rack-motion-off', document.getElementById('motionButton')?.getAttribute('aria-pressed') === 'false');
    dialog.showModal(); isOpen = true; dialog.classList.add('is-open'); render(); scheduleBoot(); emit('open');
    dialog.querySelector('.racks-close').focus({preventScroll:true});
  }
  function close() { if(dialog?.open) { dialog.close(); onClose(); } }
  function destroy() {
    close(); clearTimeout(timer); cancelAnimationFrame(frame); resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange',visibilityChanged); dialog?.remove(); dialog=null;board=null;wires=null;selected=null;drag=null;
  }
  window.StationRacks=Object.freeze({open,close,destroy,getState:()=>devices.map(device=>({id:device.id,name:device.name,powered:device.powered,booting:booting(device),port:device.port,linked:linked(device)}))});
})();
