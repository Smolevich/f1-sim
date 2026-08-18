import * as THREE from 'three'

/**
 * Цвет неба у горизонта. В него же красится туман: fog смешивает далёкую
 * геометрию с этим цветом, и если он расходится с низом градиента, на стыке
 * земли и неба появляется полоса другого оттенка.
 */
export const HORIZON_COLOR = 0xc3d9e8
const ZENITH_COLOR = 0x2f6fb5
const MID_COLOR = 0x74aede

/** Радиус меньше camera.far (5000), иначе купол обрежется дальней плоскостью. */
const SKY_RADIUS = 4200

const VERTEX = `
  varying float vHeight;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Доля высоты на сфере, а не мировой Y: купол едет за камерой, и абсолютная
    // высота дала бы уползающий градиент.
    vHeight = normalize(position).y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/**
 * Градиент в три опорных цвета. Двух не хватает: линейная смесь низа и зенита
 * даёт грязный сине-серый в середине неба вместо чистой голубизны.
 */
const FRAGMENT = `
  uniform vec3 horizon;
  uniform vec3 mid;
  uniform vec3 zenith;
  varying float vHeight;
  void main() {
    float h = clamp(vHeight, 0.0, 1.0);
    // Корень поджимает переход к горизонту: линейно светлая полоса занимает
    // половину неба и небо выглядит выцветшим.
    float low = smoothstep(0.0, 0.30, h);
    float high = smoothstep(0.22, 0.85, h);
    vec3 color = mix(mix(horizon, mid, low), zenith, high);
    gl_FragColor = vec4(color, 1.0);
  }
`

/**
 * Купол неба с вертикальным градиентом. Возвращает меш, который надо добавить в
 * сцену и держать в центре на камере: scene.background плоским цветом — половина
 * ощущения дешёвой картинки.
 */
export function buildSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      horizon: { value: new THREE.Color(HORIZON_COLOR) },
      mid: { value: new THREE.Color(MID_COLOR) },
      zenith: { value: new THREE.Color(ZENITH_COLOR) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 24, 16), material)
  // Купол рисуется последним, но с проверкой глубины: SwiftShader растеризует
  // на процессоре, и купол первым закрашивал весь кадр, который потом целиком
  // перерисовывала сцена — 5 мс на пустую заливку. Последним он попадает только
  // в те пиксели, которые никто не занял. depthWrite отключён, чтобы купол сам
  // не перекрывал ничего, что нарисуют после него.
  sky.renderOrder = 1000
  sky.frustumCulled = false
  return sky
}
