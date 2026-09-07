/* W13 SE+ exterior, revision 2. Metres. Brochure pp35–37 + owner IMG_9193–95.
   Envelope is published; all small dimensions are photo-derived estimates.
   No proprietary internal assembly is implied by this exterior reconstruction. */
function buildW13Model(T,H){
 const {box,roundBox,cyl,frontCyl,ring,tex,textPlane,M}=H;
 const root=new T.Group();root.name='W13 SE+ — photo reconstruction';
 let n=73461;const random=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};
 function timber(seed,side=false,red=false){n=seed;return tex(768,1536,(c,w,h)=>{
  const im=c.createImageData(w,h),phase=random()*6;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const xx=x/w,yy=y/h;let q=x+(side?20:7)*Math.sin(yy*6+phase)+4*Math.sin(yy*16+phase);
   if(side){const dx=(xx-.59)*1.3,dy=(yy-.62)*.55;q+=32*Math.exp(-dx*dx*19)*Math.sin(dy*7);}
   const broad=Math.sin(q*.039+2*Math.sin(q*.008))*3.2;
   const fine=Math.sin(q*.51+Math.sin(y*.013))*.9+Math.sin(q*1.71)*.7;
   const pore=Math.pow(Math.max(0,Math.sin(q*.87+Math.sin(y*.007)*.2)),16)*-3;
   const grain=broad*2.1+fine*1.5+pore*1.6+(random()-.5)*3.2,ii=(y*w+x)*4;
   im.data[ii]=(red?163:210)+grain*(red?2:1);im.data[ii+1]=(red?120:197)+grain*(red?1.4:1);im.data[ii+2]=(red?88:176)+grain;im.data[ii+3]=255;
  }c.putImageData(im,0,0);
  if(side){for(let i=0;i<11;i++){c.strokeStyle='rgba(112,96,69,'+(.045+i*.002)+')';c.lineWidth=.5+i*.05;c.beginPath();const cx=w*.59,cy=h*.63,rx=8+i*6,ry=17+i*22;for(let j=0;j<=120;j++){const a=j*Math.PI/60,X=cx+Math.cos(a)*rx*(1+.20*Math.sin(a*3)),Y=cy+Math.sin(a)*ry;j?c.lineTo(X,Y):c.moveTo(X,Y);}c.stroke();}}
 });}
 const photoTexture=k=>{const t=new T.TextureLoader().load(W13_MATERIAL_IMAGES[k]);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;};
 const frontMap=photoTexture('front'),sideMap=photoTexture('side'),midMap=photoTexture('mid');
 const wood=new T.MeshStandardMaterial({map:frontMap,bumpMap:frontMap,bumpScale:.00013,roughness:.56,color:0xffffff});
 const throat=wood.clone();throat.color.set(0xd5a86c);
 const sideWood=wood.clone();sideWood.map=sideWood.bumpMap=sideMap;
 const coneWood=new T.MeshStandardMaterial({map:midMap,roughness:.70,side:T.DoubleSide});
 const plugWood=new T.MeshStandardMaterial({map:photoTexture('plug'),roughness:.74,side:T.DoubleSide});
 const black=new T.MeshStandardMaterial({color:0x0b0d0e,roughness:.72});
 const satin=new T.MeshStandardMaterial({color:0xc5c9ca,metalness:.30,roughness:.48});
 const gloss=new T.MeshPhysicalMaterial({color:0x171b1e,roughness:.15,metalness:.1,clearcoat:.7,clearcoatRoughness:.10,side:T.DoubleSide});
 const surround=new T.MeshStandardMaterial({color:0x11151a,roughness:.65,side:T.DoubleSide});
 const silver=new T.MeshStandardMaterial({color:0xc3c9c9,metalness:.77,roughness:.23});
 const paper=new T.MeshStandardMaterial({color:0xc9ced0,roughness:.60,side:T.DoubleSide});
 function group(name,parent=root){const g=new T.Group();g.name=name;parent.add(g);return g;}
 function lathe(profile,mat,parent,x,y,z){const geo=new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),96);const pos=geo.attributes.position,uv=geo.attributes.uv;let r=Math.max(...profile.map(p=>p[0]));for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/(2*r)+.5,pos.getZ(i)/(2*r)+.5);geo.rotateX(-Math.PI/2);const surface=mat.clone();surface.side=T.DoubleSide;const m=new T.Mesh(geo,surface);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
 function screw(x,y,z,parent,r=.0017){frontCyl(r,.001,black,x,y,z,parent);box(r*.95,r*.18,.0002,M.edge,x,y,z+.0006,parent);}
 // Large roundovers follow the side silhouette, not a pill-shaped front baffle.
 const w=.18,h=1.05,d=.39,bottom=.009,r=.024,s=new T.Shape();
 s.moveTo(-d/2+r,bottom);s.lineTo(d/2-r,bottom);s.quadraticCurveTo(d/2,bottom,d/2,bottom+r);s.lineTo(d/2,bottom+h-r);s.quadraticCurveTo(d/2,bottom+h,d/2-r,bottom+h);s.lineTo(-d/2+r,bottom+h);s.quadraticCurveTo(-d/2,bottom+h,-d/2,bottom+h-r);s.lineTo(-d/2,bottom+r);s.quadraticCurveTo(-d/2,bottom,-d/2+r,bottom);
 const geo=new T.ExtrudeGeometry(s,{depth:w,bevelEnabled:false,curveSegments:24});geo.translate(0,0,-w/2);geo.rotateY(Math.PI/2);
 const pos=geo.attributes.position,norm=geo.attributes.normal,uv=geo.attributes.uv;for(let i=0;i<pos.count;i++){const nx=Math.abs(norm.getX(i)),ny=Math.abs(norm.getY(i));uv.setXY(i,nx>.7?pos.getZ(i)/d+.5:pos.getX(i)/w+.5,ny>.7?pos.getZ(i)/d+.5:(pos.getY(i)-bottom)/h);}
 // Open the actual front recesses and both side-driver apertures in the wood shell.
 const shellGroup=group('cabinet');const triP=[],triN=[],triUV=[];
 for(const part of geo.groups){if(part.materialIndex===0)continue;
  for(let i=part.start;i<part.start+part.count;i+=3){let frontFace=true;for(let j=0;j<3;j++)if(norm.getZ(i+j)<.999||pos.getZ(i+j)<.1949)frontFace=false;if(frontFace)continue;
   for(let j=0;j<3;j++){const q=i+j;triP.push(pos.getX(q),pos.getY(q),pos.getZ(q));triN.push(norm.getX(q),norm.getY(q),norm.getZ(q));triUV.push(uv.getX(q),uv.getY(q));}
  }
 }
 const edges=new T.BufferGeometry();edges.setAttribute('position',new T.Float32BufferAttribute(triP,3));edges.setAttribute('normal',new T.Float32BufferAttribute(triN,3));edges.setAttribute('uv',new T.Float32BufferAttribute(triUV,2));
 const shellEdges=new T.Mesh(edges,wood);shellEdges.castShadow=shellEdges.receiveShadow=true;shellGroup.add(shellEdges);
 const wy=.881,my=.743;
 function circleHole(shape,x,y,r){const cut=new T.Path();cut.absarc(x,y,r,0,Math.PI*2,true);shape.holes.push(cut);}
 for(const side of [-1,1]){const face=s.clone();circleHole(face,0,.435,.154);const g=new T.ShapeGeometry(face,96);g.rotateY(side*Math.PI/2);g.translate(side*.09,0,0);let pp=g.attributes.position,uu=g.attributes.uv;for(let i=0;i<pp.count;i++)uu.setXY(i,pp.getZ(i)/d+.5,(pp.getY(i)-bottom)/h);const m=new T.Mesh(g,sideWood);m.castShadow=m.receiveShadow=true;shellGroup.add(m);}
 const frontFace=new T.Shape();frontFace.moveTo(-.09,bottom+r);frontFace.lineTo(.09,bottom+r);frontFace.lineTo(.09,bottom+h-r);frontFace.lineTo(-.09,bottom+h-r);frontFace.closePath();circleHole(frontFace,0,wy,.053);circleHole(frontFace,0,my,.068);
 const fg=new T.ShapeGeometry(frontFace,96);const fp=fg.attributes.position,fu=fg.attributes.uv;for(let i=0;i<fp.count;i++)fu.setXY(i,fp.getX(i)/w+.5,(fp.getY(i)-bottom)/h);fg.translate(0,0,.195);const fm=new T.Mesh(fg,wood);fm.castShadow=fm.receiveShadow=true;shellGroup.add(fm);
 // One joined figure-eight plate with two apertures, not overlapping solid discs.
 const outline=[];const rad=.094,mid=(wy+my)/2;
 for(const yy of [wy,my])for(let i=0;i<192;i++){const a=i/192*Math.PI*2,x=Math.cos(a)*rad,y=yy+Math.sin(a)*rad,other=yy===wy?my:wy;if(x*x+(y-other)**2<rad*rad-1e-7)continue;outline.push([Math.max(-.09,Math.min(.09,x)),y]);}
 outline.sort((a,b)=>Math.atan2(a[1]-mid,a[0])-Math.atan2(b[1]-mid,b[0]));const plateShape=new T.Shape();outline.forEach(([x,y],i)=>i?plateShape.lineTo(x,y):plateShape.moveTo(x,y));plateShape.closePath();circleHole(plateShape,0,wy,.053);circleHole(plateShape,0,my,.068);
 const plateMesh=new T.Mesh(new T.ExtrudeGeometry(plateShape,{depth:.0016,bevelEnabled:true,bevelThickness:.00015,bevelSize:.00015,bevelSegments:1,curveSegments:64}),black);plateMesh.position.z=.1953;plateMesh.castShadow=plateMesh.receiveShadow=true;root.add(plateMesh);
 const wg=group('3 inch widebander');wg.position.set(0,wy,.196);
 lathe([[.053,-.001],[.052,.002],[.049,.006],[.044,.010],[.041,.013]],throat,wg,0,0,0);
 lathe([[.043,0],[.040,0],[.040,.010],[.039,.012],[.029,.012]],black,wg,0,0,.001);
 lathe([[.034,0],[.032,-.001],[.030,-.003],[.028,-.003],[.026,0]],surround,wg,0,0,.005);
 lathe([[.027,0],[.024,.002],[.015,.008],[.011,.010],[0,.010]],paper,wg,0,0,.006);
 const dome=new T.Mesh(new T.SphereGeometry(.010,48,24),silver);dome.scale.z=.36;dome.position.set(0,0,.0008);wg.add(dome);ring(.0104,.0007,black,0,0,.0012,wg);
 for(let i=0;i<4;i++){const a=Math.PI*.25+i*Math.PI/2;screw(Math.cos(a)*.039,Math.sin(a)*.039,.0015,wg,.0012);}
 const mg=group('6 inch wood cone and ash phase plug');mg.position.set(0,my,.197);
 lathe([[.068,0],[.0665,-.001],[.065,-.002],[.063,0]],surround,mg,0,0,0);
 lathe([[.063,0],[.051,.004],[.036,.011],[.024,.017],[.013,.021]],coneWood,mg,0,0,0);
 lathe([[.012,.020],[.0118,.013],[.010,.007],[.007,.004],[0,.004]],plugWood,mg,0,0,0);
 ring(.0125,.001,black,0,0,-.013,mg);
 for(let i=0;i<6;i++){const a=Math.PI/2+i*Math.PI/3;screw(Math.cos(a)*.077,Math.sin(a)*.077,.002,mg);}
 // Opposed 13-inch units: thick rolled rubber surrounds and broad glossy injection-moulded diaphragms.
 for(const side of [-1,1]){const bg=group('13 inch side woofer '+side);bg.position.set(side*.0905,.435,0);bg.rotation.y=side*Math.PI/2;
  const trim=new T.Mesh(new T.RingGeometry(.153,.172,96),black);trim.position.z=.001;bg.add(trim);ring(.156,.0011,silver,0,0,.003,bg);
  lathe([[.155,-.003],[.151,-.003],[.147,-.009],[.141,-.015],[.133,-.019],[.127,-.015],[.123,-.009],[.120,-.004]],surround,bg,0,0,.002);
  lathe([[.120,0],[.116,.004],[.108,.009],[.095,.013],[.075,.016],[.040,.018],[0,.017]],gloss,bg,0,0,.003);
  frontCyl(.013,.0006,black,0,0,-.0148,bg);

 }
 // Small vertical edge badges seen in the owner's front photograph.
 for(const x of [-.087,.087])box(.006,.143,.0015,black,x,.425,.196,root);
 const badge=textPlane('BOENICKE',.031,.0034,.087,.425,.1972,root,{color:'#dbddda',weight:'600'});badge.rotation.z=Math.PI/2;
 // Rear module. Its visible connector/heat sink envelope is modelled; no circuit is invented.
 const rear=group('rear electronics');rear.rotation.y=Math.PI;
 frontCyl(.029,.003,black,0,.959,.195,rear);ring(.019,.0015,surround,0,.959,.198,rear);frontCyl(.012,.002,black,0,.959,.198,rear);
 const td=new T.Mesh(new T.SphereGeometry(.009,32,16),surround);td.scale.z=.5;td.position.set(0,.959,.199);rear.add(td);
 roundBox(.119,.400,.004,.004,black,0,.334,.197,rear);
 for(const x of [-.054,.054])for(const y of [.143,.525])screw(x,y,.201,rear,.0022);
 // Vertical fins are interrupted by a shallow centre brace, as in the photograph.
 for(let i=0;i<11;i++){const x=-.046+i*.0092;box(.0035,.201,.013,black,x,.310,.204,rear);}
 box(.098,.005,.016,black,0,.312,.205,rear);
 const controlMap=tex(768,512,(c,W,Hh)=>{c.fillStyle='#171b1c';c.fillRect(0,0,W,Hh);c.fillStyle='#9d9e92';c.font='24px Arial';c.textAlign='left';['LIMIT','SIGNAL','READY'].forEach((t,i)=>c.fillText(t,46,126+i*55));['PRESET 1','PRESET 2','PRESET 3','PRESET 4'].forEach((t,i)=>c.fillText(t,514,126+i*46));c.textAlign='center';c.font='19px Arial';c.fillText('LEVEL',370,54);for(let i=0;i<13;i++){const a=Math.PI*(.80+i*.116);c.strokeStyle='#a2a69f';c.beginPath();c.moveTo(364+Math.cos(a)*77,155+Math.sin(a)*77);c.lineTo(364+Math.cos(a)*90,155+Math.sin(a)*90);c.stroke();}c.font='22px Arial';c.fillText('ANALOG IN',206,430);c.fillText('CONTROL',590,430);});
 const panel=new T.Mesh(new T.PlaneGeometry(.104,.082),new T.MeshStandardMaterial({map:controlMap,roughness:.72}));panel.position.set(0,.474,.200);rear.add(panel);
 frontCyl(.010,.010,black,0,.490,.205,rear);box(.0012,.006,.0007,silver,-.003,.492,.211,rear);
 for(const p of [[-.044,.481],[.047,.480]])frontCyl(.0014,.0006,new T.MeshBasicMaterial({color:0x8dcc4f}),p[0],p[1],.201,rear);
 frontCyl(.0105,.005,satin,-.021,.449,.204,rear);frontCyl(.008,.005,black,-.021,.449,.207,rear);for(const p of [[-.003,-.002],[.003,-.002],[0,.003]])frontCyl(.0007,.001,M.edge,-.021+p[0],.449+p[1],.210,rear);
 frontCyl(.0075,.004,black,.030,.449,.203,rear);
 box(.034,.022,.006,black,.018,.157,.204,rear);for(const x of [-.008,0,.008])box(.002,.003,.004,silver,.018+x,.159,.208,rear);
 box(.014,.022,.005,black,-.034,.158,.204,rear);box(.011,.014,.001,M.black,-.034,.158,.208,rear);
 const warning=textPlane('CAUTION  •  MAINS',.068,.007,0,.185,.213,rear,{bg:'#b9bcb0',color:'#282d29'});
 roundBox(.113,.065,.002,.001,satin,0,.091,.198,rear);textPlane('W13',.019,.007,0,.108,.200,rear,{color:'#303636'});
 for(const x of [-.050,.050])for(const y of [.062,.119])screw(x,y,.200,rear,.0018);
 for(const side of [-1,1]){frontCyl(.008,.002,side===1?M.red:black,side*.033,.093,.202,rear);frontCyl(.006,.014,silver,side*.033,.093,.210,rear);frontCyl(.009,.014,black,side*.033,.093,.223,rear);for(let i=0;i<16;i++){const a=i*Math.PI/8;box(.001,.010,.013,satin,side*.033+Math.cos(a)*.008,.093+Math.sin(a)*.008,.223,rear);}ring(.007,.0006,silver,side*.033,.093,.231,rear);textPlane(side===1?'+':'−',.006,.006,side*.033,.076,.200,rear);}
 // Silver SwingBase: support towers are BEHIND the rear plane; a tongue enters the low rear slot.
 const base=group('SwingBase — rear inserted support');base.userData.noBatch=true;const bz=-.241;const fixedTowers=group('fixed-towers',base);
 for(const x of [-.138,.138]){
  cyl(.030,.004,satin,x,.002,bz,fixedTowers,.030,80);
  cyl(.0195,.006,satin,x,.007,bz,fixedTowers,.0195,80);
  cyl(.0195,.061,satin,x,.0795,bz,fixedTowers,.0195,80);
  // Open horizontal slots leave clearance around the suspended beam.
  for(const angle of [-.8,Math.PI-.8]){const m=new T.Mesh(new T.CylinderGeometry(.0195,.0195,.039,40,1,true,angle,1.6),satin);m.position.set(x,.0295,bz);m.castShadow=m.receiveShadow=true;fixedTowers.add(m);}
  cyl(.0027,.0004,black,x,.1102,bz,fixedTowers,.0027,32);
  const bevel=ring(.0030,.00045,silver,x,.1105,bz,fixedTowers);bevel.rotation.x=-Math.PI/2;
 }
 roundBox(.278,.033,.022,.001,satin,0,.030,bz,base);
 for(const x of [-.063,0,.063]){frontCyl(.0026,.0008,black,x,.030,bz-.0118,base);ring(.0028,.00035,satin,x,.030,bz-.0123,base);}
 // Tongue continues a short way past the visible rear surface. Insertion depth is not measured.
 box(.086,.014,.003,black,0,.036,-.196,base);
 roundBox(.082,.011,.070,.001,satin,0,.036,-.217,base);
 const schematic=group('swing-suspension-schematic',base);schematic.visible=false;for(const x of [-.138,.138]){cyl(.0006,.066,new T.MeshBasicMaterial({color:0x416c5c}),x,.069,bz,schematic,.0006,12);cyl(.004,.002,satin,x,.101,bz,schematic);cyl(.004,.003,satin,x,.036,bz,schematic);}
 const bearing=new T.Mesh(new T.SphereGeometry(.0045,24,16),silver);bearing.position.set(0,.0045,.165);bearing.name='front support — schematically located';base.add(bearing);
 root.userData.envelope={height:1.05,width:.18,depth:.39};root.userData.photoReconstruction=true;
 return root;
}
