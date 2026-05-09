import { animated, useSpring } from '@react-spring/three'
import { Float } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import * as THREE from 'three'
import { PHASE_PARAMS, useStore } from '@/store'
import { createLucyMaterial } from './shaders/lucy'

export function Blob() {
  const meshRef = useRef<Mesh>(null)
  const phase = useStore((s) => s.phase)
  const lite = useStore((s) => s.lite)
  // Pull just the top result's image so the blob morphs into whatever Lucy
  // most recently surfaced. Subscribing to the array ref + indexing keeps
  // the selector stable.
  const topImageUrl = useStore((s) => s.lastSearchResults?.[0]?.imageUrl ?? null)
  const material = useMemo(() => createLucyMaterial(), [])
  const smoothedMicRef = useRef(0)
  const textureRef = useRef<THREE.Texture | null>(null)

  // Whether the morph is engaged: phase=result + we have an image.
  const morphActive = phase === 'result' && !!topImageUrl

  // Load the result texture lazily. Anonymous CORS so iTunes / YouTube /
  // Google CDNs can be sampled in WebGL. Disposes the previous texture
  // when the URL changes or the component unmounts.
  useEffect(() => {
    if (!topImageUrl) {
      textureRef.current?.dispose()
      textureRef.current = null
      material.uniforms.uTexture.value = null
      material.uniforms.uHasTexture.value = 0
      return
    }
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    let cancelled = false
    loader.load(
      topImageUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        textureRef.current?.dispose()
        textureRef.current = tex
        material.uniforms.uTexture.value = tex
        material.uniforms.uHasTexture.value = 1
      },
      undefined,
      (err) => {
        console.warn('[blob] texture load failed', topImageUrl, err)
      },
    )
    return () => {
      cancelled = true
    }
  }, [topImageUrl, material])

  useEffect(() => {
    return () => {
      textureRef.current?.dispose()
    }
  }, [])

  const target = PHASE_PARAMS[phase]
  const spring = useSpring({
    noiseAmp: target.noiseAmp,
    noiseFreq: target.noiseFreq,
    noiseSpeed: target.noiseSpeed,
    stretch: target.stretch,
    iridescence: target.iridescence,
    textureBlend: morphActive ? 1 : 0,
    config: { mass: 1.2, tension: 120, friction: 28 },
  })

  useFrame((state, dt) => {
    if (lite) return
    const u = material.uniforms
    const micLevel = useStore.getState().micLevel
    const k = Math.min(1, dt * 8)
    smoothedMicRef.current += (micLevel - smoothedMicRef.current) * k
    const boost = phase === 'listening' ? Math.min(0.18, smoothedMicRef.current * 0.8) : 0

    u.uTime.value = state.clock.elapsedTime
    u.uNoiseAmp.value = spring.noiseAmp.get() + boost
    u.uNoiseFreq.value = spring.noiseFreq.get()
    u.uNoiseSpeed.value = spring.noiseSpeed.get()
    u.uStretch.value = spring.stretch.get()
    u.uIridescence.value = spring.iridescence.get()
    u.uTextureBlend.value = spring.textureBlend.get()
  })

  if (lite) {
    return (
      <mesh>
        <icosahedronGeometry args={[1, 4]} />
        <meshBasicMaterial color="#3a4760" wireframe />
      </mesh>
    )
  }

  return (
    <Float
      // While morphing into a result, calm the float so the image stays
      // legible. Standard intensity during normal phases.
      speed={morphActive ? 0.6 : 1.4}
      rotationIntensity={morphActive ? 0.1 : 0.4}
      floatIntensity={morphActive ? 0.3 : 0.8}
    >
      <animated.mesh ref={meshRef} material={material} castShadow>
        <icosahedronGeometry args={[1, 64]} />
      </animated.mesh>
    </Float>
  )
}
