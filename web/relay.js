/* Optional relay repair. All traffic and records are fictional, local to this tab. */
(() => {
  'use strict';
  const UPLINK_PORT = 2;
  let active = false, pendingBoot = false, bootConfirmed = false, recovered = false;
  let generatorBusy = false, originalPort = 1;

  const maintenance = `MAINTENANCE / LOCAL RECORD
02:14  The west circuit stopped answering. Switch link stayed green.
02:31  Old run on port 01 has continuity inside the room only.
02:48  Bypass tested on port 02. Return carrier present.
03:02  RELAY-01 still needs moving. Restart it after patching;
       it loads the upstream route at boot.
03:11  Backup stopped mid-copy. Left the local spool intact.

Wiring note: cat notes/relay-wiring.txt`;
  const wiring = `RELAY WIRING / PENCIL COPY
01  Old yard circuit. Local link works; no upstream reply.
02  Tested bypass to the west circuit. Designated relay uplink.
03  CACHE-02
05  ARCHIVE-03
07  BEACON-04

In the server room, select RELAY-01's LAN cable, then port 02.
You can also drag its colored switch plug from 01 to 02.
Restart RELAY-01 after moving the cable. Wait for its boot.
Return here and run: ping relay

A generator interruption clears the route acknowledgement.
Wait for station power, then restart RELAY-01 again.`;
  const backup = `NIGHTLY BACKUP / LAST LOCAL RECORD
03:08:52  Local snapshot verified. 184 files queued for west circuit.
03:09:04  Remote copy: 61 of 184 acknowledged.
03:09:16  Relay timeout. Waiting for acknowledgement of file 62.
03:09:46  Second timeout. Remote copy stopped.
03:09:47  Local spool retained. Do not mark the remote copy complete.
03:09:48  Operator note: disk is warm. Fan needs cleaning.
03:09:49  [record ends]

Repairing the relay restores the channel. It does not finish this backup.`;
  const reply = `WEST PUMP HOUSE / RECOVERED REPLY
Received your queued list.
No deliveries this week. One spare belt left.
Keep the line open.
Mara`;
  const files = Object.freeze({
    'logs/maintenance.log': maintenance,
    'notes/relay-wiring.txt': wiring,
    'logs/backup.log': backup
  });
  const aliases = Object.freeze({
    'maintenance.log': 'logs/maintenance.log',
    'relay-wiring.txt': 'notes/relay-wiring.txt',
    'backup.log': 'logs/backup.log',
    'relay-reply.log': 'logs/relay-reply.log'
  });
  const rackRelay = () => window.StationRacks?.getState().find(device => device.id === 'relay') || null;

  function reconcile(action, deviceId) {
    const device = rackRelay();
    if (!active) return device;
    if (!device || generatorBusy || !device.powered || device.port !== UPLINK_PORT) {
      pendingBoot = false; bootConfirmed = false;
      return device;
    }
    // Only a new boot started on the correct route counts. A running boot that
    // began on the old circuit cannot be repaired by moving its cable midway.
    if (deviceId === 'relay' && (action === 'restart' || action === 'power') && device.booting) {
      pendingBoot = true; bootConfirmed = false;
    }
    if (pendingBoot && !device.booting) { pendingBoot = false; bootConfirmed = true; }
    return device;
  }

  function getState() {
    const device = reconcile();
    let stage = 'idle';
    if (active) {
      stage = !device ? 'unavailable'
        : generatorBusy ? 'generator'
        : !device.powered ? 'powered-off'
        : device.port === null ? 'unplugged'
        : device.port !== UPLINK_PORT ? 'wrong-port'
        : device.booting ? 'booting'
        : !bootConfirmed ? 'restart-needed'
        : recovered ? 'recovered' : 'ready';
    }
    return { active, stage, recovered, online: active && !generatorBusy && Boolean(device?.linked) && device.port === UPLINK_PORT && bootConfirmed, generatorBusy, pendingBoot, bootConfirmed, device };
  }

  const stages = Object.freeze({
    idle: 'No relay repair is running. Type diagnose to begin the optional job.',
    unavailable: 'The rack controls are unavailable. Reload the station to try again.',
    generator: 'Station power is recovering. Wait for power, then restart RELAY-01 on port 02.',
    'powered-off': 'RELAY-01 is powered off. Patch it to port 02, then power it on.',
    unplugged: 'RELAY-01 has no cable. Read notes/relay-wiring.txt and reconnect it.',
    'wrong-port': 'Local cable link does not reach the tested uplink. Read notes/relay-wiring.txt.',
    booting: 'RELAY-01 is booting. Wait for its link to return.',
    'restart-needed': 'Port 02 is patched. Restart RELAY-01 to load the upstream route.',
    ready: 'RELAY-01 loaded the tested route. Run ping relay to check the far end.',
    recovered: 'West circuit is answering. The recovered reply is in logs/relay-reply.log.'
  });
  function describe() {
    const state = getState();
    return `RELAY CIRCUIT / LOCAL SIMULATION\n${stages[state.stage]}${state.recovered && !state.online ? '\nThe earlier reply remains saved in logs/relay-reply.log.' : ''}`;
  }
  function diagnose() {
    const device = rackRelay();
    if (!device) return stages.unavailable;
    if (!active) {
      originalPort = device.port;
      active = true; pendingBoot = false; bootConfirmed = false; recovered = false;
    }
    const link = !device.powered ? 'POWER OFF' : device.booting ? 'BOOTING' : device.port === null ? 'NO CABLE' : `LOCAL LINK UP / PORT ${String(device.port).padStart(2, '0')}`;
    return `${describe()}\n\nRELAY-01: ${link}\n${getState().online ? 'Distant route: available for a local simulated check.' : 'Distant route: no acknowledgement.'}\n\nOptional repair job opened. Rack wiring has not changed.\nRun logs, then read the maintenance record and wiring note.\nUse repair reset to leave the job and restore its starting cable route.`;
  }
  function ping() {
    const state = getState();
    if (!state.active) return stages.idle;
    if (!state.online) return `PING relay / LOCAL SIMULATION\nNo reply. ${stages[state.stage]}`;
    recovered = true;
    return `PING relay / LOCAL SIMULATION\n1 request, 1 reply. West circuit reachable.\n\n${reply}\n\nSaved locally for this visit: logs/relay-reply.log\nThe interrupted remote backup still needs a separate operator check.`;
  }
  function reset() {
    if (!active) return 'No relay job is active. Rack wiring is unchanged.';
    active = false; pendingBoot = false; bootConfirmed = false; recovered = false;
    const restored = window.StationRacks?.routeCable('relay', originalPort);
    return `Relay repair reset. Recovered reply cleared.\n${restored ? `RELAY-01 restored to ${originalPort === null ? 'its disconnected starting route' : `starting port ${String(originalPort).padStart(2, '0')}`}.` : 'The starting port is occupied. RELAY-01 was left where it is.'}\nOther cables and machine power states are unchanged. Type diagnose to try again.`;
  }
  function command(input) {
    const key = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
    if (key === 'diagnose') return diagnose();
    if (key === 'relay') return describe();
    if (key === 'ping relay') return ping();
    if (key === 'repair reset') return reset();
    if (key === 'logs') return `LOCAL RECORDS / FICTIONAL STATION\nlogs/maintenance.log\nnotes/relay-wiring.txt\nlogs/backup.log\nlogs/relay-reply.log ${recovered ? '[recovered]' : '[no reply recovered]'}\n\nRead a record with cat, for example: cat logs/maintenance.log`;
    if (key.startsWith('cat ')) {
      let path = key.slice(4).replace(/^\.\//, '').replace(/^\//, '');
      path = aliases[path] || path;
      if (Object.hasOwn(files, path)) return files[path];
      if (path === 'logs/relay-reply.log') return recovered ? reply : 'No reply recovered. Type diagnose to open the optional relay repair.';
    }
    return null;
  }

  document.addEventListener('stationracks:change', event => reconcile(event.detail?.action, event.detail?.deviceId));
  document.addEventListener('station:settings', event => {
    if (typeof event.detail?.busy !== 'boolean') return;
    generatorBusy = event.detail.busy;
    reconcile();
  });
  window.StationRelay = Object.freeze({ command, getState, describe });
})();
