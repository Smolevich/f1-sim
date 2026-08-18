import * as THREE from 'three'
import { buildSky, HORIZON_COLOR } from './sky'
import { makeGrassTexture, makePatchTexture } from './textures'

export function createScene(canvas: HTMLCanvasElement): {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
  sky: THREE.Mesh
} {
  const scene = new THREE.Scene()
  // Фон под цвет горизонта градиента: купол закрывает его целиком, но пока он
  // не отрисован (первый кадр, редкие ракурсы) плоский цвет не должен выделяться.
  scene.background = new THREE.Color(HORIZON_COLOR)
  // Дальняя граница за гребнями гряды (она уходит на 3600 м), а не по ним:
  // с 2600 м рельеф выцветал в небо ровно там, где он и должен читаться.
  scene.fog = new THREE.Fog(HORIZON_COLOR, 500, 4600)

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
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: makeGrassTexture(),
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  applyGroundPatches(groundMaterial)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10_000, 10_000), groundMaterial)
  ground.receiveShadow = true
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.3
  scene.add(ground)

  const sky = buildSky()
  scene.add(sky)

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

  return { scene, camera, renderer, sun, sky }
}

/** Столько пятен на всю землю: пятно должно быть размером с поле, не с газон. */
const PATCH_REPEAT = 7

/**
 * Домножает газон на карту крупных пятен прямо в шейдере. Второй меш поверх
 * земли обошёлся бы отдельным проходом на десять тысяч метров плоскости, а
 * vertexColors на плоскости из четырёх вершин не даёт пятен вообще.
 */
function applyGroundPatches(material: THREE.MeshStandardMaterial): void {
  const patch = makePatchTexture(256, 1, 0.55)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.patchMap = { value: patch }
    // Своя varying, а не vMapUv: в ту уже вкатан repeat травы (200), и пятна
    // на ней вырождаются в то же зерно. Пятна масштабируются независимо.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPatchUv;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         vPatchUv = uv * ${PATCH_REPEAT}.0;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D patchMap;\nvarying vec2 vPatchUv;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         diffuseColor.rgb *= texture2D(patchMap, vPatchUv).rgb;`,
      )
  }
  // Ключ компиляции: без него three переиспользует программу без patchMap.
  material.customProgramCacheKey = () => 'ground-patches'
}
