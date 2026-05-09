import { HelpCircle, Menu, X } from 'lucide-react'
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { dispatchDemoSurface } from '@/a2ui/demoSurface'
import { OnboardingOverlay, useOnboarding } from '@/onboarding'
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
  const { running, startTour, finishTour } = useOnboarding()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
      {/* Invisible anchor for the onboarding tour to spotlight the blob */}
      {/* Onboarding anchor — sized/positioned to frame the blob, not full-screen */}
      <div
        data-tour="blob"
        className="pointer-events-none fixed left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
        style={{ width: 420, height: 420 }}
        aria-hidden="true"
      />
      <Transcript />

      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen((v) => !v)}
        className="pointer-events-auto fixed top-4 left-4 z-30 flex items-center justify-center rounded-full border border-white/10 bg-background/55 p-2 text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground md:hidden"
        title="Toggle sidebar"
      >
        {sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {/* Sidebar: hidden on mobile unless toggled */}
      <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block`}>
        <ConversationSidebar forceShow={sidebarOpen} />
      </div>

      <ResultGallery />
      <SurfacePanel />
      <Controls />

      {/* Onboarding tour — self-contained overlay */}
      <button
        type="button"
        onClick={startTour}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-1.5 rounded-full border border-white/10 bg-background/55 px-3 py-2 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground md:bottom-7 md:right-6"
        title="Tutorial"
      >
        <HelpCircle className="size-3.5" />
        Tutorial
      </button>
      <OnboardingOverlay run={running} onDone={finishTour} />
    </>
  )
}
