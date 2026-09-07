/* Room reconstruction from the owner's IMG_9192 / IMG_9194 / IMG_9195 / IMG_9196.
   Dimensions of the architectural envelope and furniture are photographic estimates.
   All materials below are procedural: no photograph is projected onto the room. */
function buildPersonalRoom(scene,T,helpers){
  const {box,roundBox,cyl,ring,tex,wire,M,contactShadow}=helpers;
  const room=new T.Group(); room.name='Photographed listening room'; scene.add(room);
  let seed=9196; const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const tau=Math.PI*2;
  const plasterMap=tex(512,512,(c,w,h)=>{const im=c.createImageData(w,h);for(let i=0;i<im.data.length;i+=4){let v=240+(rnd()-.5)*9;im.data[i]=v;im.data[i+1]=v-2;im.data[i+2]=v-8;im.data[i+3]=255;}c.putImageData(im,0,0);});
  const plaster=new T.MeshStandardMaterial({color:0xf1eee5,map:plasterMap,bumpMap:plasterMap,bumpScale:.00035,roughness:.94});
  const skirting=new T.MeshStandardMaterial({color:0xe7e5da,roughness:.72});
  const chrome=new T.MeshStandardMaterial({color:0xd7dfdc,metalness:1,roughness:.13});
  const greenLacquer=new T.MeshPhysicalMaterial({color:0x132b21,metalness:.35,roughness:.24,clearcoat:1,clearcoatRoughness:.12});
  const seamMat=new T.MeshStandardMaterial({color:0x514633,roughness:.9});
  const black=new T.MeshStandardMaterial({color:0x10130f,roughness:.69});
  const woodFloor=tex(1536,192,(c,w,h)=>{
    const im=c.createImageData(w,h); const knots=[{x:.29*w,y:.56*h},{x:.8*w,y:.19*h}];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let yy=y+5*Math.sin(x*.005)+2*Math.sin(x*.014+y*.03);
      for(const k of knots){let d=(x-k.x)/90;yy+=12*Math.exp(-d*d)*Math.tanh((y-k.y)/18);}
      let fine=Math.sin(yy*3.1+.6*Math.sin(x*.016))*1.6;
      let n=.8*Math.sin(yy*.13)+1.1*Math.sin(yy*.5)+fine+(rnd()-.5)*5;
      let p=(y*w+x)*4;im.data[p]=199+n;im.data[p+1]=176+n;im.data[p+2]=135+n;im.data[p+3]=255;
    }c.putImageData(im,0,0);
    for(let k=0;k<240;k++){let yy=rnd()*h;c.beginPath();for(let x=0;x<=w;x+=18){let y=yy+4*Math.sin(x*.006+k)+1.3*Math.sin(x*.014+k*.07);x?c.lineTo(x,y):c.moveTo(x,y);}c.strokeStyle=`rgba(104,78,42,${.025+rnd()*.06})`;c.lineWidth=.3+rnd()*.7;c.stroke();}
    for(const k of knots){for(let r=1;r<10;r++){c.beginPath();c.ellipse(k.x,k.y,4+r*5,1+r*.65,.05,0,tau);c.strokeStyle=`rgba(93,70,42,${.17-r*.012})`;c.lineWidth=.7;c.stroke();}}
  });
  box(7,.04,8.5,seamMat,0,-.034,2.0,room);
  const floorMats=Array.from({length:9},(_,i)=>new T.MeshStandardMaterial({map:woodFloor,bumpMap:woodFloor,bumpScale:.0004,color:new T.Color().setHSL(.108,.13,.88+(i-4)*.009),roughness:.66}));
  // The broad pale-oak boards in the supplied photographs run across the installation.
  for(let row=0;row<35;row++){
    const z=-2.15+row*.244;let start=-3.5;const first=.56+((row*7)%11)*.115;
    for(let j=0;start<3.499;j++){let len=Math.min(j===0?first:1.26+((row+j*5)%9)*.14,3.5-start);box(len-.0014,.013,.2427,floorMats[(row+j*3)%9],start+len/2,-.007,z,room);start+=len;}
  }
  // White alcove, shallow front piers, continuous skirting and a deep overhead lintel.
  box(7,3.15,.12,plaster,0,1.535,-1.19,room);
  for(const s of [-1,1]){
    box(.30,2.60,.35,plaster,s*2.39,1.30,-.975,room);
    box(.72,3.1,.10,plaster,s*2.90,1.54,-1.11,room);
    box(.32,.076,.027,skirting,s*2.39,.038,-.786,room);
    box(.72,.076,.023,skirting,s*2.90,.038,-1.045,room);
  }
  box(4.50,.235,.42,plaster,0,2.66,-.93,room);
  box(5.12,.033,.052,skirting,0,2.53,-.71,room);
  box(5.12,.018,.024,new T.MeshStandardMaterial({color:0x8b8a80,roughness:.8}),0,2.511,-.86,room);
  // Textile artwork: a field of irregular, translucent ivory rings with sparse edges.
  // The geometry carries gentle folds; the map describes fibres and raised ring relief.
  const tapestryMap=tex(2048,1408,(c,w,h)=>{
    c.fillStyle='#b9b6a8';c.fillRect(0,0,w,h);
    for(let i=0;i<210;i++){let x=rnd()*w,y=rnd()*h,r=20+rnd()*170;let g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${rnd()>.45?'242,237,217':'130,126,108'},${.015+rnd()*.025})`);g.addColorStop(1,'rgba(210,205,181,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
    const bg=c.getImageData(0,0,w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let p=(y*w+x)*4;let v=(rnd()-.5)*5+(x%3===0?-1.2:0)+(y%3===0?-1.2:0);bg.data[p]+=v;bg.data[p+1]+=v;bg.data[p+2]+=v;}c.putImageData(bg,0,0);
    const rings=[];for(let i=0;i<10500;i++){
      let x=rnd()*w,y=rnd()*h;
      let edge=Math.min(1,(x/w+.05)*2.5),bottom=Math.min(1,(h-y)/70+.25);
      let flow=.56+.22*Math.sin(x*.010+y*.009)+.14*Math.sin(x*.024-y*.018);
      if(rnd()>edge*bottom*flow)continue;
      rings.push({x,y,r:3.5+Math.pow(rnd(),.65)*9.5,a:.22+rnd()*.35});
    }
    for(const q of rings){
      c.save();c.translate(q.x,q.y);c.rotate(rnd()*tau);c.scale(1,.79+rnd()*.3);
      c.beginPath();c.arc(.6,1.0,q.r,0,tau);c.strokeStyle=`rgba(108,102,79,${q.a*.45})`;c.lineWidth=1.8;c.stroke();
      c.beginPath();c.arc(0,0,q.r,0,tau);c.fillStyle=`rgba(245,242,221,${q.a*.30})`;c.fill();c.strokeStyle=`rgba(250,247,228,${q.a+.12})`;c.lineWidth=1.0+rnd()*1.1;c.stroke();
      c.beginPath();c.arc(-.3,-.25,q.r*.74,Math.PI*.93,Math.PI*1.91);c.strokeStyle=`rgba(252,249,233,${q.a*.65})`;c.lineWidth=1.1;c.stroke();
      if(rnd()>.60){c.beginPath();c.arc(0,0,.7+rnd(),0,tau);c.fillStyle='rgba(108,102,85,.18)';c.fill();}c.restore();
    }
    // Top hanging band is visibly darker in the photographs.
    c.fillStyle='rgba(76,78,71,.32)';c.fillRect(0,0,w,95);
    let edge=c.createLinearGradient(0,0,110,0);edge.addColorStop(0,'rgba(125,119,99,.16)');edge.addColorStop(1,'rgba(125,119,99,0)');c.fillStyle=edge;c.fillRect(0,0,110,h);
  });
  const clothMat=new T.MeshStandardMaterial({map:tapestryMap,bumpMap:tapestryMap,bumpScale:.0024,color:0xfffcee,roughness:.97,side:T.DoubleSide});
  const clothGeo=new T.PlaneGeometry(4.20,2.42,120,70),pos=clothGeo.attributes.position;
  for(let i=0;i<pos.count;i++){let x=pos.getX(i),y=pos.getY(i);let z=.009*Math.sin(x*12+y*1.1)+.004*Math.sin(x*31-y*.6)+.003*Math.cos(y*13+x*3);pos.setZ(i,z);if(y< -1.18)pos.setY(i,y+.006*Math.sin(x*13));}clothGeo.computeVertexNormals();
  const cloth=new T.Mesh(clothGeo,clothMat);cloth.position.set(0,1.258,-1.098);cloth.castShadow=true;cloth.receiveShadow=true;room.add(cloth);
  // Low four-bay modular credenza, photographed with lacquered outer doors and felt inserts.
  const cabinet=new T.Group();cabinet.name='Chrome and green four-bay credenza';room.add(cabinet);
  const bay=.5325,front=-.31,back=-.75,lo=.044,hi=.408;
  box(2.116,.014,.416,greenLacquer,0,.400,-.53,cabinet);
  box(2.116,.010,.416,greenLacquer,0,.051,-.53,cabinet);
  function tube(a,b,r=.0063){const aa=new T.Vector3(...a),bb=new T.Vector3(...b),d=bb.clone().sub(aa);let m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),16),chrome);m.position.copy(aa.add(bb).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());m.castShadow=true;m.receiveShadow=true;cabinet.add(m);}
  const feltMap=tex(768,512,(c,w,h)=>{
    const im=c.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let r=Math.hypot(x-w*.97,(y-h*1.02)*1.2),phase=r/56;
      let ridge=Math.pow(.5+.5*Math.cos(phase*tau),4),trough=Math.pow(.5+.5*Math.cos(phase*tau+.50),6);
      let n=(rnd()-.5)*18;let light=12*ridge-11*trough+3*Math.sin(x*.02+y*.028);
      let p=(y*w+x)*4;im.data[p]=58+light+n;im.data[p+1]=73+light+n;im.data[p+2]=29+light*.75+n*.5;im.data[p+3]=255;
    }c.putImageData(im,0,0);
    for(let i=0;i<24000;i++){let x=rnd()*w,y=rnd()*h;c.strokeStyle=rnd()>.55?'rgba(167,173,86,.045)':'rgba(16,27,10,.08)';c.lineWidth=.65;c.beginPath();c.moveTo(x,y);c.lineTo(x+(rnd()-.5)*2,y-1.5-rnd()*2.5);c.stroke();}
  });
  const feltLeft=new T.MeshStandardMaterial({map:feltMap,bumpMap:feltMap,bumpScale:.002,roughness:1,color:0xe3e7cb});
  const rightMap=feltMap.clone();rightMap.needsUpdate=true;rightMap.wrapS=T.RepeatWrapping;rightMap.repeat.x=-1;rightMap.offset.x=1;
  const feltRight=new T.MeshStandardMaterial({map:rightMap,bumpMap:rightMap,bumpScale:.002,roughness:1,color:0xe3e7cb});
  for(let i=0;i<4;i++){
    let x=-bay*1.5+i*bay;let panel=box(bay-.020,.344,.007,(i===0||i===3)?greenLacquer:(i===1?feltLeft:feltRight),x,.225,front-.006,cabinet);
    box(bay-.024,.004,.418,greenLacquer,x,.398,-.53,cabinet);
    if(i===0||i===3){let lock=cyl(.012,.005,chrome,x,.344,front+.001,cabinet);lock.rotation.x=Math.PI/2;let inner=cyl(.0072,.006,M.metal,x,.344,front+.004,cabinet);inner.rotation.x=Math.PI/2;box(.008,.0018,.001,black,x,.344,front+.008,cabinet);}
    else{box(.029,.015,.007,black,x,.379,front+.001,cabinet);box(.019,.012,.005,black,x,.061,front+.001,cabinet);}
  }
  for(const x of [-1.065,1.065])box(.006,.344,.421,greenLacquer,x,.225,-.53,cabinet);
  for(let i=0;i<=4;i++){
    let x=-1.065+i*bay;
    for(const z of [front,back]){
      tube([x,lo,z],[x,hi,z]);
      for(const y of [lo,hi]){let b=new T.Mesh(new T.SphereGeometry(.0105,16,10),chrome);b.position.set(x,y,z);b.castShadow=true;cabinet.add(b);}
      cyl(.027,.008,black,x,.005,z,cabinet);cyl(.010,.027,black,x,.019,z,cabinet);cyl(.012,.005,chrome,x,.033,z,cabinet);
    }
    for(const y of [lo,hi])tube([x,y,front],[x,y,back]);
  }
  for(const z of [front,back])for(const y of [lo,hi])for(let i=0;i<4;i++)tube([-1.065+i*bay,y,z],[-1.065+(i+1)*bay,y,z]);
  contactShadow(0,-.53,2.7,.94,.48,room,.003);
  // Rug visible in the owner's room: quiet warm grey with irregular linked circular outlines.
  const rugMap=tex(1536,1024,(c,w,h)=>{
    c.fillStyle='#a9a79b';c.fillRect(0,0,w,h);const im=c.getImageData(0,0,w,h);for(let p=0;p<im.data.length;p+=4){let n=(rnd()-.5)*19;im.data[p]+=n;im.data[p+1]+=n;im.data[p+2]+=n;}c.putImageData(im,0,0);
    for(let yy=-100;yy<h+200;yy+=230)for(let xx=-100;xx<w+200;xx+=235){let x=xx+(rnd()-.5)*80,y=yy+(rnd()-.5)*70;c.beginPath();c.ellipse(x,y,92+rnd()*30,105+rnd()*25,rnd()*.9,0,tau);c.strokeStyle='rgba(87,85,75,.24)';c.lineWidth=5+rnd()*3;c.shadowColor='rgba(75,72,62,.30)';c.shadowBlur=2.6;c.stroke();c.shadowBlur=0;c.strokeStyle='rgba(202,199,181,.20)';c.lineWidth=1.5;c.stroke();}
  });
  const rugMat=new T.MeshStandardMaterial({map:rugMap,bumpMap:rugMap,bumpScale:.0007,color:0xdedccf,roughness:1});
  box(4.68,.012,3.05,rugMat,0,.007,2.14,room);
  // Left daylight opening; plain glazed courtyard view and narrow bronze-grey sash.
  const windowGroup=new T.Group();windowGroup.name='Left daylight window';windowGroup.position.set(-2.84,0,.30);room.add(windowGroup);
  box(.16,.59,2.02,plaster,0,.295,0,windowGroup);box(.20,.033,2.13,skirting,.020,.608,0,windowGroup);
  box(.16,.52,2.02,plaster,0,2.745,0,windowGroup);
  for(const z of [-1.05,1.05])box(.17,2.06,.16,plaster,0,1.585,z,windowGroup);
  const sash=new T.MeshStandardMaterial({color:0x746b5a,metalness:.26,roughness:.44});
  for(const z of [-.89,.89])box(.055,1.88,.048,sash,.024,1.59,z,windowGroup);
  for(const y of [.661,1.57,2.52])box(.055,.042,1.82,sash,.024,y,0,windowGroup);
  const daylight=tex(256,512,(c,w,h)=>{let g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#d8e2e3');g.addColorStop(.46,'#b8c9cc');g.addColorStop(1,'#788b82');c.fillStyle=g;c.fillRect(0,0,w,h);c.fillStyle='rgba(116,132,129,.18)';for(let i=0;i<14;i++)c.fillRect(8+(i%4)*65,40+Math.floor(i/4)*85,30,45);});
  let glass=new T.Mesh(new T.PlaneGeometry(1.82,1.83),new T.MeshBasicMaterial({map:daylight,color:0xf1f8f7,transparent:true,opacity:.72,depthWrite:false}));glass.rotation.y=Math.PI/2;glass.position.set(-.025,1.59,0);windowGroup.add(glass);
  // Courtyard safety rail is behind the glazing, as in IMG_9195.
  for(let z=-.81;z<.85;z+=.145)box(.01,.64,.010,black,-.035,.965,z,windowGroup);box(.011,.014,1.78,black,-.035,1.278,0,windowGroup);
  // Shared static surfaces are combined by material to keep the room responsive offline.
  room.updateMatrixWorld(true);
  const groups=new Map();room.traverse(o=>{if(!o.isMesh||Array.isArray(o.material)||o.material.transparent)return;const k=o.material.uuid;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o);});
  for(const meshes of groups.values()){
    if(meshes.length<2)continue;let pa=[],na=[],ua=[];
    for(const mesh of meshes){const g=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);pa.push(...g.attributes.position.array);na.push(...g.attributes.normal.array);ua.push(...g.attributes.uv.array);g.dispose();}
    let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pa,3));g.setAttribute('normal',new T.Float32BufferAttribute(na,3));g.setAttribute('uv',new T.Float32BufferAttribute(ua,2));g.computeBoundingSphere();
    let merged=new T.Mesh(g,meshes[0].material);merged.castShadow=true;merged.receiveShadow=true;merged.name='Room static '+meshes[0].material.uuid.slice(0,6);for(const mesh of meshes)mesh.parent.remove(mesh);room.add(merged);
  }
  return {room,positions:{prePSU:[-.80,.435,-.53],preamp:[-.267,.435,-.53],dac:[.267,.435,-.53],dacPSU:[.80,.435,-.53],amps:[-1.30,0,-.45],ampR:[1.30,0,-.45],speakers:[-1.88,0,-.18],speakerR:[1.88,0,-.18]},photographicEstimates:{alcoveWidth:4.5,artwork:[4.2,2.42],cabinet:[2.13,.408,.44]}};
}
