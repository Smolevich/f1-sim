import * as THREE from 'three'
import { makeGrassTexture } from './textures'

export function createScene(canvas: HTMLCanvasElement): {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
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
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // Земля под полотном: без неё трасса висит лентой в небе, а болид едет над
  // пустотой. polygonOffset отодвигает газон вглубь на уровне растеризации —
  // одного зазора по высоте мало, трасса тянется на километр от начала координат.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10_000, 10_000),
    new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  )
  ground.receiveShadow = true
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.3
  scene.add(ground)

  // Заливка приглушена против прежних 1.2: с ней вровень с солнцем тень под
  // болидом высветляется до неразличимой.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.75))
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2)
  sun.position.set(300, 500, 200)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  // Тень покрывает окрестность болида, а не всю трассу: карта на 5 км даёт
  // такой шаг, что тени не видно вовсе.
  const span = 120
  sun.shadow.camera.left = -span
  sun.shadow.camera.right = span
  sun.shadow.camera.top = span
  sun.shadow.camera.bottom = -span
  sun.shadow.camera.far = 1200
  // Полигоны трассы почти параллельны лучу у горизонта карты, из-за чего без
  // сдвига по глубине асфальт затеняет сам себя полосами (shadow acne).
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer, sun }
}
