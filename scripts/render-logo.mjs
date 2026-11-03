// Render the app's actual 2x2 geometry, square-on, into a transparent PNG.
// Run with the Vite dev server available: node scripts/render-logo.mjs [origin]
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const origin=process.argv[2]??'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1024,height:1024}});
 await page.route('**/logo-render.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>html,body{margin:0;background:transparent}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script></head><body><script type="module">
 import * as THREE from 'three';
 import {solvedState,FACES} from '/src/puzzle.js';
 import {bodyGeometry} from '/src/body-geometry.js';
 const scene=new THREE.Scene();
 const extent=Math.SQRT2*1.025;
 const camera=new THREE.OrthographicCamera(-extent,extent,extent,-extent,.1,100);
 camera.position.set(0,-10,0);camera.up.set(1,0,-1).normalize();camera.lookAt(0,0,0);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
 renderer.setSize(1024,1024);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
 const add=(positions,color)=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  scene.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide})));
 };
 add(bodyGeometry(2).stationary,'#080e11');
 const positions=FACES.map(()=>[]);
 for(const sticker of solvedState(2)){
  const points=sticker.vertices.map(v=>new THREE.Vector3(...v));
  const center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/3);
  positions[sticker.color].push(...points.flatMap(p=>p.clone().sub(center).multiplyScalar(.935).add(center).toArray()));
 }
 positions.forEach((vertices,i)=>add(vertices,FACES[i].color));
 renderer.render(scene,camera);window.logoPNG=renderer.domElement.toDataURL('image/png');
 </script></body></html>`}));
 await page.goto(`${origin}/logo-render.html`);
 await page.waitForFunction(()=>window.logoPNG);
 const png=await page.evaluate(()=>window.logoPNG.split(',')[1]);
 await writeFile(new URL('../public/logo.png',import.meta.url),Buffer.from(png,'base64'));
}finally{await browser.close();}
