export type TrackEntry = {
  id: string
  name: string
  lengthM: number
  recordMs: number
  recordDriver: string
}

/**
 * Каталог — чистые данные, а не чтение JSON: меню рисуется до того, как трасса
 * выбрана, и грузить ради списка шесть файлов незачем. Совпадение с
 * `public/tracks/*.json` держит тест в catalogue.test.ts.
 */
export const TRACK_CATALOGUE: TrackEntry[] = [
  {
    id: 'monza',
    name: 'Autodromo Nazionale di Monza',
    lengthM: 5793,
    recordMs: 81_046,
    recordDriver: 'Rubens Barrichello',
  },
  {
    id: 'spa',
    name: 'Circuit de Spa-Francorchamps',
    lengthM: 7004,
    recordMs: 106_286,
    recordDriver: 'Valtteri Bottas',
  },
  {
    id: 'monaco',
    name: 'Circuit de Monaco',
    lengthM: 3337,
    recordMs: 72_909,
    recordDriver: 'Lewis Hamilton',
  },
  {
    id: 'silverstone',
    name: 'Silverstone Circuit',
    lengthM: 5891,
    recordMs: 87_097,
    recordDriver: 'Max Verstappen',
  },
  {
    id: 'suzuka',
    name: 'Suzuka International Racing Course',
    lengthM: 5807,
    recordMs: 90_983,
    recordDriver: 'Lewis Hamilton',
  },
  {
    id: 'interlagos',
    name: 'Autódromo José Carlos Pace',
    lengthM: 4309,
    recordMs: 70_540,
    recordDriver: 'Max Verstappen',
  },
]

export const DEFAULT_TRACK_ID = 'monza'

/** id подставляется в путь к файлу, поэтому из localStorage принимаем только известные. */
export function isKnownTrackId(id: string | null): boolean {
  return id !== null && TRACK_CATALOGUE.some((t) => t.id === id)
}
