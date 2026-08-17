import * as THREE from 'three'

export function createScene(canvas: HTMLCanvasElement): {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
} {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb)
  scene.fog = new THREE.Fog(0x87ceeb, 200, 1200)

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

  // Земля под полотном: без неё трасса висит лентой в небе, а болид едет над
  // пустотой. Чуть ниже нуля, иначе z-fight с полотном.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10_000, 10_000),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3f }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  scene.add(ground)

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.5)
  sun.position.set(200, 400, 200)
  scene.add(sun)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer }
}
