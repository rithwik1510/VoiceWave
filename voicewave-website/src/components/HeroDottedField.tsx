import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { getHeroDottedPalette, heroDottedDefaultConfig, type HeroDottedTheme } from './heroDottedConfig'
import {
  heroDisplayFragmentShader,
  heroFullscreenVertexShader,
  heroSimulationFragmentShader
} from './heroDottedShaders'

export type HeroSafeZone = {
  centerX: number
  centerY: number
  radius: number
}

type HeroDottedFieldProps = {
  onReady?: () => void
  disableInteraction?: boolean
  theme?: HeroDottedTheme
  safeZone?: HeroSafeZone
  topCutoffPx?: number
}

const MIN_CANVAS_SIZE = 64

export default function HeroDottedField({
  onReady,
  disableInteraction = false,
  theme = 'dark',
  safeZone,
  topCutoffPx = 0
}: HeroDottedFieldProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasMountRef = useRef<HTMLDivElement | null>(null)
  const safeZoneRef = useRef<HeroSafeZone | undefined>(safeZone)
  const topCutoffRef = useRef(topCutoffPx)
  const [hasWebgl, setHasWebgl] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    safeZoneRef.current = safeZone
  }, [safeZone])

  useEffect(() => {
    topCutoffRef.current = topCutoffPx
  }, [topCutoffPx])

  useEffect(() => {
    const rootNode = rootRef.current
    const canvasMount = canvasMountRef.current

    if (!rootNode || !canvasMount) {
      return
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const lowPowerHint = coarsePointer || (navigator.hardwareConcurrency ?? 8) <= 4
    const useLowPower = prefersReducedMotion || lowPowerHint
    const config = heroDottedDefaultConfig
    const palette = getHeroDottedPalette(theme)

    let destroyed = false
    let isVisible = true
    let animationFrameId = 0
    let lastFrameTime = performance.now()
    let simulationAccumulator = 0
    let readyFired = false

    const pointer = new THREE.Vector2(0.5, 0.72)
    const pointerDelta = new THREE.Vector2(0, 0)
    const nextPointer = new THREE.Vector2(0.5, 0.72)
    let pointerActive = 0

    let renderer: THREE.WebGLRenderer | null = null
    let displayScene: THREE.Scene | null = null
    let simulationScene: THREE.Scene | null = null
    let camera: THREE.OrthographicCamera | null = null
    let displayMaterial: THREE.ShaderMaterial | null = null
    let simulationMaterial: THREE.ShaderMaterial | null = null
    let quadGeometry: THREE.PlaneGeometry | null = null
    let readTarget: THREE.WebGLRenderTarget | null = null
    let writeTarget: THREE.WebGLRenderTarget | null = null
    let interactionTarget: HTMLElement | null = null
    let intersectionObserver: IntersectionObserver | null = null
    let resizeObserver: ResizeObserver | null = null

    const resolution = new THREE.Vector2(1, 1)
    const resolutionScale = new THREE.Vector2(1, 1)
    const simStep = 1 / Math.max(24, useLowPower ? config.lowPowerTargetFps : config.targetFps)
    const simScale = useLowPower ? config.lowPowerSimulationScale : config.simulationScale

    const disposeRenderTarget = (target: THREE.WebGLRenderTarget | null) => {
      if (target) {
        target.dispose()
      }
    }

    const getRenderTexture = (target: THREE.WebGLRenderTarget | null): THREE.Texture | null => {
      if (!target) {
        return null
      }
      const typedTarget = target as unknown as { texture?: THREE.Texture }
      return typedTarget.texture ?? null
    }

    const createRenderTarget = (width: number, height: number) =>
      new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      })

    const applyLayoutUniforms = () => {
      if (!displayMaterial) {
        return
      }

      const bounds = canvasMount.getBoundingClientRect()
      const width = Math.max(1, bounds.width)
      const height = Math.max(1, bounds.height)
      const safe = safeZoneRef.current

      const centerX = (safe?.centerX ?? width * 0.5) * resolutionScale.x
      const centerY = (safe?.centerY ?? height * 0.56) * resolutionScale.y
      const radiusBase = safe?.radius ?? Math.max(width * 0.24, height * 0.19)
      const radius = radiusBase * ((resolutionScale.x + resolutionScale.y) * 0.5)
      const cutoff = Math.max(0, topCutoffRef.current) * resolutionScale.y

      displayMaterial.uniforms.uSafeCenterPx.value.set(centerX, centerY)
      displayMaterial.uniforms.uSafeRadiusPx.value = radius
      displayMaterial.uniforms.uSafeFeatherPx.value = 36 * ((resolutionScale.x + resolutionScale.y) * 0.5)
      displayMaterial.uniforms.uTopCutoffPx.value = cutoff
    }

    const updateDrawResolution = () => {
      if (!renderer || !displayMaterial || !simulationMaterial) {
        return
      }

      const bounds = canvasMount.getBoundingClientRect()
      const width = Math.max(MIN_CANVAS_SIZE, Math.round(bounds.width))
      const height = Math.max(MIN_CANVAS_SIZE, Math.round(bounds.height))
      const dprCap = useLowPower ? 1 : 1.5
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
      renderer.setPixelRatio(dpr)
      renderer.setSize(width, height, false)
      renderer.getDrawingBufferSize(resolution)
      resolutionScale.set(resolution.x / width, resolution.y / height)

      displayMaterial.uniforms.uResolution.value.set(resolution.x, resolution.y)

      const simWidth = Math.max(MIN_CANVAS_SIZE, Math.floor(resolution.x * simScale))
      const simHeight = Math.max(MIN_CANVAS_SIZE, Math.floor(resolution.y * simScale))
      disposeRenderTarget(readTarget)
      disposeRenderTarget(writeTarget)
      readTarget = createRenderTarget(simWidth, simHeight)
      writeTarget = createRenderTarget(simWidth, simHeight)

      const seedTexture = getRenderTexture(readTarget)
      simulationMaterial.uniforms.uPrev.value = seedTexture
      displayMaterial.uniforms.uField.value = seedTexture
      applyLayoutUniforms()
    }

    const swapRenderTargets = () => {
      const currentRead = readTarget
      readTarget = writeTarget
      writeTarget = currentRead
    }

    const pointerMoveHandler = (event: PointerEvent) => {
      if (disableInteraction || prefersReducedMotion) {
        return
      }

      const rect = canvasMount.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return
      }

      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      const clampedX = THREE.MathUtils.clamp(x, 0, 1)
      const clampedY = THREE.MathUtils.clamp(y, 0, 1)

      nextPointer.set(clampedX, clampedY)
      pointerDelta.set(nextPointer.x - pointer.x, nextPointer.y - pointer.y)
      pointer.copy(nextPointer)
      pointerActive = 1
    }

    const pointerLeaveHandler = () => {
      pointerActive = 0
      pointerDelta.set(0, 0)
    }

    const setWebglReady = () => {
      if (destroyed || readyFired) {
        return
      }

      readyFired = true
      setHasWebgl(true)
      setIsReady(true)
      onReady?.()
    }

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance',
        premultipliedAlpha: true
      })
      renderer.setClearColor(0x000000, 0)
      renderer.domElement.className = 'hero-dotted-canvas-element'
      canvasMount.appendChild(renderer.domElement)

      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      displayScene = new THREE.Scene()
      simulationScene = new THREE.Scene()
      quadGeometry = new THREE.PlaneGeometry(2, 2)

      simulationMaterial = new THREE.ShaderMaterial({
        vertexShader: heroFullscreenVertexShader,
        fragmentShader: heroSimulationFragmentShader,
        transparent: false,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uPrev: { value: null },
          uPointer: { value: pointer.clone() },
          uPointerDelta: { value: pointerDelta.clone() },
          uPointerActive: { value: 0 },
          uTime: { value: 0 },
          uDt: { value: 0.016 },
          uDecay: { value: config.decay },
          uAmbientStrength: { value: prefersReducedMotion ? config.ambientStrength * 0.2 : config.ambientStrength }
        }
      })

      displayMaterial = new THREE.ShaderMaterial({
        vertexShader: heroFullscreenVertexShader,
        fragmentShader: heroDisplayFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uField: { value: null },
          uResolution: { value: resolution.clone() },
          uPointer: { value: pointer.clone() },
          uPointerActive: { value: 0 },
          uTime: { value: 0 },
          uDotSize: { value: config.dotSize },
          uDotGap: { value: config.dotGap },
          uMaskStrength: { value: config.maskStrength },
          uPointerRadius: { value: config.pointerRadius },
          uPointerStrength: { value: config.pointerStrength },
          uSafeCenterPx: { value: new THREE.Vector2(0, 0) },
          uSafeRadiusPx: { value: 0 },
          uSafeFeatherPx: { value: 36 },
          uTopCutoffPx: { value: 0 },
          uColorPrimary: { value: new THREE.Color(palette.primary[0], palette.primary[1], palette.primary[2]) },
          uColorSecondary: { value: new THREE.Color(palette.secondary[0], palette.secondary[1], palette.secondary[2]) },
          uColorHighlight: { value: new THREE.Color(palette.highlight[0], palette.highlight[1], palette.highlight[2]) }
        }
      })

      const simulationQuad = new THREE.Mesh(quadGeometry, simulationMaterial)
      const displayQuad = new THREE.Mesh(quadGeometry, displayMaterial)
      simulationScene.add(simulationQuad)
      displayScene.add(displayQuad)

      updateDrawResolution()

      const initialWarmupPasses = 10
      for (let index = 0; index < initialWarmupPasses; index += 1) {
        const currentRead = readTarget
        const currentWrite = writeTarget
        if (!renderer || !camera || !simulationScene || !simulationMaterial || !currentWrite || !currentRead) {
          break
        }
        simulationMaterial.uniforms.uPrev.value = getRenderTexture(currentRead)
        simulationMaterial.uniforms.uTime.value = index * simStep
        simulationMaterial.uniforms.uDt.value = simStep
        simulationMaterial.uniforms.uPointerActive.value = 0
        renderer.setRenderTarget(currentWrite)
        renderer.render(simulationScene, camera)
        renderer.setRenderTarget(null)
        swapRenderTargets()
      }

      interactionTarget = rootNode.closest('section') ?? rootNode
      if (!disableInteraction && !prefersReducedMotion) {
        interactionTarget.addEventListener('pointermove', pointerMoveHandler, { passive: true })
        interactionTarget.addEventListener('pointerleave', pointerLeaveHandler)
      }

      if ('IntersectionObserver' in window) {
        intersectionObserver = new IntersectionObserver(
          (entries) => {
            const [entry] = entries
            isVisible = entry?.isIntersecting ?? true
          },
          { threshold: 0.05 }
        )
        intersectionObserver.observe(rootNode)
      }

      resizeObserver = new ResizeObserver(() => {
        updateDrawResolution()
      })
      resizeObserver.observe(canvasMount)

      const animate = (timestampMs: number) => {
        if (destroyed) {
          return
        }

        animationFrameId = window.requestAnimationFrame(animate)

        if (!renderer || !camera || !displayScene || !simulationScene || !displayMaterial || !simulationMaterial) {
          return
        }
        if (!readTarget || !writeTarget) {
          return
        }
        if (!isVisible) {
          lastFrameTime = timestampMs
          return
        }

        const deltaSeconds = Math.min((timestampMs - lastFrameTime) / 1000, 0.05)
        lastFrameTime = timestampMs
        if (deltaSeconds <= 0) {
          return
        }

        pointerActive = Math.max(0, pointerActive - deltaSeconds * 1.2)
        pointerDelta.multiplyScalar(0.86)
        simulationAccumulator += deltaSeconds

        while (simulationAccumulator >= simStep) {
          const currentRead = readTarget
          const currentWrite = writeTarget
          if (!currentRead || !currentWrite) {
            break
          }

          simulationMaterial.uniforms.uPrev.value = getRenderTexture(currentRead)
          simulationMaterial.uniforms.uPointer.value.copy(pointer)
          simulationMaterial.uniforms.uPointerDelta.value.copy(pointerDelta)
          simulationMaterial.uniforms.uPointerActive.value = disableInteraction || prefersReducedMotion ? 0 : pointerActive
          simulationMaterial.uniforms.uTime.value = timestampMs * 0.001
          simulationMaterial.uniforms.uDt.value = simStep

          renderer.setRenderTarget(currentWrite)
          renderer.render(simulationScene, camera)
          renderer.setRenderTarget(null)
          swapRenderTargets()

          simulationAccumulator -= simStep
        }

        displayMaterial.uniforms.uField.value = getRenderTexture(readTarget)
        displayMaterial.uniforms.uPointer.value.copy(pointer)
        displayMaterial.uniforms.uPointerActive.value = disableInteraction || prefersReducedMotion ? 0 : pointerActive
        displayMaterial.uniforms.uTime.value = timestampMs * 0.001
        applyLayoutUniforms()

        renderer.setRenderTarget(null)
        renderer.render(displayScene, camera)
        setWebglReady()
      }

      animationFrameId = window.requestAnimationFrame(animate)
    } catch (error) {
      console.warn('HeroDottedField WebGL init failed; using CSS fallback.', error)
    }

    return () => {
      destroyed = true
      window.cancelAnimationFrame(animationFrameId)

      if (interactionTarget) {
        interactionTarget.removeEventListener('pointermove', pointerMoveHandler)
        interactionTarget.removeEventListener('pointerleave', pointerLeaveHandler)
      }

      resizeObserver?.disconnect()

      if (intersectionObserver) {
        intersectionObserver.disconnect()
      }

      if (renderer) {
        renderer.dispose()
        if (renderer.domElement.parentElement === canvasMount) {
          canvasMount.removeChild(renderer.domElement)
        }
      }

      disposeRenderTarget(readTarget)
      disposeRenderTarget(writeTarget)
      displayMaterial?.dispose()
      simulationMaterial?.dispose()
      quadGeometry?.dispose()
    }
  }, [disableInteraction, onReady, theme])

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`hero-dotted-field${hasWebgl ? '' : ' is-fallback'}${isReady ? ' is-ready' : ''}`}
    >
      <div ref={canvasMountRef} className="hero-dotted-canvas" />
      <div className="hero-dotted-fallback" />
    </div>
  )
}
