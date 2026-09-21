/* Original procedural sound design; no recordings or network assets. */
'use strict';
class StationAudio {
  constructor(){this.enabled=false;this.running=false;this.lastTime=0;this.events=new Set();this.sky=false;}
  async enable(value){
    if(!this.ctx)this.create();
    await this.ctx.resume(); this.enabled=value;
    this.master.gain.setTargetAtTime(value?.55:0,this.ctx.currentTime,.18);
  }
  create(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error('Audio unavailable');
    const c=this.ctx=new AC();
    this.master=c.createGain();this.master.gain.value=0;
    const limiter=c.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.008;limiter.release.value=.16;
    this.master.connect(limiter).connect(c.destination);
    this.machine=c.createGain();this.machine.gain.value=1;this.machine.connect(this.master);
    this.motor=c.createGain();this.motor.gain.value=.15;
    const pan=c.createStereoPanner();pan.pan.value=.48;this.motor.connect(pan).connect(this.machine);
    this.parts=[];
    // Harmonic combustion pulses with a restrained exhaust resonance.
    for(const [ratio,level] of [[1,.6],[2,.23],[3,.13],[5,.055],[8,.018]]){
      const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=30*ratio;g.gain.value=level;
      o.connect(g).connect(this.motor);o.start();this.parts.push({o,ratio});
    }
    this.rattle=this.noise(4,720,.016,this.motor,'bandpass');
    this.rattle.filter.Q.value=1.7;
    this.fan=this.noise(6,1700,.021,this.machine,'lowpass');
    this.wind=this.noise(8,520,.037,this.master,'lowpass');
    const breeze=c.createOscillator(),depth=c.createGain();breeze.frequency.value=.083;depth.gain.value=.009;breeze.connect(depth).connect(this.wind.gain.gain);breeze.start();
    this.starter=c.createGain();this.starter.gain.value=0;this.starter.connect(pan);
    this.starterOsc=c.createOscillator();this.starterOsc.type='triangle';this.starterOsc.frequency.value=88;this.starterOsc.connect(this.starter);this.starterOsc.start();
    this.noise(3,950,.14,this.starter,'bandpass');
  }
  noise(seconds,frequency,level,destination,type){
    const c=this.ctx,n=Math.floor(c.sampleRate*seconds),buffer=c.createBuffer(1,n,c.sampleRate),d=buffer.getChannelData(0);
    let seed=701,previous=0; const raw=new Float32Array(n+2048);
    for(let i=0;i<raw.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;previous=.64*previous+.36*(seed/2147483648-1);raw[i]=previous;}
    d.set(raw.subarray(0,n));
    // Short cosine tapers suppress loop-boundary clicks.
    for(let i=0;i<2048;i++){const t=.5-.5*Math.cos(Math.PI*i/2047);d[i]*=t;d[n-1-i]*=t;}
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;source.loop=true;filter.type=type;filter.frequency.value=frequency;gain.gain.value=level;source.connect(filter).connect(gain).connect(destination);source.start();return {source,filter,gain};
  }
  click(level=.045,tone=850){
    if(!this.ctx||!this.enabled||this.ctx.state!=='running')return;
    const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.setValueAtTime(tone,c.currentTime);o.frequency.exponentialRampToValueAtTime(110,c.currentTime+.04);g.gain.setValueAtTime(level,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.07);o.connect(g).connect(this.machine);o.start();o.stop(c.currentTime+.08);
  }
  update(restarting,time){
    if(!this.ctx)return;
    const c=this.ctx,now=c.currentTime;
    if(restarting&&!this.running){this.events.clear();this.lastTime=time-.01;}
    let speed=30,level=.15,starter=0,fan=.021;
    if(restarting){
      if(time<3){const q=Math.max(0,1-(time-2));speed=12+18*q;level=.15*q*q;}
      else if(time<4){speed=8;level=0;}
      else if(time<5){const q=time-4;speed=9+11*q;level=.009*q;starter=.026*(.45+.55*Math.pow(Math.sin(q*20),2));}
      else if(time<5.65){const q=(time-5)/.65;speed=20+12*q;level=.08+.10*q;}
      else {speed=30+1.3*Math.exp(-(time-5.65)*2)*Math.sin(time*15);level=.15;}
      fan=time<5?0:.021*Math.min(1,(time-5)/1.1);
      // Contactors and fixture ignitions follow the authored video frame times.
      for(const [at,vol,tone] of [[2.17,.025,430],[2.58,.02,350],[4,.04,210],[5,.055,180],[6.75,.018,980],[7.125,.014,1200],[7.33,.012,1000],[8,.018,1250]]){
        if(time>=at&&this.lastTime<at&&!this.events.has(at)){this.events.add(at);this.click(vol,tone);}
      }
    }
    this.parts.forEach(({o,ratio})=>o.frequency.setTargetAtTime(speed*ratio,now,.05));
    this.motor.gain.setTargetAtTime(level,now,.045);this.starter.gain.setTargetAtTime(starter,now,.025);this.starterOsc.frequency.setTargetAtTime(72+speed*2,now,.04);this.fan.gain.gain.setTargetAtTime(fan,now,.12);
    this.machine.gain.setTargetAtTime(this.sky?.1:1,now,.45);
    this.running=restarting;this.lastTime=time;
  }
  setSky(value){this.sky=value;}
  suspend(){return this.ctx?.suspend();}
  resume(){if(this.enabled)return this.ctx?.resume();}
}
window.StationAudio=StationAudio;
