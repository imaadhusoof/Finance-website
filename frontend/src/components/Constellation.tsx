import { useEffect, useRef } from 'react'

/**
 * Animated constellation background, ported from the imaadhusoof.com portfolio
 * (constellation.js) into a self-contained React component: nodes drift, link
 * to nearby neighbours, respond to the cursor, and scatter on click.
 *
 * Rendered once behind the whole app (fixed, pointer-events: none). Respects
 * prefers-reduced-motion by drawing a single static field with no animation
 * loop or pointer interaction.
 */
export default function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const MAX_DIST = 170
    const MOUSE_RADIUS = 220
    const MOUSE_PUSH = 1.3
    const CLICK_RADIUS = 260
    const CLICK_FORCE = 6
    const BASE_SPEED = 0.35

    interface Node {
      x: number
      y: number
      vx: number
      vy: number
      r: number
      phase: number
    }

    let nodes: Node[] = []
    let time = 0
    let raf = 0
    const mouse: { x: number | null; y: number | null } = { x: null, y: null }

    const nodeCountForSize = () => {
      const area = window.innerWidth * window.innerHeight
      return Math.round(Math.min(170, Math.max(45, area / 11000)))
    }

    const makeNode = (): Node => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * BASE_SPEED * 2,
      vy: (Math.random() - 0.5) * BASE_SPEED * 2,
      r: Math.random() * 2.5 + 2,
      phase: Math.random() * Math.PI * 2,
    })

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const target = nodeCountForSize()
      if (nodes.length < target) {
        while (nodes.length < target) nodes.push(makeNode())
      } else {
        nodes.length = target
      }
      if (reduced) draw() // repaint the static field at the new size
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Links between nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MAX_DIST) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(150, 165, 205, ${(1 - dist / MAX_DIST) * 0.5})`
            ctx.lineWidth = 0.8
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // Cursor links + pointer dot
      if (mouse.x !== null && mouse.y !== null) {
        for (const n of nodes) {
          const dx = n.x - mouse.x
          const dy = n.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MOUSE_RADIUS) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(111, 155, 224, ${(1 - dist / MOUSE_RADIUS) * 0.6})`
            ctx.lineWidth = 1
            ctx.moveTo(n.x, n.y)
            ctx.lineTo(mouse.x, mouse.y)
            ctx.stroke()
          }
        }
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(111, 155, 224, 0.9)'
        ctx.fill()
      }

      // Nodes
      for (const n of nodes) {
        const twinkle = 0.65 + 0.35 * Math.sin(time * 0.03 + n.phase)
        let radius = n.r
        let alpha = 0.7 * twinkle

        if (mouse.x !== null && mouse.y !== null) {
          const dx = n.x - mouse.x
          const dy = n.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MOUSE_RADIUS) {
            const proximity = 1 - dist / MOUSE_RADIUS
            radius = n.r * (1 + proximity * 1.1)
            alpha = Math.min(1, alpha + proximity * 0.5)
          }
        }

        ctx.beginPath()
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(190, 205, 235, ${alpha})`
        ctx.fill()
      }
    }

    const update = () => {
      time++
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy

        if (mouse.x !== null && mouse.y !== null) {
          const dx = n.x - mouse.x
          const dy = n.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MOUSE_RADIUS && dist > 0.01) {
            const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS
            n.x += (dx / dist) * force * MOUSE_PUSH
            n.y += (dy / dist) * force * MOUSE_PUSH
          }
        }

        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy)
        if (speed > BASE_SPEED * 3) {
          n.vx *= 0.96
          n.vy *= 0.96
        }

        if (n.x < 0 || n.x > canvas.width) n.vx *= -1
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1
      }
    }

    const loop = () => {
      update()
      draw()
      raf = requestAnimationFrame(loop)
    }

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    const onLeave = () => {
      mouse.x = null
      mouse.y = null
    }
    const onClick = (e: MouseEvent) => {
      for (const n of nodes) {
        const dx = n.x - e.clientX
        const dy = n.y - e.clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < CLICK_RADIUS && dist > 0.01) {
          const force = (CLICK_RADIUS - dist) / CLICK_RADIUS
          n.vx += (dx / dist) * force * CLICK_FORCE
          n.vy += (dy / dist) * force * CLICK_FORCE
        }
      }
    }

    // Init
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    nodes = Array.from({ length: nodeCountForSize() }, makeNode)
    window.addEventListener('resize', resize)

    if (reduced) {
      draw() // one static frame, no interaction
    } else {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseleave', onLeave)
      window.addEventListener('click', onClick)
      loop()
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('click', onClick)
    }
  }, [])

  return <canvas ref={canvasRef} className="constellation" aria-hidden="true" />
}
