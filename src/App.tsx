import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useEffect } from 'react'
import * as THREE from 'three'
import { dispatchDemoSurface } from '@/a2ui/demoSurface'
import { Backdrop } from '@/scene/Backdrop'
import { Blob } from '@/scene/Blob'
import { useStore } from '@/store'
import { Controls } from '@/ui/Controls'
import { ConversationSidebar } from '@/ui/ConversationSidebar'
import { ResultGallery } from '@/ui/ResultGallery'
import { SurfacePanel } from '@/ui/SurfacePanel'
import { Transcript } from '@/ui/Transcript'

export default function App() {
  const lite = useStore((s) => s.lite)
  const toggleLite = useStore((s) => s.toggleLite)
  const registerSurface = useStore((s) => s.registerSurface)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'l' || e.key === 'L') {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        toggleLite()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleLite])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requested = params.get('demoSurface')
    if (requested !== null) {
      // ?demoSurface — accepts 'basic' (default), 'music', 'gallery', 'mood'.
      const preset = (
        ['basic', 'music', 'gallery', 'mood'].includes(requested) ? requested : 'basic'
      ) as 'basic' | 'music' | 'gallery' | 'mood'
      const id = dispatchDemoSurface(preset)
      registerSurface(id)
    }
  }, [registerSurface])

  return (
    <>
      <Canvas
        dpr={lite ? 1 : [1, 2]}
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        gl={{ antialias: !lite, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <color attach="background" args={['#06070a']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.6} />

        <Backdrop />
        <Blob />

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          rotateSpeed={0.6}
          autoRotate={!lite}
          autoRotateSpeed={0.4}
        />

        {!lite && (
          <EffectComposer>
            <Bloom mipmapBlur intensity={0.65} luminanceThreshold={0.5} luminanceSmoothing={0.3} />
            <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={[0.0008, 0.0008]} />
          </EffectComposer>
        )}
      </Canvas>
      <Transcript />
      <ConversationSidebar />
      <ResultGallery />
      <SurfacePanel />
      <Controls />
    </>
  )
}
