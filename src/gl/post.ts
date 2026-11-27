// The lens: ambient occlusion, bloom, a colour grade and a vignette over the HDR picture, then tone mapping.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const GRADE = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // A little colour fringing toward the corners, as a real lens has.
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * r2 * 0.007 * amount).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * r2 * 0.007 * amount).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.0 + 0.2 * amount);
      // Cool shadows, warm highlights.
      col += vec3(-0.010, 0.003, 0.018) * (1.0 - smoothstep(0.0, 0.3, l)) * amount;
      col *= mix(vec3(1.0), vec3(1.07, 1.0, 0.9), smoothstep(0.3, 1.6, l) * amount);
      col *= 1.0 - smoothstep(0.12, 0.62, r2) * 0.5 * amount;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export interface Post {
  render(dt: number): void;
  setSize(w: number, h: number): void;
  ao: GTAOPass; bloom: UnrealBloomPass; grade: ShaderPass;
}

export function buildPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Post {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));

  const ao = new GTAOPass(scene, camera, size.x, size.y);
  ao.updateGtaoMaterial({ radius: 30, distanceExponent: 1.4, thickness: 1.6, scale: 1.25, samples: 16, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  ao.blendIntensity = 0.95;
  // Things made of light or of holes (the sky, the fence, sparks) must not darken what is behind them.
  const pass = ao as unknown as { _overrideVisibility(): void; _restoreVisibility(): void };
  const hide = pass._overrideVisibility.bind(ao), show = pass._restoreVisibility.bind(ao);
  const hidden: THREE.Object3D[] = [];
  pass._overrideVisibility = () => { hide(); scene.traverse((o) => { if (o.userData.noAO && o.visible) { o.visible = false; hidden.push(o); } }); };
  pass._restoreVisibility = () => { show(); for (const o of hidden) o.visible = true; hidden.length = 0; };
  composer.addPass(ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.36, 0.85, 1.25);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  return {
    ao, bloom, grade,
    render: (dt) => composer.render(dt),
    setSize: (w, h) => composer.setSize(w, h),
  };
}
