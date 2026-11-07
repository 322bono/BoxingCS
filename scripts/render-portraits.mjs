import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const manifest = JSON.parse(
  await readFile("public/characters/models/manifest.json", "utf8"),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 384, height: 384 },
    deviceScaleFactor: 1,
  });
  if (process.env.PORTRAIT_SOURCE === "unrigged" || process.env.PORTRAIT_STAGE)
    await page.route("**/characters/models/*.glb", async (r) => {
      const id = r
        .request()
        .url()
        .split("/")
        .at(-1)
        .replace(/(?:-hd)?\.glb$/, "");
      await r.fulfill({
        body: await readFile(
          process.env.PORTRAIT_STAGE
            ? `.asset-jobs/upgrade/${id}/${process.env.PORTRAIT_STAGE}/${process.env.PORTRAIT_STAGE === "rig" ? "rigged_character.glb" : process.env.PORTRAIT_STAGE === "animation" ? "animation_glb.glb" : "model.glb"}`
            : ".asset-jobs/" + id + "/source/model.glb",
        ),
        contentType: "model/gltf-binary",
      });
    });
  await page.goto("http://127.0.0.1:3000/api/health");
  await page.setContent(`<html><head><style>html,body{margin:0;width:100%;height:100%;background:#141c2d}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script></head><body><script type="module">import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(384,384);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;document.body.append(renderer.domElement);const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.01,20);scene.background=new THREE.Color('#202b43');scene.add(new THREE.HemisphereLight('#ffffff','#767181',3));const key=new THREE.DirectionalLight('#fff4e6',3);key.position.set(2,3,4);scene.add(key);const rim=new THREE.DirectionalLight('#a7c5ff',2);rim.position.set(-2,2,-2);scene.add(rim);let previous=null;
window.portrait=async(id,path)=>{if(previous)scene.remove(previous);const asset=await new GLTFLoader().loadAsync(path||'/characters/models/'+id+'.glb'),root=asset.scene;scene.add(root);root.traverse(o=>{if(o.isMesh){if(!o.geometry.getAttribute('normal'))o.geometry.computeVertexNormals();const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){m.side=THREE.DoubleSide;m.flatShading=false;m.roughness=1;m.metalness=0;}}});root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());root.scale.multiplyScalar(2.1/size.y);root.updateMatrixWorld(true);const head=root.getObjectByName('Head'),bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3()),point=head?head.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(center.x,bounds.max.y-.32,center.z);camera.position.set(point.x+.04,point.y+.15,point.z+1.0);camera.lookAt(point.x,point.y+.14,point.z);renderer.render(scene,camera);previous=root;};window.ready=true;</script></body></html>`);
  await page.waitForFunction(() => window.ready === true);
  for (const id of (process.env.PORTRAIT_IDS || "nova,blaze,specs,volt").split(
    ",",
  )) {
    await page.evaluate(({ id, path }) => window.portrait(id, path), {
      id,
      path: manifest.characters[id]?.model,
    });
    await page.locator("canvas").screenshot({
      path: process.env.PORTRAIT_OUTPUT_DIR
        ? `${process.env.PORTRAIT_OUTPUT_DIR}/${id}-portrait.png`
        : process.env.PORTRAIT_STAGE
          ? `.asset-jobs/upgrade/${id}/${process.env.PORTRAIT_STAGE}-portrait.png`
          : process.env.PORTRAIT_SOURCE === "unrigged"
            ? `.asset-jobs/${id}/unrigged-portrait.png`
            : `public${manifest.characters[id]?.portrait || `/characters/models/${id}-portrait.png`}`,
    });
    console.log("Rendered portrait", id);
  }
} finally {
  await browser.close();
}
