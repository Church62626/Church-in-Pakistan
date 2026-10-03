<template>
  <div ref="root" class="lang-select" :class="{ open: open }">
    <button
      type="button"
      class="lang-trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="`Language: ${current?.label ?? 'English'}. Change language`"
      @click="toggle"
    >
      <span aria-hidden="true">🌐</span>
      <span class="lang-current">{{ current?.native || 'English' }}</span>
      <span class="lang-caret" aria-hidden="true">▾</span>
    </button>

    <!-- Teleported so the nav's backdrop-filter cannot clip the dropdown -->
    <teleport to="body">
      <transition name="lang-drop">
        <ul
          v-if="open"
          class="lang-menu"
          role="listbox"
          aria-label="Choose a language"
          :style="menuStyle"
        >
        <li v-for="lang in languages" :key="lang.key" role="none">
          <button
            type="button"
            role="option"
            :aria-selected="lang.key === modelValue"
            class="lang-option"
            :class="{ selected: lang.key === modelValue, disabled: !lang.published }"
            :lang="lang.lang"
            :disabled="!lang.published"
            @click="choose(lang)"
          >
            <span class="lang-name" :class="scriptClass(lang.key)">{{ lang.native }}</span>
            <span class="lang-label">{{ lang.label }}</span>
            <span v-if="!lang.published" class="lang-soon">Soon</span>
          </button>
        </li>
        </ul>
      </transition>
    </teleport>

    <!-- Click-away / Escape backdrop -->
    <div v-if="open" class="lang-backdrop" @click="close" @keydown.esc="close"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { PUBLISHED_LANGUAGES, getLanguage, scriptClass } from '../js/hymnService.js'

const props = defineProps({
  modelValue: { type: String, default: 'english' }
})
const emit = defineEmits(['update:modelValue', 'change'])

const open = ref(false)
const root = ref(null)
const menuStyle = ref({})

/** Anchor the fixed menu under the trigger, flipping up / clamping to the
 *  viewport when there is not enough room below. */
function positionMenu() {
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const margin = 8
  const menuH = Math.min(window.innerHeight * 0.6, 420)
  const below = window.innerHeight - r.bottom - margin
  const openUp = below < Math.min(menuH, 180) && r.top > below
  const top = openUp ? Math.max(margin, r.top - menuH - margin) : r.bottom + margin
  menuStyle.value = {
    top: `${top}px`,
    left: `${Math.max(margin, Math.min(r.left, window.innerWidth - r.width - margin))}px`,
    width: `${r.width > 210 ? r.width : 210}px`
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) positionMenu()
}
function close() {
  open.value = false
}
// Every remaining language is published, so there is no "Soon" state left to
// render. Unreleased languages (Punjabi, Pashto, Sindhi, Balochi) were removed
// from LANGUAGES rather than hidden, so they can never leak back into the UI.
const languages = PUBLISHED_LANGUAGES
const current = computed(() => getLanguage(props.modelValue))

function choose(lang) {
  if (!lang.published) return
  close()
  emit('update:modelValue', lang.key)
  emit('change', lang.key)
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

// Close when focus or a click leaves the component entirely.
function onDocPointerDown(e) {
  if (!open.value) return
  if (e.target?.closest?.('.lang-select')) return
  close()
}

// Scroll locking is deliberately NOT applied while the menu is open.
//
// Hiding the scrollbar removes the scrollbar's width from the document, so the
// page jumps sideways by that width the instant the dropdown opens and snaps
// back when it closes. That shift was the reported "jerk", and it is worse than
// any benefit from blocking scroll on a short menu. The menu is
// `position: fixed` so it floats over the page, and the fixed backdrop
// underneath it handles click-away dismissal.

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onDocPointerDown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onDocPointerDown)
})
</script>

<style scoped>
.lang-select {
  position: relative;
  display: inline-flex;
}

.lang-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border-radius: 10px;
  border: 1px solid var(--border-color, rgba(127, 127, 127, 0.3));
  background: var(--bg-secondary, rgba(127, 127, 127, 0.08));
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.lang-trigger:hover,
.lang-trigger:focus-visible {
  background: rgba(127, 127, 127, 0.16);
  outline: none;
  border-color: var(--primary-color, #4f7cff);
}

.lang-current {
  font-weight: 600;
  max-width: 9ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lang-caret {
  font-size: 0.7rem;
  opacity: 0.7;
}

.lang-backdrop {
  position: fixed;
  inset: 0;
  z-index: 998;
}

.lang-menu {
  position: fixed;
  z-index: 999;
  min-width: 210px;
  max-height: 60vh;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 6px;
  border-radius: 14px;
  /* Matches the glass surfaces used elsewhere (surface + border + shadow). */
  background: var(--surface);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
}

.lang-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.lang-option:hover:not(:disabled),
.lang-option:focus-visible {
  background: rgba(127, 127, 127, 0.16);
  outline: none;
}

.lang-option.selected {
  background: rgba(79, 124, 255, 0.16);
  font-weight: 600;
}

.lang-option.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.lang-name {
  font-size: 1.05rem;
  min-width: 4.5ch;
}

.lang-label {
  flex: 1;
  font-size: 0.88rem;
}

.lang-soon {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.2);
}

/* Menu transition: a short fade + slight rise. The menu is position:fixed, so
   it never reflows the page - only its own opacity and transform animate.
   The classes are emitted on a teleported node, so they must be global; scoped
   rules would not match. Reduced-motion users get an instant appear instead. */
:global(.lang-drop-enter-active),
:global(.lang-drop-leave-active) {
  transition: opacity 0.18s ease, transform 0.18s ease;
  transform-origin: top right;
}

:global(.lang-drop-enter-from),
:global(.lang-drop-leave-to) {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  :global(.lang-drop-enter-active),
  :global(.lang-drop-leave-active) { transition: none; }
}

@media (max-width: 768px) {
  .lang-current {
    max-width: 6ch;
  }
}
</style>