import * as THREE from 'three'

export function createScene(canvas: HTMLCanvasElement): {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
} {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb)
  scene.fog = new THREE.Fog(0x87ceeb, 200, 1200)

  // near=1, а не 0.1: точность буфера глубины падает пропорционально near/far,
  // и с 0.1 на дистанции 800 м она составляет 0.38 м — грубее, чем зазор между
  // землёй и полотном, из-за чего трасса тонула в газоне. Ближе метра к камере
  // всё равно ничего нет: она висит над болидом.
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 5000)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

  // Земля под полотном: без неё трасса висит лентой в небе, а болид едет над
  // пустотой. polygonOffset отодвигает газон вглубь на уровне растеризации —
  // одного зазора по высоте мало, трасса тянется на километр от начала координат.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10_000, 10_000),
    new THREE.MeshStandardMaterial({
      color: 0x4a7c3f,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.3
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
