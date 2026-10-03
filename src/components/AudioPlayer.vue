<template>
  <div class="audio-player-bar glass-bottom-sheet">
    <audio
      ref="audioEl"
      :src="audioUrl"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @ended="onEnded"
    />

    <div class="audio-player-content">
      <button class="audio-play-btn" @click="togglePlay" aria-label="Play/Pause">
        <span v-if="!isPlaying" class="play-icon">▶</span>
        <span v-else class="pause-icon">⏸</span>
      </button>

      <div class="audio-info">
        <span class="audio-title">Zaboor 1</span>
        <span class="audio-time">{{ formattedCurrentTime }} / {{ formattedDuration }}</span>
      </div>

      <div class="audio-seek-container">
        <input
          type="range"
          class="audio-seek-slider"
          min="0"
          :max="duration"
          step="0.1"
          :value="currentTime"
          @input="onSeek"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  audioUrl: {
    type: String,
    required: true
  }
})

const audioEl = ref(null)
const currentTime = ref(0)
const duration = ref(0)
const isPlaying = ref(false)

const formattedCurrentTime = computed(() => formatTime(currentTime.value))
const formattedDuration = computed(() => formatTime(duration.value))

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function togglePlay() {
  const audio = audioEl.value
  if (!audio) return

  if (isPlaying.value) {
    audio.pause()
  } else {
    audio.play().catch(() => {})
  }
  isPlaying.value = !isPlaying.value
}

function onTimeUpdate() {
  const audio = audioEl.value
  if (audio) {
    currentTime.value = audio.currentTime
  }
}

function onLoadedMetadata() {
  const audio = audioEl.value
  if (audio) {
    duration.value = audio.duration
  }
}

function onSeek(e) {
  const audio = audioEl.value
  const time = parseFloat(e.target.value)
  if (audio) {
    audio.currentTime = time
    currentTime.value = time
  }
}

function onEnded() {
  isPlaying.value = false
  currentTime.value = 0
}

onMounted(() => {
  const audio = audioEl.value
  if (audio) {
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
  }
})

onUnmounted(() => {
  const audio = audioEl.value
  if (audio) {
    audio.removeEventListener('timeupdate', onTimeUpdate)
    audio.removeEventListener('loadedmetadata', onLoadedMetadata)
    audio.removeEventListener('ended', onEnded)
  }
})
</script>

<style scoped>
.audio-player-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 12px 16px;
  background: var(--surface);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);
  border-top: 1px solid var(--border-color);
  border-radius: 0;
  box-shadow: var(--shadow-lg);
}

.audio-player-content {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1200px;
  margin: 0 auto;
}

.audio-play-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: var(--text-inverse);
  font-size: 1.2rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
  transition: all 0.2s ease;
}

.audio-play-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}

.play-icon,
.pause-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.play-icon {
  padding-left: 2px;
}

.audio-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex-shrink: 0;
}

.audio-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.audio-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.audio-seek-container {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.audio-seek-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, var(--primary) 0%, var(--primary) var(--progress, 0%), var(--border-color) var(--progress, 0%), var(--border-color) 100%);
  outline: none;
  cursor: pointer;
}

.audio-seek-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.audio-seek-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

@media (max-width: 768px) {
  .audio-player-bar {
    padding: 10px 12px;
  }

  .audio-play-btn {
    width: 38px;
    height: 38px;
    font-size: 1rem;
  }

  .audio-title {
    font-size: 0.85rem;
  }

  .audio-time {
    font-size: 0.7rem;
  }
}
</style>
