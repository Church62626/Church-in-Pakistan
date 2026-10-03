<template>
  <button
    type="button"
    class="brand-logo-container"
    :style="{ width: size, height: size }"
    aria-label="View Church in Pakistan logo"
    @click="$emit('click', $event)"
  >
    <img
      :src="logoImage"
      alt="Church in Pakistan Logo"
      class="brand-logo-img"
    />
  </button>
</template>

<script setup>
import logoImage from '../assets/logo.png'

defineProps({
  size: {
    type: String,
    default: '48px'
  }
})

defineEmits(['click'])
</script>

<style scoped>
.brand-logo-container {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.brand-logo-container:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 3px var(--primary-bg);
}

.brand-logo-container:active {
  transform: scale(0.97);
}

.brand-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 50%;
  display: block;
}
</style>
