/**
 * Ливреи: только цвета. Логотипы, шрифты и названия реальных команд —
 * товарные знаки, а репозиторий публичный, поэтому команды названы по
 * цвету и городу базы, а не по бренду.
 */
export type Livery = {
  id: string
  name: string
  primary: number
  accent: number
}

export const LIVERIES: readonly Livery[] = [
  { id: 'silver', name: 'Сильвер (Брэкли)', primary: 0x00d2be, accent: 0xc0c6cc },
  { id: 'papaya', name: 'Папайя (Уокинг)', primary: 0xff8000, accent: 0x0f1a2b },
  { id: 'scarlet', name: 'Скарлет (Маранелло)', primary: 0xd40000, accent: 0xf5e600 },
  { id: 'navy', name: 'Нейви (Милтон-Кинс)', primary: 0x1e2f6e, accent: 0xd4001a },
  { id: 'emerald', name: 'Эмеральд (Сильверстоун)', primary: 0x00594f, accent: 0xcedc00 },
  { id: 'azure', name: 'Азур (Энстон)', primary: 0x0090ff, accent: 0xf5f5f5 },
]

export const DEFAULT_LIVERY = LIVERIES[0]

export function liveryById(id: string): Livery {
  return LIVERIES.find((l) => l.id === id) ?? DEFAULT_LIVERY
}
