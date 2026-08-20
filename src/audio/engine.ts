/**
 * Звук двигателя на реальных сэмплах.
 *
 * Синтез (пила, треугольник) давал вибрирующий гул, на мотор не похожий.
 * Здесь две записи настоящего V8 Формулы-1 (CC0, см. public/audio/CREDITS.md):
 * холостой ход и полный газ. Высота меняется playbackRate по оборотам, между
 * сэмплами — кроссфейд, поэтому тембр не разваливается на всём диапазоне.
 */

/** Границы оборотов те же, что в drivetrain: иначе тон упирается в потолок раньше. */
const IDLE_RPM = 4_000
const MAX_RPM = 15_000

/** Обороты, на которых записан каждый сэмпл. */
const IDLE_SAMPLE_RPM = 6_700
const HIGH_SAMPLE_RPM = 17_500

/** Диапазон, на котором сэмплы смешиваются. */
const CROSSFADE_FROM = 8_000
const CROSSFADE_TO = 10_500

const IDLE_URL = '/audio/engine-idle.mp3'
const HIGH_URL = '/audio/engine-high.mp3'

/**
 * Множитель скорости воспроизведения. Держим его в 0.5…1.5: за этими
 * границами playbackRate ломает тембр, и мотор превращается в кашу.
 */
export function rateFor(rpm: number, sampleRpm: number): number {
  const clamped = Math.max(IDLE_RPM, Math.min(MAX_RPM, rpm))
  return Math.max(0.5, Math.min(1.5, clamped / sampleRpm))
}

/** Доля верхнего сэмпла: 0 — только холостой, 1 — только полный газ. */
export function highMix(rpm: number): number {
  if (rpm <= CROSSFADE_FROM) return 0
  if (rpm >= CROSSFADE_TO) return 1
  return (rpm - CROSSFADE_FROM) / (CROSSFADE_TO - CROSSFADE_FROM)
}

/** Общая громкость: газ поднимает, обороты добавляют. */
export function gainFor(throttle: number, rpm: number): number {
  const load = 0.35 + 0.65 * Math.max(0, Math.min(1, throttle))
  const revs = Math.max(0, Math.min(1, (rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM)))
  return 0.5 * load * (0.55 + 0.45 * revs)
}

type Layer = { source: AudioBufferSourceNode; gain: GainNode; sampleRpm: number }

export class EngineSound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private idle: Layer | null = null
  private high: Layer | null = null

  /** Стартуется по действию игрока: без этого браузер звук не даёт. */
  async start(): Promise<void> {
    if (this.ctx !== null) return
    const Ctor = window.AudioContext ?? (window as unknown as {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext
    if (Ctor === undefined) return

    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)

    const [idleBuf, highBuf] = await Promise.all([
      load(ctx, IDLE_URL), load(ctx, HIGH_URL),
    ])
    if (idleBuf === null || highBuf === null) return

    this.ctx = ctx
    this.master = master
    this.idle = startLayer(ctx, master, idleBuf, IDLE_SAMPLE_RPM)
    this.high = startLayer(ctx, master, highBuf, HIGH_SAMPLE_RPM)
  }

  update(rpm: number, throttle: number): void {
    const ctx = this.ctx
    if (ctx === null || this.master === null || this.idle === null || this.high === null) return
    const now = ctx.currentTime
    const mix = highMix(rpm)

    this.idle.source.playbackRate.setTargetAtTime(rateFor(rpm, IDLE_SAMPLE_RPM), now, 0.05)
    this.high.source.playbackRate.setTargetAtTime(rateFor(rpm, HIGH_SAMPLE_RPM), now, 0.05)
    this.idle.gain.gain.setTargetAtTime(1 - mix, now, 0.08)
    this.high.gain.gain.setTargetAtTime(mix, now, 0.08)
    this.master.gain.setTargetAtTime(gainFor(throttle, rpm), now, 0.06)
  }

  mute(): void {
    if (this.ctx === null || this.master === null) return
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08)
  }
}

async function load(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await ctx.decodeAudioData(await res.arrayBuffer())
  } catch {
    return null
  }
}

function startLayer(
  ctx: AudioContext, master: GainNode, buffer: AudioBuffer, sampleRpm: number,
): Layer {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const gain = ctx.createGain()
  gain.gain.value = 0
  source.connect(gain)
  gain.connect(master)
  source.start()
  return { source, gain, sampleRpm }
}
