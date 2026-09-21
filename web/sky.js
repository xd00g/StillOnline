/*
 * Still Online / Desert sky
 * A procedural art interpretation, not a sky chart. No network requests.
 * Include sky.css and this script, then DesertSky.open({ returnFocus: button }).
 * Interaction-driven rendering. No animation loop survives a settled sky.
 */
(function () {
  'use strict';
  if (window.DesertSky) return;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  const rgb = (a, b, t) => `rgb(${a.map((v, i) => Math.round(mix(v, b[i], t))).join(',')})`;
  const TAU = Math.PI * 2;
  const DEFAULT_LIGHT = 0.68;
  const MARGIN_X = 0.27;
  const MARGIN_Y = 0.21;
  let instance = null;

  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 149021;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return mix(mix(hash(ix, iy), hash(ix + 1, iy), sx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
  }
  function fbm(x, y, octaves) {
    let sum = 0, amplitude = 0.53, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x, y) * amplitude;
      norm += amplitude;
      const nx = x * 1.91 - y * 0.29 + 9.13;
      y = x * 0.29 + y * 1.91 + 5.71;
      x = nx;
      amplitude *= 0.51;
    }
    return sum / norm;
  }

  // A tilted, broken ribbon with a warmer, broader star cloud near the horizon.
  // The rift follows its own irregular path instead of a symmetrical blur.
  function galacticField(x, y, portrait) {
    const macro = fbm(x * 5.1 + 23, y * 5.1 + 9, 3);
    const axis = 0.14 + y * 0.79 + Math.sin(y * 4.4) * 0.035;
    const warp = (macro - 0.5) * 0.13;
    const distance = x - axis + warp;
    const bulge = Math.exp(-Math.pow((y - 0.66) / 0.29, 2));
    const width = (0.094 + bulge * 0.076) * (portrait ? 1.62 : 1);
    const envelope = Math.exp(-Math.pow(distance / width, 2) * 1.25);
    if (envelope < 0.002) return { density: 0, rift: 0, warm: bulge };
    const detail = fbm(x * 19 + 17, y * 19 + 31, 5);
    const grit = noise(x * 212 + 3, y * 212 + 8);
    const riftAxis = 0.01 + (fbm(y * 10 + 7.3, 61.7, 4) - 0.5) * 0.18;
    const riftWidth = (0.008 + detail * 0.035) * (portrait ? 1.5 : 1);
    const rift = Math.exp(-Math.pow((distance - riftAxis) / riftWidth, 2) * 1.8) * (0.74 + noise(x * 39, y * 43) * 0.26);
    const offshoot = Math.exp(-Math.pow((distance + 0.065 + (noise(y * 29, 31) - 0.5) * 0.024) / (0.008 + detail * 0.013), 2));
    const cloud = Math.pow(clamp((detail - 0.26) * 2.45, 0, 1), 1.7);
    const structure = cloud * (0.83 + grit * 0.32) * (0.6 + macro * 0.72);
    return {
      density: envelope * structure * (1 - rift * 0.95) * (1 - offshoot * 0.51),
      rift: envelope * rift,
      warm: bulge
    };
  }

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }


  // The galactic cloud is split into distant haze, a stellar body and near filaments.
  // All layers and stars share the same camera and deformation, so the interaction
  // changes the volume itself instead of painting a cursor halo on a flat image.
  class GalacticRenderer {
    constructor(canvas) {
      this.canvas=canvas;
      this.gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,powerPreference:'high-performance'});
      if(!this.gl)throw new Error('WebGL unavailable');
      this.time=0;this.energy=0;this.trail=[];this.lastHand=null;
      this.width=0;this.height=0;this.skyline=new Float32Array(512).fill(.711);
      this.bgWidth=1672;this.bgHeight=941;
      this.init();
    }
    shader(type,source){const gl=this.gl,shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;}
    program(vertex,fragment){const gl=this.gl,p=gl.createProgram();const vs=this.shader(gl.VERTEX_SHADER,vertex),fs=this.shader(gl.FRAGMENT_SHADER,fragment);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
    init(){
      const gl=this.gl;
      const transform="\n  uniform float uAspect; uniform float uZoom; uniform vec2 uPan; uniform vec2 uTilt;\n  uniform vec2 uPointer; uniform float uEnergy; uniform vec4 uTrail[4]; uniform vec4 uMeteors[4];\n  mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}\n  vec3 projectSky(vec2 uv,float depth){\n    vec3 p=vec3((uv.x-.5)*uAspect*1.25*depth,(.5-uv.y)*1.25*depth,depth);\n    p.xz=turn(-uPan.x*1.15*uAspect/uZoom-uTilt.x*1.6)*p.xz;\n    p.yz=turn(uPan.y*1.15/uZoom+uTilt.y*1.6)*p.yz;\n    p.x-=uTilt.x*5.;p.y+=uTilt.y*5.;\n    float z=max(.15,p.z);vec2 ndc=p.xy*1.6*uZoom/z;ndc.x/=uAspect;\n    vec2 q=vec2(ndc.x*uAspect,ndc.y),delta=q-uPointer;\n    float hand=exp(-dot(delta,delta)/.18)*uEnergy;\n    vec2 sculpt=turn(hand*(.34+.12/depth))*delta-delta;\n    sculpt+=delta*hand*.13;\n    q+=sculpt;\n    for(int i=0;i<4;i++){\n      vec2 d=q-uTrail[i].xy;float influence=exp(-dot(d,d)/.12)*uTrail[i].z;\n      q+=(turn(influence*.22)*d-d);hand=max(hand,influence*.7);\n      vec2 m=q-uMeteors[i].xy;hand=max(hand,exp(-dot(m,m)/.035)*uMeteors[i].z);\n    }\n    if(p.z<.2)q=vec2(5.);\n    return vec3(q.x/uAspect,q.y,hand);\n  }\n";
      this.cloudProgram=this.program('precision highp float; attribute vec2 aUV; uniform float uDepth; varying vec2 vUV; varying float vHand; '+transform+' void main(){ vUV=aUV; vec2 sky=aUV*1.8-0.4; vec3 result=projectSky(sky,uDepth); vHand=result.z; gl_Position=vec4(result.xy,0.0,1.0); }',
        'precision highp float; varying vec2 vUV; varying float vHand; uniform sampler2D uCloud; uniform sampler2D uHorizon; uniform vec2 uResolution; uniform vec4 uBgMap; uniform float uLayer; uniform float uNight; '+"\n  float skyMask(){\n    vec2 screen=gl_FragCoord.xy/uResolution;screen.y=1.-screen.y;\n    float sourceX=screen.x*uBgMap.x+uBgMap.y;\n    float horizon=(texture2D(uHorizon,vec2(sourceX,.5)).r-uBgMap.w)/uBgMap.z;\n    float edge=1.-smoothstep(horizon-.055,horizon-.003,screen.y);\n    float extinction=1.-smoothstep(horizon-.28,horizon-.03,screen.y)*.78;\n    return edge*extinction;\n  }\n"+' void main(){ vec3 tex=texture2D(uCloud,vUV).rgb; float density=uLayer<0.5?tex.g:(uLayer<1.5?tex.r:tex.b); vec3 color=uLayer<0.5?vec3(.39,.52,.79):(uLayer<1.5?vec3(.87,.78,.71):vec3(1.,.88,.71)); float value=density*(.10+uNight*.92)*(uLayer<.5?.38:(uLayer<1.5?.59:.6)); value*=1.+vHand*1.9; gl_FragColor=vec4(color,value*skyMask()); }');
      this.starProgram=this.program('precision highp float; attribute vec4 aStar; attribute vec3 aStyle; varying vec3 vColor; varying float vAlpha; varying float vBright; uniform float uDpr; uniform float uNight; uniform float uTime; '+transform+' void main(){ vec3 result=projectSky(aStar.xy,aStar.z); float hand=result.z; float blue=aStyle.y; vColor=mix(vec3(1.,.87,.68),vec3(.70,.81,1.),blue); float flicker=.93+.07*sin(uTime*(1.1+aStyle.z)+aStyle.z*39.); vAlpha=aStar.w*(.22+uNight*.88)*(1.+hand*3.6)*flicker; vBright=step(3.,aStyle.x); gl_PointSize=clamp((aStyle.x*(.86+uZoom*.14)+hand*(vBright*6.+1.2))*uDpr,1.,44.); gl_Position=vec4(result.xy,0.,1.); }',
        'precision highp float; varying vec3 vColor; varying float vAlpha; varying float vBright; uniform sampler2D uHorizon; uniform vec2 uResolution; uniform vec4 uBgMap; '+"\n  float skyMask(){\n    vec2 screen=gl_FragCoord.xy/uResolution;screen.y=1.-screen.y;\n    float sourceX=screen.x*uBgMap.x+uBgMap.y;\n    float horizon=(texture2D(uHorizon,vec2(sourceX,.5)).r-uBgMap.w)/uBgMap.z;\n    float edge=1.-smoothstep(horizon-.055,horizon-.003,screen.y);\n    float extinction=1.-smoothstep(horizon-.28,horizon-.03,screen.y)*.78;\n    return edge*extinction;\n  }\n"+' void main(){ vec2 q=gl_PointCoord-.5; float r=length(q); if(r>.5)discard; float core=exp(-r*r*(vBright>.5?450.:16.)); float halo=vBright>.5?exp(-r*r*30.)*.24:0.; float rays=vBright>.5?pow(max(0.,1.-abs(q.x)*70.),4.)*exp(-abs(q.y)*11.)*.10+pow(max(0.,1.-abs(q.y)*70.),4.)*exp(-abs(q.x)*11.)*.10:0.; gl_FragColor=vec4(vColor,(core+halo+rays)*vAlpha*skyMask()); }');
      this.starBuffer=gl.createBuffer();this.meshBuffer=gl.createBuffer();this.cloudTexture=gl.createTexture();this.horizonTexture=gl.createTexture();
      this.updateHorizonTexture();gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
      this.canvas.dataset.renderer='webgl';
    }
    updateHorizonTexture(){const gl=this.gl,pixels=new Uint8Array(512*4);for(let i=0;i<512;i++){pixels[i*4]=Math.round(this.skyline[i]*255);pixels[i*4+3]=255;}this.uploadTexture(this.horizonTexture,512,1,pixels);}
    uploadTexture(texture,w,h,data){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
    setBackdrop(image){
      this.bgWidth=image.naturalWidth;this.bgHeight=image.naturalHeight;
      const sample=makeCanvas(512,Math.round(512*this.bgHeight/this.bgWidth)),g=sample.getContext('2d');g.drawImage(image,0,0,sample.width,sample.height);
      const data=g.getImageData(0,0,sample.width,sample.height).data,h=sample.height;
      for(let x=0;x<512;x++){
        let best=-1,row=Math.round(h*.71);
        for(let y=Math.floor(h*.58);y<Math.floor(h*.79);y++){
          const a=((y-2)*512+x)*4,b=((y+2)*512+x)*4;
          const drop=(data[a]-data[b])*.9+(data[a+1]-data[b+1])*.65+(data[a+2]-data[b+2])*.25;
          if(drop>best){best=drop;row=y;}
        }
        this.skyline[x]=(row-.7)/h;
      }
      // The mask follows the generated image's actual ridge edge, including its crop.
      const clean=this.skyline.slice();for(let x=2;x<510;x++){const local=[...this.skyline.slice(x-2,x+3)].sort((a,b)=>a-b);clean[x]=local[2];}this.skyline=clean;this.updateHorizonTexture();
    }
    resize(w,h,dpr){
      const change=w!==this.width||h!==this.height;this.width=w;this.height=h;this.dpr=dpr;this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
      if(change)this.build();
    }
    build(){
      const gl=this.gl,portrait=this.height>this.width;
      const texW=1024,texH=768,data=new Uint8Array(texW*texH*4);
      const densityAt=(x,y)=>{
        const warp=(fbm(x*5.7+18,y*5.7+11,4)-.5)*.105;
        const axis=.075+y*.86+Math.sin(y*3.5)*.04;
        const d=x-axis+warp,bulge=Math.exp(-Math.pow((y-.57)/.26,2));
        const width=(.09+bulge*.093)*(portrait?1.26:1);
        const envelope=Math.exp(-Math.pow(d/width,2)*1.32);
        if(envelope<.001)return[0,0,0];
        const coarse=fbm(x*11+31,y*11+47,4),fine=fbm(x*66+13,y*66+7,4);
        const branch=(fbm(y*12+4,51.2,4)-.5)*.09;
        const lane=Math.exp(-Math.pow((d-.005-branch)/(.019+coarse*.034),2)*1.7);
        const dust=clamp((fbm(x*34+8,y*34+19,4)-.38)*2.7,0,1);
        const body=envelope*Math.pow(clamp((coarse*.68+fine*.32-.24)*2.65,0,1),1.3)*(1-lane*.97)*(1-dust*.58);
        const halo=envelope*(.25+coarse*.48)*(1-lane*.82);
        const filament=Math.pow(body,1.4)*(.25+fine*.95);
        return[body,halo,filament];
      };
      for(let y=0;y<texH;y++)for(let x=0;x<texW;x++){
        const density=densityAt(x/texW*1.8-.4,y/texH*1.8-.4),i=(y*texW+x)*4;
        data[i]=Math.min(255,density[0]*270);data[i+1]=Math.min(255,density[1]*240);data[i+2]=Math.min(255,density[2]*300);data[i+3]=255;
      }
      this.cloudData=data;this.cloudWidth=texW;this.cloudHeight=texH;this.uploadTexture(this.cloudTexture,texW,texH,data);
      const rng=random(982741),stars=[];
      const add=(u,v,z,size,brightness,tone)=>stars.push(u,v,z,brightness,size,tone,rng());
      const background=portrait?12500:22000,band=portrait?34000:62000;
      for(let i=0;i<background;i++)add(rng()*2.2-.6,rng()*1.9-.5,1.4+rng()*6,.72+Math.pow(rng(),5)*1.4,.12+Math.pow(rng(),2)*.65,rng());
      let accepted=0;
      for(let tries=0;accepted<band&&tries<band*15;tries++){
        const v=rng()*1.7-.4,u=.075+v*.86+(rng()+rng()+rng()-1.5)*.27*(portrait?1.26:1);
        const tx=Math.floor((u+.4)/1.8*texW),ty=Math.floor((v+.4)/1.8*texH);
        if(tx<0||tx>=texW||ty<0||ty>=texH)continue;
        const density=data[(ty*texW+tx)*4]/255;if(rng()>density*1.35)continue;
        add(u,v,2+Math.pow(rng(),.65)*5.5,.58+Math.pow(rng(),4)*1.16,.12+Math.pow(rng(),1.5)*.75,.12+rng()*.78);accepted++;
      }
      for(let i=0;i<(portrait?230:480);i++)add(rng()*1.8-.4,rng()*1.6-.3,.9+rng()*4,i<22?13+rng()*9:3+rng()*7,.5+rng()*.5,rng());
      this.stars=new Float32Array(stars);this.starCount=stars.length/7;
      gl.bindBuffer(gl.ARRAY_BUFFER,this.starBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.stars,gl.STATIC_DRAW);
      const mesh=[],nx=62,ny=48;for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=x/nx,b=y/ny,c=(x+1)/nx,d=(y+1)/ny;mesh.push(a,b,c,b,a,d,a,d,c,b,c,d);}
      this.meshCount=mesh.length/2;gl.bindBuffer(gl.ARRAY_BUFFER,this.meshBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh),gl.STATIC_DRAW);
    }
    uniform(program,name,type,...values){const location=this.gl.getUniformLocation(program,name);if(location!==null)this.gl[type](location,...values);}
    common(program,sky){
      const gl=this.gl,w=this.width,h=this.height;gl.useProgram(program);
      const imageScale=Math.max(w/this.bgWidth,h/this.bgHeight),imageW=this.bgWidth*imageScale,imageH=this.bgHeight*imageScale;
      this.uniform(program,'uAspect','uniform1f',w/h);this.uniform(program,'uZoom','uniform1f',sky.zoom);
      this.uniform(program,'uPan','uniform2f',sky.pan.x,sky.pan.y);this.uniform(program,'uTilt','uniform2f',sky.tilt.x,sky.tilt.y);
      this.uniform(program,'uPointer','uniform2f',(sky.hover.x/w*2-1)*w/h,1-sky.hover.y/h*2);this.uniform(program,'uEnergy','uniform1f',this.energy);
      const trail=new Float32Array(16);for(let i=0;i<this.trail.length;i++){const p=this.trail[i];trail[i*4]=(p.x/w*2-1)*w/h;trail[i*4+1]=1-p.y/h*2;trail[i*4+2]=Math.pow(Math.max(0,1-p.age/1.25),2)*.65;}
      this.uniform(program,'uTrail[0]','uniform4fv',trail);
      const meteors=new Float32Array(16);for(let i=0;i<sky.meteors.length;i++){const m=sky.meteorPosition(sky.meteors[i]);meteors[i*4]=(m.x/w*2-1)*w/h;meteors[i*4+1]=1-m.y/h*2;meteors[i*4+2]=m.alpha;}
      this.uniform(program,'uMeteors[0]','uniform4fv',meteors);
      this.uniform(program,'uNight','uniform1f',sky.light);this.uniform(program,'uTime','uniform1f',this.time);this.uniform(program,'uDpr','uniform1f',this.dpr);
      this.uniform(program,'uResolution','uniform2f',this.canvas.width,this.canvas.height);
      this.uniform(program,'uBgMap','uniform4f',w/imageW,(imageW-w)/2/imageW,h/imageH,(imageH-h)/2/imageH);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.horizonTexture);this.uniform(program,'uHorizon','uniform1i',1);
    }
    render(sky,dt){
      const gl=this.gl;this.time+=dt;
      const target=sky.hover.active?1:0;this.energy=sky.reduced?target:mix(this.energy,target,1-Math.exp(-dt*10));
      if(sky.hover.active){if(this.lastHand&&Math.hypot(sky.hover.x-this.lastHand.x,sky.hover.y-this.lastHand.y)>12&&!sky.reduced)this.trail.unshift({...this.lastHand,age:0});this.lastHand={x:sky.hover.x,y:sky.hover.y};}else this.lastHand=null;
      this.trail=this.trail.slice(0,4);for(const point of this.trail)point.age+=dt;this.trail=this.trail.filter(point=>point.age<1.25);if(sky.reduced)this.trail.length=0;
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      this.common(this.cloudProgram,sky);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.cloudTexture);this.uniform(this.cloudProgram,'uCloud','uniform1i',0);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.meshBuffer);const uv=gl.getAttribLocation(this.cloudProgram,'aUV');gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,0,0);
      for(let i=0;i<3;i++){this.uniform(this.cloudProgram,'uLayer','uniform1f',i);this.uniform(this.cloudProgram,'uDepth','uniform1f',[6.4,4.2,2.8][i]);gl.drawArrays(gl.TRIANGLES,0,this.meshCount);}gl.disableVertexAttribArray(uv);
      this.common(this.starProgram,sky);gl.bindBuffer(gl.ARRAY_BUFFER,this.starBuffer);
      const star=gl.getAttribLocation(this.starProgram,'aStar'),style=gl.getAttribLocation(this.starProgram,'aStyle');gl.enableVertexAttribArray(star);gl.vertexAttribPointer(star,4,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(style);gl.vertexAttribPointer(style,3,gl.FLOAT,false,28,16);
      gl.drawArrays(gl.POINTS,0,this.starCount);gl.disableVertexAttribArray(star);gl.disableVertexAttribArray(style);
      return this.trail.length>0||Math.abs(this.energy-target)>.002;
    }
    destroy(){const gl=this.gl;for(const p of[this.cloudProgram,this.starProgram])gl.deleteProgram(p);for(const b of[this.starBuffer,this.meshBuffer])gl.deleteBuffer(b);for(const t of[this.cloudTexture,this.horizonTexture])gl.deleteTexture(t);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  }


  class CanvasGalacticRenderer {
    constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.skyline=new Float32Array(512).fill(.711);this.bgWidth=1672;this.bgHeight=941;this.energy=0;canvas.dataset.renderer='canvas';}
    updateHorizonTexture(){}
    setBackdrop(image){GalacticRenderer.prototype.setBackdrop.call(this,image);}
    resize(w,h,dpr){this.width=w;this.height=h;this.dpr=dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);const rng=random(812),count=w<h?9000:16000;this.stars=[];for(let i=0;i<count;i++){let x=rng()*1.8-.4,y=rng()*1.7-.4;if(i%3!==0){x=.075+y*.86+(rng()+rng()-1.5)*.28;}this.stars.push({x,y,z:1+rng()*6,size:.5+Math.pow(rng(),4)*1.9,a:.2+rng()*.8});}}
    render(sky,dt){
      const ctx=this.ctx,w=this.width,h=this.height;ctx.clearRect(0,0,w,h);ctx.save();clipToSky(ctx,this);ctx.globalCompositeOperation='lighter';
      const target=sky.hover.active?1:0;this.energy=sky.reduced?target:mix(this.energy,target,1-Math.exp(-dt*12));
      for(const star of this.stars){let x=(star.x-.5)*w*sky.zoom+w*.5+(sky.pan.x+sky.tilt.x*4/star.z)*w,y=(star.y-.5)*h*sky.zoom+h*.5+(sky.pan.y+sky.tilt.y*4/star.z)*h;const dx=x-sky.hover.x,dy=y-sky.hover.y;const hand=Math.exp(-(dx*dx+dy*dy)/26000)*this.energy;const angle=hand*.26;const c=Math.cos(angle),n=Math.sin(angle);x+=dx*c-dy*n-dx;y+=dx*n+dy*c-dy;if(x<0||x>w||y<0||y>horizonAt(this,x))continue;const size=star.size+hand*1.1;ctx.globalAlpha=Math.min(1,star.a*(.2+sky.light*.9)*(1+hand*2));ctx.fillStyle=star.z<2?'#ffe1bd':'#dce7ff';ctx.fillRect(x,y,size,size);}ctx.restore();return Math.abs(this.energy-target)>.002;
    }
    destroy(){}
  }
  function horizonAt(renderer,x){const w=renderer.width,h=renderer.height,scale=Math.max(w/renderer.bgWidth,h/renderer.bgHeight),iw=renderer.bgWidth*scale,ih=renderer.bgHeight*scale;const u=(x+(iw-w)/2)/iw;return renderer.skyline[clamp(Math.round(u*511),0,511)]*ih-(ih-h)/2;}
  function clipToSky(ctx,renderer){ctx.beginPath();ctx.moveTo(0,0);for(let i=0;i<=96;i++){const x=i/96*renderer.width;ctx.lineTo(x,horizonAt(renderer,x)-2);}ctx.lineTo(renderer.width,0);ctx.closePath();ctx.clip();}

  class Sky {
    constructor() {
      this.events = new AbortController();
      this.media = matchMedia('(prefers-reduced-motion: reduce)');
      this.reduced = this.media.matches;
      this.light = this.targetLight = DEFAULT_LIGHT;
      this.pan = {x:0,y:0}; this.targetPan = {x:0,y:0};
      this.tilt = {x:0,y:0}; this.targetTilt = {x:0,y:0};
      this.velocity = {x:0,y:0}; this.hover = {x:0,y:0,active:false};
      this.zoom = this.targetZoom = 1;
      this.pointer = null; this.pointers = new Map(); this.pinch = null;
      this.meteors = []; this.raf = 0; this.lastTime = 0;
      this.width = 0; this.height = 0; this.opened = false; this.visible = true;
      this.returnFocus = null; this.field = null;
      this.starSprites = ['245,228,203','219,218,255','241,202,181'].map(color => {
        const sprite=makeCanvas(48,48), g=sprite.getContext('2d'); if(!g) return sprite;
        const glow=g.createRadialGradient(24,24,0,24,24,24);
        glow.addColorStop(0,'rgba('+color+',1)'); glow.addColorStop(.08,'rgba('+color+',.8)');
        glow.addColorStop(.24,'rgba('+color+',.22)'); glow.addColorStop(1,'rgba('+color+',0)');
        g.fillStyle=glow; g.fillRect(0,0,48,48); return sprite;
      });
      this.dialog=document.createElement('dialog'); this.dialog.className='sky-dialog';
      this.dialog.setAttribute('aria-labelledby','sky-title'); this.dialog.setAttribute('aria-describedby','sky-description');
      this.dialog.innerHTML='<img class="sky-backdrop" src="assets/desert-sky-generated.webp" alt="" aria-hidden="true"><canvas class="sky-meteor-canvas" aria-hidden="true"></canvas><canvas class="sky-canvas" tabindex="0" role="img" aria-label="Interactive imagined Milky Way. Move through the stars, drag to drift, scroll or pinch to zoom. With the sky focused, use arrow keys to move, plus and minus to zoom, or Space to send a meteor." aria-describedby="sky-instructions"></canvas>'+
        '<header class="sky-header"><div class="sky-sr-only"><h2 class="sky-title" id="sky-title">Under the desert sky</h2><p class="sky-description" id="sky-description">A Mojave night, imagined.</p></div><button class="sky-button sky-close" type="button" autofocus aria-label="Close desert sky"><span class="sky-close-text">Back to the outpost</span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16"/></svg></button></header>'+
        '<img class="sky-signature" src="assets/xd00g-sky.png" alt="xD00g" draggable="false">'+
        '<div class="sky-controls"><div class="sky-explore"><p class="sky-instructions" id="sky-instructions"><span class="sky-mouse-hint">Move through the stars. Drag to drift. Scroll to explore.</span><span class="sky-touch-hint">Touch the stars. Drag to drift. Pinch to explore.</span><span class="sky-keyboard-hint"><br>Arrow keys to move · + / − to zoom · Space for a meteor</span></p><div class="sky-actions"><button class="sky-button sky-meteor" type="button">Send a meteor</button><div class="sky-zoom" role="group" aria-label="Sky magnification"><button class="sky-button sky-zoom-out" type="button" aria-label="Wider sky view"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button><output class="sky-zoom-value" aria-label="Current magnification">1.0×</output><button class="sky-button sky-zoom-in" type="button" aria-label="Closer sky view"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10"/></svg></button></div><button class="sky-button sky-reset" type="button">Reset view</button></div><p class="sky-sr-only sky-announcement" aria-live="polite"></p></div>'+
        '<div class="sky-adjust"><div class="sky-adjust-heading"><label for="sky-light">Let your eyes adjust</label><output class="sky-value" for="sky-light">Nightfall</output></div><input class="sky-range" id="sky-light" type="range" min="0" max="100" step="1" value="68" aria-valuetext="Nightfall" aria-describedby="sky-light-help"><div class="sky-range-labels" aria-hidden="true"><span>Last light</span><span>Dark sky</span></div><p class="sky-sr-only" id="sky-light-help">Move toward Dark sky to deepen the night and reveal more of the Milky Way.</p></div></div>';
      document.body.appendChild(this.dialog);
      this.canvas=this.dialog.querySelector('.sky-canvas');
      try{this.renderer=new GalacticRenderer(this.canvas);}catch(error){const replacement=this.canvas.cloneNode(false);this.canvas.replaceWith(replacement);this.canvas=replacement;this.renderer=new CanvasGalacticRenderer(this.canvas);console.info('Desert sky uses Canvas fallback:',error.message);}
      this.ctx=this.renderer.gl||this.renderer.ctx;
      this.backdrop=this.dialog.querySelector('.sky-backdrop');
      this.meteorCanvas=this.dialog.querySelector('.sky-meteor-canvas');this.meteorCtx=this.meteorCanvas.getContext('2d');
      const loadBackdrop=()=>{try{this.renderer.setBackdrop(this.backdrop);this.requestFrame();}catch(error){console.info('Desert sky silhouette mask:',error.message);}};
      this.listen(this.backdrop,'load',loadBackdrop);if(this.backdrop.complete&&this.backdrop.naturalWidth)loadBackdrop();
      this.listen(this.canvas,'webglcontextlost',event=>{event.preventDefault();this.stop();});
      this.listen(this.canvas,'webglcontextrestored',()=>{this.renderer=new GalacticRenderer(this.canvas);this.renderer.setBackdrop(this.backdrop);this.renderer.resize(this.width,this.height,this.dpr);this.requestFrame();});
      this.range=this.dialog.querySelector('.sky-range'); this.value=this.dialog.querySelector('.sky-value');
      this.zoomValue=this.dialog.querySelector('.sky-zoom-value'); this.closeButton=this.dialog.querySelector('.sky-close');
      if(!this.ctx) this.showFallback();
      this.listen(this.closeButton,'click',()=>this.close());
      this.listen(this.dialog.querySelector('.sky-reset'),'click',()=>this.reset());
      this.listen(this.dialog.querySelector('.sky-meteor'),'click',()=>this.sendMeteor());
      this.listen(this.dialog.querySelector('.sky-zoom-in'),'click',()=>this.setZoom(this.targetZoom+.35));
      this.listen(this.dialog.querySelector('.sky-zoom-out'),'click',()=>this.setZoom(this.targetZoom-.35));
      this.listen(this.range,'input',()=>{this.targetLight=Number(this.range.value)/100;this.updateLabel();this.requestFrame();});
      this.listen(this.dialog,'cancel',e=>{e.preventDefault();this.close();});
      this.listen(this.dialog,'close',()=>{if(!this.dialog.open)this.finishClose();});
      this.listen(this.dialog,'keydown',e=>{
        if(e.key!=='Tab')return;
        const controls=[...this.dialog.querySelectorAll('button,input,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=controls[0],last=controls[controls.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      });
      this.listen(this.canvas,'keydown',e=>this.keyPan(e));
      this.listen(this.canvas,'pointerdown',e=>this.pointerDown(e));
      this.listen(this.canvas,'pointermove',e=>this.pointerMove(e));
      this.listen(this.canvas,'pointerup',e=>this.pointerUp(e));
      this.listen(this.canvas,'pointercancel',e=>this.pointerUp(e,true));
      this.listen(this.canvas,'lostpointercapture',e=>{if(this.pointers.has(e.pointerId))this.pointerUp(e,true);});
      this.listen(this.canvas,'pointerleave',()=>{if(!this.pointers.size)this.clearHover();});
      this.listen(this.canvas,'wheel',e=>{
        e.preventDefault();e.stopPropagation();const p=this.eventPoint(e);
        const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.height:1);
        this.setZoom(this.targetZoom*Math.exp(-clamp(delta,-500,500)*.0015),p.x,p.y);
      },{passive:false});
      this.listen(window,'blur',()=>{this.releasePointer();this.clearHover();});
      this.listen(document,'visibilitychange',()=>{
        if(document.hidden){this.releasePointer();this.clearHover();this.stop();}
        else if(this.opened){this.resize();this.requestFrame();}
      });
      this.listen(window,'resize',()=>{if(this.opened)this.resize();});
      this.onMotionChange=e=>{this.reduced=e.matches;this.velocity.x=this.velocity.y=0;this.targetTilt.x=this.targetTilt.y=0;this.meteors.length=0;this.requestFrame();};
      this.media.addEventListener('change',this.onMotionChange);
      this.resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(this.opened)this.resize();}):null;
      this.resizeObserver?.observe(this.dialog);
      this.intersectionObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
        this.visible=entries[entries.length-1].isIntersecting;if(this.visible)this.requestFrame();else this.stop();
      }):null;
      this.intersectionObserver?.observe(this.canvas);
    }
    listen(target,type,fn,options={}){target.addEventListener(type,fn,{...options,signal:this.events.signal});}
    showFallback(){const p=document.createElement('p');p.className='sky-fallback';p.textContent='The sky needs a browser with Canvas support. You can still return to the outpost.';this.dialog.appendChild(p);this.canvas.hidden=true;this.dialog.querySelector('.sky-controls').hidden=true;}
    open(options={}){
      if(this.opened)return;this.returnFocus=options.returnFocus instanceof HTMLElement?options.returnFocus:document.activeElement;
      this.dialog.classList.toggle('sky-arriving',!this.media.matches&&document.getElementById('motionButton')?.getAttribute('aria-pressed')!=='false');
      this.opened=true;this.visible=true;this.dialog.showModal();this.closeButton.focus({preventScroll:true});this.resize();this.requestFrame();
      document.dispatchEvent(new CustomEvent('desertsky:open'));
    }
    close(){if(!this.opened)return;this.dialog.close();this.finishClose();}
    finishClose(){
      if(!this.opened)return;this.opened=false;this.stop();this.releasePointer();this.hover.active=false;this.meteors.length=0;
      this.targetTilt.x=this.targetTilt.y=0;
      const target=this.returnFocus;this.returnFocus=null;
      if(target instanceof HTMLElement&&target.isConnected&&!target.closest('[inert]')&&!target.matches(':disabled'))target.focus({preventScroll:true});
      document.dispatchEvent(new CustomEvent('desertsky:close'));
    }
    destroy(){this.close();this.stop();this.events.abort();this.media.removeEventListener('change',this.onMotionChange);this.resizeObserver?.disconnect();this.intersectionObserver?.disconnect();this.dialog.remove();this.field=null;this.renderer.destroy();}
    stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;this.lastTime=0;}
    updateLabel(){const n=this.targetLight,label=n<.2?'Last light':n<.46?'Blue hour':n<.8?'Nightfall':'Dark sky';this.value.textContent=label;this.range.setAttribute('aria-valuetext',label);}
    reset(){
      this.releasePointer();this.targetTilt.x=this.targetTilt.y=0;this.hover.active=false;this.meteors.length=0;
      this.targetZoom=1;this.zoomValue.textContent='1.0×';this.targetPan.x=this.targetPan.y=0;
      if(this.renderer.trail)this.renderer.trail.length=0;this.renderer.energy=0;this.renderer.lastHand=null;
      this.targetLight=DEFAULT_LIGHT;this.range.value=String(DEFAULT_LIGHT*100);this.updateLabel();this.requestFrame();
    }
    keyPan(e){
      if(['+','=','-','_'].includes(e.key)){e.preventDefault();e.stopPropagation();this.setZoom(this.targetZoom+(['+','='].includes(e.key)?.2:-.2));return;}
      if(e.code==='Space'||e.key.toLowerCase()==='m'){e.preventDefault();e.stopPropagation();if(!e.repeat)this.sendMeteor();return;}
      const move={ArrowLeft:[-.035,0],ArrowRight:[.035,0],ArrowUp:[0,-.025],ArrowDown:[0,.025]}[e.key];
      if(!move)return;e.preventDefault();e.stopPropagation();this.targetPan.x+=move[0];this.targetPan.y+=move[1];this.constrainPan();
      this.hover={x:this.width*.5,y:this.height*.42,active:true};this.requestFrame();
    }
    eventPoint(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
    clearHover(){this.hover.active=false;this.targetTilt.x=this.targetTilt.y=0;this.requestFrame();}
    constrainPan(){
      const xl=.2+(this.targetZoom-1)*.77,yl=.14+(this.targetZoom-1)*.71;
      const x=clamp(this.targetPan.x,-xl,xl),y=clamp(this.targetPan.y,-yl,yl);
      if(x!==this.targetPan.x)this.velocity.x=0;if(y!==this.targetPan.y)this.velocity.y=0;
      this.targetPan.x=x;this.targetPan.y=y;
    }
    setZoom(value,x=this.width*.5,y=this.height*.42){
      const next=clamp(value,1,2.8),ratio=next/this.targetZoom;
      this.targetPan.x=(x/this.width-.5)*(1-ratio)+this.targetPan.x*ratio;
      this.targetPan.y=(y/this.height-.5)*(1-ratio)+this.targetPan.y*ratio;
      this.targetZoom=next;this.velocity.x=this.velocity.y=0;this.constrainPan();
      this.zoomValue.textContent=next.toFixed(1)+'×';this.requestFrame();
    }
    pointerDown(e){
      if(e.button!==0||this.pointers.size>=2)return;
      const p=this.eventPoint(e);this.pointers.set(e.pointerId,p);this.hover={...p,active:true};this.velocity.x=this.velocity.y=0;
      if(this.pointers.size===1)this.pointer={id:e.pointerId,x:p.x,y:p.y,lastX:p.x,lastY:p.y,time:performance.now(),panX:this.targetPan.x,panY:this.targetPan.y,moved:false,type:e.pointerType};
      else{const[a,b]=[...this.pointers.values()];this.pointer.moved=true;this.pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:this.targetZoom,centerX:(a.x+b.x)/2,centerY:(a.y+b.y)/2,panX:this.targetPan.x,panY:this.targetPan.y,tiltX:this.targetTilt.x,tiltY:this.targetTilt.y};}
      this.canvas.setPointerCapture(e.pointerId);this.canvas.classList.add('sky-dragging');this.canvas.focus({preventScroll:true});this.requestFrame();
    }
    pointerMove(e){
      const p=this.eventPoint(e);this.hover={...p,active:true};
      if(!this.reduced&&e.pointerType!=='touch'){this.targetTilt.x=(p.x/this.width-.5)*-.035;this.targetTilt.y=(p.y/this.height-.5)*-.022;}
      if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,p);
      if(this.pinch&&this.pointers.size===2){
        const[a,b]=[...this.pointers.values()],pinch=this.pinch;
        const zoom=clamp(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,1,2.8);
        const worldX=(pinch.centerX/this.width-.5-pinch.panX-pinch.tiltX)/pinch.zoom;
        const worldY=(pinch.centerY/this.height-.5-pinch.panY-pinch.tiltY)/pinch.zoom;
        this.targetPan.x=(a.x+b.x)/2/this.width-.5-worldX*zoom-this.targetTilt.x;
        this.targetPan.y=(a.y+b.y)/2/this.height-.5-worldY*zoom-this.targetTilt.y;
        this.targetZoom=zoom;this.velocity.x=this.velocity.y=0;this.constrainPan();
        this.zoomValue.textContent=zoom.toFixed(1)+'×';
      }
      else if(this.pointer&&e.pointerId===this.pointer.id){
        const pointer=this.pointer,dx=p.x-pointer.x,dy=p.y-pointer.y;if(Math.hypot(dx,dy)>7)pointer.moved=true;
        this.targetPan.x=pointer.panX+dx/this.width;this.targetPan.y=pointer.panY+dy/this.height;
        const now=performance.now(),dt=Math.max(8,now-pointer.time)/1000;
        this.velocity.x=mix(this.velocity.x,clamp((p.x-pointer.lastX)/this.width/dt,-1.2,1.2),.6);
        this.velocity.y=mix(this.velocity.y,clamp((p.y-pointer.lastY)/this.height/dt,-.8,.8),.6);
        pointer.lastX=p.x;pointer.lastY=p.y;pointer.time=now;this.constrainPan();
      }
      this.requestFrame();
    }
    pointerUp(e,cancelled=false){
      if(!this.pointers.has(e.pointerId))return;
      const tapped=!cancelled&&!this.pinch&&this.pointer?.id===e.pointerId&&!this.pointer.moved;
      const p=this.pointers.get(e.pointerId),touch=this.pointer?.type==='touch';this.pointers.delete(e.pointerId);
      if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
      if(tapped)this.sendMeteor(p.x,p.y);
      if(cancelled||this.reduced||(this.pointer&&performance.now()-this.pointer.time>110))this.velocity.x=this.velocity.y=0;
      this.pinch=null;
      if(this.pointers.size){const[id,q]=[...this.pointers.entries()][0];this.pointer={id,x:q.x,y:q.y,lastX:q.x,lastY:q.y,time:performance.now(),panX:this.targetPan.x,panY:this.targetPan.y,moved:true,type:'touch'};}
      else{this.pointer=null;this.canvas.classList.remove('sky-dragging');if(touch)this.clearHover();}
      this.requestFrame();
    }
    releasePointer(){const ids=[...this.pointers.keys()];this.pointers.clear();this.pointer=null;this.pinch=null;this.velocity.x=this.velocity.y=0;for(const id of ids)if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.canvas.classList.remove('sky-dragging');}
    sendMeteor(x=this.width*.38,y=this.height*.3){
      if(!this.ctx)return;y=Math.min(y,this.height*.63);const direction=this.meteors.length%2?-1:1;
      this.meteors.push({x,y,age:0,direction,static:this.reduced});if(this.meteors.length>4)this.meteors.shift();
      this.dialog.querySelector('.sky-announcement').textContent=this.reduced?'Meteor trail revealed. Motion is reduced.':'Meteor sent across the sky.';
      this.requestFrame();
    }

    resize() {
      if(!this.ctx||!this.opened)return;
      const rect=this.canvas.getBoundingClientRect(),width=Math.round(rect.width),height=Math.round(rect.height);
      if(width<1||height<1)return;const dpr=Math.min(devicePixelRatio||1,1.5);
      if(width===this.width&&height===this.height&&dpr===this.dpr)return;
      this.width=width;this.height=height;this.dpr=dpr;
      this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
      this.meteorCanvas.width=this.canvas.width;this.meteorCanvas.height=this.canvas.height;this.meteorCtx.setTransform(dpr,0,0,dpr,0,0);
      this.renderer.resize(width,height,dpr);this.requestFrame();
    }

    requestFrame() {
      if (!this.ctx || !this.opened || !this.visible || document.hidden || this.raf) return;
      this.raf = requestAnimationFrame((time) => this.frame(time));
    }

    frame(time) {
      this.raf=0;
      if(!this.opened||!this.visible||document.hidden)return;
      const dt=this.lastTime?Math.min(.05,(time-this.lastTime)/1000):1/60;
      if(!this.pointer&&!this.reduced){
        this.targetPan.x+=this.velocity.x*dt;this.targetPan.y+=this.velocity.y*dt;
        const friction=Math.exp(-dt*5.2);this.velocity.x*=friction;this.velocity.y*=friction;
        if(Math.abs(this.velocity.x)<.001)this.velocity.x=0;if(Math.abs(this.velocity.y)<.001)this.velocity.y=0;
        this.constrainPan();
      }
      const ease=this.reduced?1:1-Math.exp(-dt*(this.pointer?23:12));
      this.light=mix(this.light,this.targetLight,ease);this.zoom=mix(this.zoom,this.targetZoom,ease);
      this.pan.x=mix(this.pan.x,this.targetPan.x,ease);this.pan.y=mix(this.pan.y,this.targetPan.y,ease);
      this.tilt.x=mix(this.tilt.x,this.targetTilt.x,ease);this.tilt.y=mix(this.tilt.y,this.targetTilt.y,ease);
      const moving=Math.abs(this.light-this.targetLight)>.0008||Math.abs(this.zoom-this.targetZoom)>.0005||
        Math.abs(this.pan.x-this.targetPan.x)>.0001||Math.abs(this.pan.y-this.targetPan.y)>.0001||
        Math.abs(this.tilt.x-this.targetTilt.x)>.00005||Math.abs(this.tilt.y-this.targetTilt.y)>.00005||
        (!this.pointer&&(Math.abs(this.velocity.x)>.001||Math.abs(this.velocity.y)>.001));
      if(!moving){this.light=this.targetLight;this.zoom=this.targetZoom;Object.assign(this.pan,this.targetPan);Object.assign(this.tilt,this.targetTilt);}
      for(const meteor of this.meteors)if(!meteor.static)meteor.age+=dt;
      this.meteors=this.meteors.filter(meteor=>meteor.static||meteor.age<1.65);
      const effects=this.draw(dt);
      if(!this.reduced&&(moving||effects||this.meteors.some(meteor=>!meteor.static))){this.lastTime=time;this.requestFrame();}
      else this.lastTime=0;
    }

    draw(dt=1/60){
      const brightness=mix(1.04,.39,this.light),saturation=mix(1.08,.86,this.light);
      this.backdrop.style.filter='brightness('+brightness+') saturate('+saturation+')';
      const active=this.renderer.render(this,dt);
      const ctx=this.meteorCtx;ctx.clearRect(0,0,this.width,this.height);ctx.save();clipToSky(ctx,this.renderer);this.drawMeteors();ctx.restore();return active;
    }

    meteorPosition(meteor){
      const progress=meteor.static?.57:clamp(meteor.age/1.25,0,1);
      const travel=Math.min(this.width*.32,390);
      const distance=travel*(1-Math.pow(1-progress,1.5));
      const alpha=meteor.static?.85:smooth(meteor.age/.055)*(1-smooth((meteor.age-.82)/.83));
      return{x:meteor.x+distance*meteor.direction,y:meteor.y+distance*.38,alpha,progress,travel};
    }

    drawMeteors(){
      const ctx=this.meteorCtx;
      ctx.globalCompositeOperation='screen';
      for(const meteor of this.meteors){
        const head=this.meteorPosition(meteor);
        const length=head.travel*.6*Math.min(1,head.progress*5);
        const tx=head.x-length*meteor.direction,ty=head.y-length*.38;
        const gradient=ctx.createLinearGradient(tx,ty,head.x,head.y);
        gradient.addColorStop(0,'rgba(201,158,191,0)');gradient.addColorStop(.48,'rgba(234,180,156,.18)');
        gradient.addColorStop(.85,'rgba(249,218,191,.75)');gradient.addColorStop(1,'rgba(255,249,231,1)');
        ctx.strokeStyle=gradient;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(tx,ty);
        ctx.quadraticCurveTo(mix(tx,head.x,.55),mix(ty,head.y,.55)-head.travel*.012,head.x,head.y);
        ctx.globalAlpha=head.alpha*.16;ctx.lineWidth=8;ctx.stroke();
        ctx.globalAlpha=head.alpha;ctx.lineWidth=1.45;ctx.stroke();
        ctx.globalAlpha=head.alpha;const glow=22;ctx.drawImage(this.starSprites[0],head.x-glow/2,head.y-glow/2,glow,glow);
        ctx.fillStyle='#fff3da';ctx.beginPath();ctx.arc(head.x,head.y,1.35,0,TAU);ctx.fill();
      }
      ctx.globalAlpha=1;
    }

  }

  window.DesertSky = Object.freeze({
    open(options) {
      if (!instance) instance = new Sky();
      instance.open(options);
    },
    close() { instance?.close(); },
    destroy() { instance?.destroy(); instance = null; }
  });
})();
