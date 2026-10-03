<template>
  <button
    type="button"
    class="theme-toggle-btn"
    @click="toggleTheme"
    :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
  >
    <!-- Moon icon for dark mode (shown when current theme is dark) -->
    <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
      <path d="M21.64 13a1 1 0 0 0-.57-1.13A10 10 0 1 0 11.5 22.25a1 1 0 0 0 .57.57 1 1 0 0 0 1.13-.57A8 8 0 0 1 21.64 13z" />
    </svg>

    <!-- Sun icon for light mode (shown when current theme is light) -->
    <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
  </button>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const isDark = ref(false)

// Load saved theme preference or default to light
onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    isDark.value = true
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    isDark.value = false
    document.documentElement.setAttribute('data-theme', 'light')
  }
})

// Toggle between light and dark themes
const toggleTheme = () => {
  isDark.value = !isDark.value
  
  if (isDark.value) {
    document.documentElement.setAttribute('data-theme', 'dark')
    localStorage.setItem('theme', 'dark')
  } else {
    document.documentElement.setAttribute('data-theme', 'light')
    localStorage.setItem('theme', 'light')
  }
}

// Listen for system theme changes
watch(
  () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  (newValue) => {
    // Only auto-switch if user hasn't manually set a preference
    if (!localStorage.getItem('theme')) {
      isDark.value = newValue
      document.documentElement.setAttribute('data-theme', newValue ? 'dark' : 'light')
    }
  }
)
</script>

<style scoped>
.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-color, rgba(0,0,0,0.1));
  background: transparent;
  color: var(--text-primary, currentColor);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}

.theme-toggle-btn:hover {
  background: var(--primary-bg, rgba(79, 70, 229, 0.1));
  transform: rotate(15deg) scale(1.1);
}

.theme-toggle-btn svg {
  width: 20px;
  height: 20px;
}
</style>
