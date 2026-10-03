/**
 * Browser MIDI playback for the Reader.
 *
 * The raw .mid files in the hymns-audio- repo carry almost no instrument
 * information, so rather than editing them we parse the notes and re-render
 * them in the browser with real SoundFont samples:
 *
 *   .mid ArrayBuffer -> @tonejs/midi -> [{ midi, time, duration }]
 *                                    -> Web Audio BufferSource per note
 *                                    -> FluidR3_GM MP3 sample on jsDelivr
 *
 * Notes:
 *  - @tonejs/midi exposes `Midi` on the default export in this build, so it is
 *    imported defensively (named or default) to survive an ESM/CJS interop change.
 *  - SoundFont filenames use FLATS (Bb, Eb) and never sharps (As/Ds are 404),
 *    so every midi note number is converted to a flat name before fetching.
 *  - Samples are fetched lazily, cached per instrument, and decoded once.
 */

import MidiModule from '@tonejs/midi'

const Midi = (MidiModule && (MidiModule.Midi || MidiModule)) || MidiModule.default
/** FluidR3_GM General MIDI instruments. */
export const MIDI_INSTRUMENTS = [
  { value: 'acoustic_grand_piano', label: 'Acoustic Grand Piano', group: 'Keyboard' },
  { value: 'bright_acoustic_piano', label: 'Bright Acoustic Piano', group: 'Keyboard' },
  { value: 'electric_grand_piano', label: 'Electric Grand Piano', group: 'Keyboard' },
  { value: 'honky_tonk_piano', label: 'Honky-tonk Piano', group: 'Keyboard' },
  { value: 'electric_piano_1', label: 'Electric Piano', group: 'Keyboard' },
  { value: 'harpsichord', label: 'Harpsichord', group: 'Keyboard' },
  { value: 'organ_church', label: 'Church Organ', group: 'Keyboard' },
  { value: 'drawbar_organ', label: 'Drawbar Organ', group: 'Keyboard' },
  { value: 'pad_2_warm', label: 'Warm Pad', group: 'Keyboard' },
  { value: 'acoustic_guitar_nylon', label: 'Acoustic Guitar (Nylon)', group: 'Guitar' },
  { value: 'acoustic_guitar_steel', label: 'Acoustic Guitar (Steel)', group: 'Guitar' },
  { value: 'electric_guitar_clean', label: 'Electric Guitar (Clean)', group: 'Guitar' },
  { value: 'electric_guitar_overdrive', label: 'Electric Guitar (Overdrive)', group: 'Guitar' },
  { value: 'bass_acoustic', label: 'Acoustic Bass', group: 'Bass' },
  { value: 'bass_electric_finger', label: 'Electric Bass (Finger)', group: 'Bass' },
  { value: 'violin', label: 'Violin', group: 'Strings' },
  { value: 'viola', label: 'Viola', group: 'Strings' },
  { value: 'cello', label: 'Cello', group: 'Strings' },
  { value: 'string_ensemble_1', label: 'String Ensemble', group: 'Strings' },
  { value: 'orchestral_harp', label: 'Harp', group: 'Strings' },
  { value: 'choir_aahs', label: 'Choir Aahs', group: 'Ensemble' },
  { value: 'steel_drums', label: 'Steel Drums', group: 'Ensemble' },
  { value: 'flute', label: 'Flute', group: 'Wind' },
  { value: 'clarinet', label: 'Clarinet', group: 'Wind' },
  { value: 'oboe', label: 'Oboe', group: 'Wind' },
  { value: 'bassoon', label: 'Bassoon', group: 'Wind' },
  { value: 'saxophone', label: 'Saxophone', group: 'Wind' },
  { value: 'trumpet', label: 'Trumpet', group: 'Brass' },
  { value: 'trombone', label: 'Trombone', group: 'Brass' },
  { value: 'french_horn', label: 'French Horn', group: 'Brass' },
  { value: 'brass_section', label: 'Brass Section', group: 'Brass' },
  { value: 'marimba', label: 'Marimba', group: 'Percussion' }
]

export const DEFAULT_INSTRUMENT = 'acoustic_grand_piano'

const SOUNDFONT_BASE =
  'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/FluidR3_GM'

/* Midi note 60 = C4. Only naturals and flats exist in these soundfonts. */
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** 60 -> "C4", 61 -> "Db4". Values outside C-1..G9 are clamped. */
export function midiNoteName(midi) {
  const n = Math.max(0, Math.min(127, Math.round(midi)))
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`
}

export function soundfontUrl(instrument, noteName) {
  return `${SOUNDFONT_BASE}/${instrument}-mp3/${noteName}.mp3`
}

export function instrumentLabel(value) {
  return MIDI_INSTRUMENTS.find((i) => i.value === value)?.label || value
}

/** Instruments grouped for an <optgroup> friendly dropdown. */
export function instrumentGroups() {
  const groups = new Map()
  for (const item of MIDI_INSTRUMENTS) {
    if (!groups.has(item.group)) groups.set(item.group, [])
    groups.get(item.group).push(item)
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

/**
 * Parses a .mid ArrayBuffer into a flat, time-sorted note list.
 * @returns {{ duration: number, tempo: number, name: string,
 *            notes: Array<{midi:number,time:number,duration:number}> }}
 */
export function parseMidi(arrayBuffer) {
  const midi = new Midi(arrayBuffer)
  const notes = []

  for (const track of midi.tracks) {
    // Channel 10 (index 9) is percussion in General MIDI - no pitched sample.
    if (track.channel === 9) continue
    for (const note of track.notes) {
      notes.push({ midi: note.midi, time: note.time, duration: Math.max(0.05, note.duration) })
    }
  }

  notes.sort((a, b) => a.time - b.time)

  return {
    name: midi.name || '',
    tempo: Math.round(midi.header.tempos[0]?.bpm) || 120,
    duration: midi.duration,
    notes
  }
}

/* ------------------------------------------------------------------ *
 * Sample cache
 * ------------------------------------------------------------------ */

/** AudioBuffer cache: `instrument:noteName` -> AudioBuffer. */
const sampleCache = new Map()
/** In-flight fetches so two notes never download the same sample twice. */
const pending = new Map()

/**
 * Every network call is bounded. A hung CDN request must never leave the
 * Reader's spinner running forever, so each fetch is aborted on a deadline and
 * `withTimeout` is the last line of defence around the whole preload.
 */
export const SAMPLE_TIMEOUT_MS = 8000
export const PRELOAD_TIMEOUT_MS = 12000

/**
 * Races `promise` against a timer. Rejects with a labelled Error on timeout so
 * callers get a real message instead of hanging. The timer is always cleared,
 * and the losing promise is only ever *observed* here - never re-thrown - so a
 * late rejection can never surface as an unhandled rejection.
 */
export function withTimeout(promise, ms, label = 'Operation') {
  let timer
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer))
}

/** fetch() with an AbortController deadline. */
async function fetchWithTimeout(url, ms = SAMPLE_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${ms}ms`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function loadSample(ctx, instrument, noteName) {
  const key = `${instrument}:${noteName}`
  if (sampleCache.has(key)) return sampleCache.get(key)

  // A previous attempt for this key may have hung and been abandoned by a
  // timeout. Its entry would still be sitting in `pending`, and returning that
  // dead promise would make every retry fail too - so drop it and start over.
  // This is what makes "press play again to retry" work after a hang.
  if (pending.has(key)) pending.delete(key)

  const job = (async () => {
    const response = await fetchWithTimeout(soundfontUrl(instrument, noteName))
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${key}`)
    const bytes = await response.arrayBuffer()
    const buffer = await withTimeout(ctx.decodeAudioData(bytes), SAMPLE_TIMEOUT_MS, `Decoding ${key}`)
    sampleCache.set(key, buffer)
    return buffer
  })()

  pending.set(key, job)
  try {
    return await withTimeout(job, SAMPLE_TIMEOUT_MS * 2, `Loading ${key}`)
  } finally {
    // Runs on success, failure AND timeout, so a dead request never leaves a
    // poisoned entry that would break every later retry.
    if (pending.get(key) === job) pending.delete(key)
  }
}

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

/**
 * A small scheduler that plays parsed notes through SoundFont samples.
 * Notes are fired in short lookahead windows so play/pause/seek stay snappy
 * and the progress bar can be polled straight from the AudioContext clock.
 */
export class MidiEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.parsed = null
    this.instrument = DEFAULT_INSTRUMENT
    this.playing = false
    this.offset = 0
    this.startedAt = 0
    this.scheduledUpTo = 0
    this.cursor = 0
    this.timer = null
    this.active = new Set()
    this.onTime = null
    this.onState = null
    this.onSampleError = null
    /** Notes that could not be rendered - surfaced to the Reader as a warning. */
    this.noteErrors = 0
  }

  /** Must be reached from a user gesture before the first play(). */
  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) throw new Error('This browser does not support the Web Audio API.')
      this.ctx = new AudioCtx()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
    return this.ctx
  }

  setInstrument(name) {
    if (this.instrument === name) return
    const wasPlaying = this.playing
    this.stopSources()
    this.instrument = name
    this.playing = false
    if (wasPlaying) this.play()
  }

  setVolume(value) {
    if (!this.master) return
    const v = Math.max(0, Math.min(1, value))
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  get duration() {
    return this.parsed ? this.parsed.duration : 0
  }

  get currentTime() {
    if (!this.playing) return this.offset
    return Math.min(this.duration, this.offset + (this.ctx.currentTime - this.startedAt))
  }

  /** Loads notes from a .mid ArrayBuffer. Resets any current playback. */
  async load(arrayBuffer) {
    this.pause()
    this.noteErrors = 0
    this.parsed = parseMidi(arrayBuffer)
    this.offset = 0
    this.cursor = 0
    this.scheduledUpTo = 0
    if (this.onState) this.onState('loaded')
    return this.parsed
  }

  /**
   * Warms the sample cache for the given notes.
   *
   * Bounded end-to-end by PRELOAD_TIMEOUT_MS and it resolves rather than
   * rejects on failure - the caller gets a report and decides what to do. A
   * hung CDN request therefore cannot leave the Reader spinning forever.
   *
   * @returns {Promise<{loaded:number, failed:number, total:number, timedOut:boolean, message:string}>}
   */
  async preload(notes) {
    const report = { loaded: 0, failed: 0, total: 0, timedOut: false, message: '' }
    if (!this.ctx || !Array.isArray(notes) || !notes.length) return report

    const names = new Set(notes.map((n) => midiNoteName(n.midi)))
    report.total = names.size
    if (!names.size) return report

    // allSettled means one bad sample cannot abort the whole warm-up.
    const results = await withTimeout(
      Promise.allSettled([...names].map((name) => loadSample(this.ctx, this.instrument, name))),
      PRELOAD_TIMEOUT_MS,
      'Loading instrument samples'
    ).catch((err) => {
      report.timedOut = true
      report.message = err.message
      return null
    })

    if (!results) return report

    for (const result of results) {
      if (result.status === 'fulfilled') report.loaded++
      else report.failed++
    }

    if (report.failed) {
      report.message = `Failed to load instrument samples (${report.failed} of ${report.total} could not be fetched).`
    }
    return report
  }

  play() {
    if (!this.parsed || !this.parsed.notes.length) return false
    const ctx = this.ensureContext()

    // Restart from the beginning when parked at the end.
    if (this.offset >= this.duration - 0.01) {
      this.offset = 0
      this.cursor = 0
      this.scheduledUpTo = 0
    }

    this.playing = true
    this.startedAt = ctx.currentTime
    // Rewind the cursor to the first note at/after the seek position.
    this.cursor = this.findCursor(this.offset)
    this.scheduledUpTo = this.offset
    this.schedule()
    this.timer = setInterval(() => this.schedule(), 40)

    if (this.onState) this.onState('play')
    return true
  }

  pause() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.playing) this.offset = this.currentTime
    this.playing = false
    this.stopSources()
    if (this.onState) this.onState('pause')
  }

  stop() {
    this.pause()
    this.offset = 0
    this.cursor = 0
    this.scheduledUpTo = 0
    if (this.onState) this.onState('stop')
  }

  seek(seconds) {
    if (!this.parsed) return
    const target = Math.max(0, Math.min(this.duration, Number(seconds) || 0))
    const wasPlaying = this.playing
    this.pause()
    this.offset = target
    this.cursor = this.findCursor(target)
    this.scheduledUpTo = target
    this.reportTime()
    if (wasPlaying) this.play()
  }

  findCursor(time) {
    const notes = this.parsed.notes
    let i = 0
    while (i < notes.length && notes[i].time < time) i++
    return i
  }

  /** Fires every note whose start falls inside the lookahead window. */
  schedule() {
    if (!this.playing || !this.parsed) return
    const ctx = this.ctx
    const elapsed = this.offset + (ctx.currentTime - this.startedAt)
    const horizon = elapsed + 0.25
    const notes = this.parsed.notes

    while (this.cursor < notes.length && notes[this.cursor].time < horizon) {
      const note = notes[this.cursor]
      this.cursor++
      if (note.time < this.offset) continue
      // Skip notes that would already have finished.
      if (note.time + note.duration <= elapsed) continue
      this.fire(note, ctx.currentTime + Math.max(0, note.time - elapsed))
    }

    if (this.cursor >= notes.length && elapsed >= this.duration) this.finish()
  }

  fire(note, when) {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const noteName = midiNoteName(note.midi)

    loadSample(ctx, this.instrument, noteName)
      .then((buffer) => {
        // The transport may have been paused or switched while we were loading.
        if (!this.playing || !this.ctx) return
        const src = ctx.createBufferSource()
        src.buffer = buffer
        const gain = ctx.createGain()
        const end = when + note.duration
        gain.gain.setValueAtTime(0.9, when)
        // Fade the tail so clipped samples do not click.
        const release = Math.max(0.05, Math.min(0.25, note.duration))
        gain.gain.setValueAtTime(0.9, Math.max(when, end - release))
        gain.gain.linearRampToValueAtTime(0, end)
        src.connect(gain)
        gain.connect(this.master)
        try {
          src.start(when)
          src.stop(end + 0.05)
        } catch {
          // Scheduling in the past can throw; the note is simply dropped.
          return
        }
        this.active.add(src)
        src.onended = () => this.active.delete(src)
      })
      // A failed or timed-out sample must never break the transport, reject
      // unhandled, or stop the scheduler loop.
      .catch((err) => {
        this.noteErrors += 1
        if (this.onSampleError) this.onSampleError(err, note)
      })
  }

  /** Total number of notes that could not be rendered. */
  get failedNotes() {
    return this.noteErrors
  }

  stopSources() {
    for (const src of this.active) {
      try {
        src.onended = null
        src.stop()
      } catch {
        /* already stopped */
      }
    }
    this.active.clear()
  }

  finish() {
    this.pause()
    this.offset = this.duration
    if (this.onState) this.onState('ended')
    if (this.onTime) this.onTime(this.duration, this.duration, true)
  }

  /** Polled by the Reader's rAF loop to keep the progress bar in sync. */
  reportTime() {
    if (!this.onTime) return
    const t = this.currentTime
    this.onTime(t, this.duration, !this.playing && t >= this.duration - 0.01)
  }

  dispose() {
    this.stop()
    this.parsed = null
    this.ctx = null
    this.master = null
  }
}

