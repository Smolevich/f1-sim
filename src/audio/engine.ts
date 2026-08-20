/**
 * Звук двигателя: синтез, а не запись.
 *
 * Готовый сэмпл V6 под лицензией для публичного репозитория ещё надо искать, а
 * тон мотора всё равно обязан следовать оборотам — иначе он живёт отдельно от
 * машины. Web Audio даёт это напрямую: пила плюс подтон, частота от оборотов.
 */

/** Обороты холостого хода и предел — те же, что в drivetrain. */
const IDLE_RPM = 4000
const MAX_RPM = 12_000

/** Основная частота на пределе оборотов, Гц. Реальный V6 звучит около 700. */
const MAX_FREQ = 620
const IDLE_FREQ = 180

export function frequencyFor(rpm: number): number {
  const t = Math.max(0, Math.min(1, (rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM)))
  // Квадратичный рост: у мотора тон повышается быстрее к верхам.
  return IDLE_FREQ + (MAX_FREQ - IDLE_FREQ) * (0.35 * t + 0.65 * t * t)
}

/** Громкость от газа: на холостых мотор слышен, но не ревёт. */
export function gainFor(throttle: number, rpm: number): number {
  const load = 0.25 + 0.75 * Math.max(0, Math.min(1, throttle))
  const revs = Math.max(0, Math.min(1, (rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM)))
  return 0.045 * load * (0.5 + 0.5 * revs)
}

type Nodes = {
  ctx: AudioContext
  main: OscillatorNode
  sub: OscillatorNode
  gain: GainNode
  filter: BiquadFilterNode
}

export class EngineSound {
  private nodes: Nodes | null = null

  /** Запускается только по действию игрока: браузер иначе не даёт звук. */
  start(): void {
    if (this.nodes !== null) return
    const Ctor = window.AudioContext ?? (window as unknown as {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext
    if (Ctor === undefined) return

    const ctx = new Ctor()
    const gain = ctx.createGain()
    gain.gain.value = 0

    // Фильтр срезает визг верхних гармоник пилы: без него звук режет слух.
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 2600
    filter.Q.value = 0.7

    const main = ctx.createOscillator()
    main.type = 'sawtooth'
    const sub = ctx.createOscillator()
    sub.type = 'square'

    main.connect(filter)
    sub.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    main.start()
    sub.start()

    this.nodes = { ctx, main, sub, gain, filter }
  }

  update(rpm: number, throttle: number): void {
    const n = this.nodes
    if (n === null) return
    const freq = frequencyFor(rpm)
    const now = n.ctx.currentTime
    // Плавный переход, иначе на каждой смене оборотов слышен щелчок.
    n.main.frequency.setTargetAtTime(freq, now, 0.03)
    n.sub.frequency.setTargetAtTime(freq / 2, now, 0.03)
    n.gain.gain.setTargetAtTime(gainFor(throttle, rpm), now, 0.05)
    n.filter.frequency.setTargetAtTime(1200 + freq * 2.4, now, 0.05)
  }

  mute(): void {
    const n = this.nodes
    if (n === null) return
    n.gain.gain.setTargetAtTime(0, n.ctx.currentTime, 0.05)
  }
}
