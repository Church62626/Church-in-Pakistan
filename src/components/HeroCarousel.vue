<template>
  <section
    class="carousel"
    :aria-roledescription="slides.length > 1 ? 'carousel' : undefined"
    aria-label="Featured"
    @mouseenter="pause"
    @mouseleave="resume"
    @focusin="pause"
    @focusout="resume"
  >
    <div class="carousel-viewport">
      <div class="carousel-track" :style="{ transform: `translateX(-${index * 100}%)` }">
        <div
          v-for="(slide, i) in slides"
          :key="slide.title"
          class="carousel-slide"
          role="group"
          aria-roledescription="slide"
          :aria-label="`${i + 1} of ${slides.length}: ${slide.title}`"
          :aria-hidden="i !== index"
          :inert="i !== index ? true : undefined"
        >
          <div class="carousel-card glass-card">
            <div class="carousel-icon" aria-hidden="true">{{ slide.icon }}</div>
            <div class="carousel-body">
              <p class="carousel-eyebrow">{{ slide.eyebrow }}</p>
              <h3 class="carousel-title">{{ slide.title }}</h3>
              <p class="carousel-text">{{ slide.text }}</p>
              <router-link v-if="slide.to" :to="slide.to" class="carousel-cta">
                {{ slide.cta }} <span aria-hidden="true">→</span>
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="slides.length > 1" class="carousel-controls">
      <button type="button" class="carousel-arrow" aria-label="Previous slide" @click="go(index - 1)">‹</button>

      <div class="carousel-dots" role="tablist" aria-label="Choose slide">
        <button
          v-for="(slide, i) in slides"
          :key="`dot-${slide.title}`"
          type="button"
          role="tab"
          class="carousel-dot"
          :class="{ active: i === index }"
          :aria-selected="i === index"
          :aria-label="`Slide ${i + 1}: ${slide.title}`"
          @click="go(i)"
        ></button>
      </div>

      <button type="button" class="carousel-arrow" aria-label="Next slide" @click="go(index + 1)">›</button>

      <!-- Auto-advance is a WCAG 2.2.2 concern: moving content needs a pause. -->
      <button
        type="button"
        class="carousel-pause"
        :aria-label="paused ? 'Resume automatic sliding' : 'Pause automatic sliding'"
        :aria-pressed="paused"
        @click="togglePause"
      >{{ paused ? '▶' : '❚❚' }}</button>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  slides: { type: Array, required: true },
  /** ms between automatic advances */
  interval: { type: Number, default: 6000 }
})

const index = ref(0)
const paused = ref(false)
let timer = null

function go(next) {
  const n = props.slides.length
  if (!n) return
  // Wraps in both directions so the arrows never dead-end.
  index.value = ((next % n) + n) % n
}

function start() {
  stop()
  if (props.slides.length < 2) return
  timer = setInterval(() => {
    if (!paused.value) go(index.value + 1)
  }, props.interval)
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

function pause() { paused.value = true }
function resume() { paused.value = false }
function togglePause() { paused.value = !paused.value }

onMounted(() => {
  // Someone who has asked for less motion gets a still carousel. Auto-advance
  // is exactly the kind of movement that setting exists to suppress.
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduce) paused.value = true
  start()
})

onUnmounted(stop)
</script>

<style scoped>
.carousel { position: relative; max-width: 1000px; margin: 0 auto; }

.carousel-viewport { overflow: hidden; border-radius: 20px; }

.carousel-track {
  display: flex;
  transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .carousel-track { transition: none; }
}

.carousel-slide { flex: 0 0 100%; min-width: 100%; }

.carousel-card {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 30px;
  border-radius: 20px;
  min-height: 190px;
}

.carousel-icon { font-size: 52px; line-height: 1; flex-shrink: 0; }
.carousel-body { flex: 1; }

.carousel-eyebrow {
  margin: 0 0 4px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.carousel-title {
  margin: 0 0 8px;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-primary);
}

.carousel-text {
  margin: 0 0 14px;
  font-size: 0.96rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.carousel-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  transition: filter 0.2s ease, transform 0.15s ease;
}

.carousel-cta:hover,
.carousel-cta:focus-visible {
  filter: brightness(1.08);
  transform: translateX(2px);
  outline: none;
}

.carousel-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.carousel-arrow,
.carousel-pause {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(127, 127, 127, 0.3);
  background: rgba(127, 127, 127, 0.1);
  color: var(--text-primary);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease;
}

.carousel-pause { font-size: 0.8rem; }

.carousel-arrow:hover,
.carousel-pause:hover { background: rgba(127, 127, 127, 0.22); }

.carousel-arrow:focus-visible,
.carousel-pause:focus-visible,
.carousel-dot:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.carousel-dots { display: flex; gap: 8px; align-items: center; }

.carousel-dot {
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(127, 127, 127, 0.4);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.carousel-dot.active { background: var(--primary); transform: scale(1.35); }

@media (max-width: 640px) {
  .carousel-card {
    flex-direction: column;
    text-align: center;
    padding: 24px 18px;
    gap: 12px;
  }

  .carousel-icon { font-size: 40px; }
  .carousel-title { font-size: 1.15rem; }
}
</style>