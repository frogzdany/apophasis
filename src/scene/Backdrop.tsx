import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { PHASE_PARAMS, useStore } from '@/store'

// Fullscreen neon-arc backdrop. Vertex shader writes directly to NDC so the
// plane fills the viewport regardless of camera transform; depthTest off so
// the blob (and post-fx) always render on top.
const NeonMaterial = shaderMaterial(
  {
    time: 0,
    resolution: new THREE.Vector2(),
    pointer: new THREE.Vector2(),
    intensity: 0.2,
  },
  /* glsl */ `
    void main() {
      gl_Position = vec4(position.xy * 2.0, 1.0, 1.0);
    }
  `,
  /* glsl */ `
    uniform float time;
    uniform vec2 resolution;
    uniform vec2 pointer;
    uniform float intensity;

    vec3 palette(float t) {
      vec3 a = vec3(0.5);
      vec3 b = vec3(0.5);
      vec3 c = vec3(1.0);
      vec3 d = vec3(0.263, 0.416, 0.557);
      return a + b * cos(6.28318 * (c * t + d));
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / resolution.y;
      vec2 uv0 = uv;
      vec3 finalColor = vec3(0.0);

      uv = fract(uv * 1.5) - 0.5;
      uv = sin(uv * 0.5) - pointer * 0.6;

      float d = length(uv) * exp(-length(uv0));
      vec3 col = palette(length(uv0) + time * 0.3);

      float ringPhase = time * 0.9 + sin(time * 0.27) * 1.6;
      d = sin(d * 8.0 + ringPhase) / 8.0;
      d = abs(d);
      d = pow(0.012 / d, 1.35);
      finalColor += col * d;

      finalColor = finalColor / (finalColor + 1.0);
      finalColor *= intensity;
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
)

extend({ NeonMaterial })

interface NeonMaterialImpl extends THREE.ShaderMaterial {
  time: number
  pointer: THREE.Vector2
  intensity: number
}

export function Backdrop() {
  const matRef = useRef<NeonMaterialImpl | null>(null)
  const { size, viewport } = useThree()
  const phase = useStore((s) => s.phase)
  const lite = useStore((s) => s.lite)
  const targetIntensity = PHASE_PARAMS[phase].streakIntensity * 0.95

  useFrame((state, dt) => {
    if (lite) return
    const m = matRef.current
    if (!m) return
    m.time += dt

    const followPointer = Math.min(1, dt * 9)
    m.pointer.x += (state.pointer.x - m.pointer.x) * followPointer
    m.pointer.y += (state.pointer.y - m.pointer.y) * followPointer

    const followIntensity = Math.min(1, dt * 3)
    m.intensity += (targetIntensity - m.intensity) * followIntensity
  })

  if (lite) return null

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      {/* @ts-expect-error neonMaterial is added via extend() at module load */}
      <neonMaterial
        ref={matRef}
        key={NeonMaterial.key}
        resolution={[size.width * viewport.dpr, size.height * viewport.dpr]}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}
