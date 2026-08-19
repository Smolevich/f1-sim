/**
 * Ливреи: название команды и её цвета.
 *
 * Названия — факт, а не знак: перечислять их можно, как это делает любой
 * спортивный сайт. Товарным знаком защищены эмблема и фирменный шрифт,
 * поэтому логотипов в игре нет, а кузов просто перекрашивается.
 */
export type Livery = {
  id: string
  name: string
  primary: number
  accent: number
}

export const LIVERIES: readonly Livery[] = [
  { id: 'mercedes', name: 'Mercedes', primary: 0x00d7b6, accent: 0xc0c6cc },
  { id: 'ferrari', name: 'Ferrari', primary: 0xe8002d, accent: 0xf5e600 },
  { id: 'redbull', name: 'Red Bull', primary: 0x1e2f6e, accent: 0xe8002d },
  { id: 'mclaren', name: 'McLaren', primary: 0xff8000, accent: 0x0f1a2b },
  { id: 'aston', name: 'Aston Martin', primary: 0x00594f, accent: 0xcedc00 },
  { id: 'alpine', name: 'Alpine', primary: 0x0090ff, accent: 0xf5f5f5 },
  { id: 'williams', name: 'Williams', primary: 0x1868db, accent: 0xf5f5f5 },
  { id: 'haas', name: 'Haas', primary: 0xb6babd, accent: 0xe8002d },
]

export const DEFAULT_LIVERY = LIVERIES[0]

export function liveryById(id: string): Livery {
  return LIVERIES.find((l) => l.id === id) ?? DEFAULT_LIVERY
}
