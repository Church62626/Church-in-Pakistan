<template>
  <div class="home-page">
    <!-- Hero Section -->
    <section class="hero-section">
      <div class="hero-content">
        <h1 class="hero-title">
          Welcome to <span class="text-gradient">Lord's Recovery Church</span>
        </h1>
        <p class="hero-subtitle">
          A place of worship, community, and spiritual growth in Pakistan
        </p>
        <div class="hero-actions">
          <router-link to="/library" class="btn btn-primary">
            <span class="btn-icon">📖</span>
            Explore Library
          </router-link>
          <router-link to="/events" class="btn btn-outline">
            <span class="btn-icon">📅</span>
            Upcoming Events
          </router-link>
        </div>
      </div>
    </section>

    <!-- Auto-advancing highlights. Each card describes something that is
         actually built and reachable, so nothing here over-promises. -->
    <section class="carousel-section">
      <div class="container">
        <HeroCarousel :slides="slides" />
      </div>
    </section>

    <!-- Random hymn player: one hymn per active language, rotated through on
         demand, so the multilingual range is visible from the home page. -->
    <RandomHymnPlayer />

    <!-- Features Grid -->
    <section class="features-section">
      <div class="container">
        <h2 class="section-title text-center mb-12">What We Offer</h2>
        <div class="features-grid">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="feature-card"
          >
            <div class="feature-icon">{{ feature.icon }}</div>
            <h3 class="feature-title">{{ feature.title }}</h3>
            <p class="feature-description">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import HeroCarousel from '../components/HeroCarousel.vue'
import RandomHymnPlayer from '../components/RandomHymnPlayer.vue'

// Carousel highlights. Every card points at a page that exists and works.
const slides = ref([
  {
    eyebrow: 'Read & study',
    title: '800+ hymns in four languages',
    text: 'Urdu, Roman Urdu, English and Chinese, organised by category and sub-category so you can find the hymn you need quickly.',
    icon: '📖',
    to: '/library',
    cta: 'Open the Library'
  },
  {
    eyebrow: 'Jump straight to a number',
    title: 'Find a hymn by number',
    text: 'Use the on-screen keypad or search by title to open a hymn directly, without browsing through the whole book.',
    icon: '🔢',
    to: '/list',
    cta: 'Go to the hymn list'
  },
  {
    eyebrow: 'Listen',
    title: 'Play the hymnal',
    text: 'Stream recordings with a playback speed slider, so you can slow a hymn down to learn it or speed it up to review.',
    icon: '🎧',
    to: '/listen',
    cta: 'Start listening'
  },
  {
    eyebrow: 'Gather together',
    title: 'Events & conferences',
    text: 'Keep up with what is coming up at the church and register for the gatherings you want to attend.',
    icon: '📅',
    to: '/events',
    cta: 'See events'
  }
])

// Feature highlights
const features = ref([
  {
    title: 'Digital Library',
    description: 'Access hymns, books, and study materials in our immersive digital reader with day/night modes.',
    icon: '📚'
  },
  {
    title: 'E-Commerce Store',
    description: 'Purchase physical and digital books, with secure payment via EasyPaisa, JazzCash, and bank transfer.',
    icon: '🛍️'
  },
  {
    title: 'Events & Conferences',
    description: 'Register for training programs, conferences, and special gatherings with digital ticketing.',
    icon: '📅'
  },
  {
    title: 'Audio Integration',
    description: 'Listen to synchronized hymn audio while reading along with our custom audio player.',
    icon: '🎵'
  }
])
</script>

<style scoped>
/* Hero Section */
.hero-section {
  background: linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-primary) 100%);
  padding: 120px 0 80px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.hero-section::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -10%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, var(--primary-bg) 0%, transparent 70%);
  border-radius: 50%;
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: 0 auto;
  padding: 0 24px;
}

.hero-title {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 800;
  line-height: 1.2;
  margin-bottom: 24px;
  color: var(--text-primary);
}

.hero-subtitle {
  font-size: clamp(1rem, 2vw, 1.25rem);
  color: var(--text-secondary);
  margin-bottom: 40px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.hero-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.text-gradient {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Custom Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.3s ease;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: white;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
  transform: translateY(-2px);
}

.btn-outline {
  background: transparent;
  color: var(--primary);
  border: 2px solid var(--primary);
}

.btn-outline:hover {
  background: var(--primary-bg);
  transform: translateY(-2px);
}

.btn-icon {
  font-size: 1.2rem;
}

/* Carousel Section */
.carousel-section {
  padding: 10px 0 70px;
  background: var(--bg-primary);
}

/* Features Section */
.features-section {
  padding: 80px 0;
  background: var(--bg-primary);
}

.section-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 3rem;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.feature-card {
  background: var(--surface);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 32px;
  text-align: center;
  transition: all 0.3s ease;
  box-shadow: var(--shadow-md);
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  background: var(--surface-hover);
}

.feature-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.feature-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.feature-description {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .hero-section {
    padding: 80px 0 60px;
  }

  .features-section {
    padding: 60px 0;
  }

  .section-title {
    font-size: 1.75rem;
    margin-bottom: 2rem;
  }

  .hero-actions {
    flex-direction: column;
    align-items: center;
  }

  .hero-actions .btn {
    width: 100%;
    max-width: 300px;
    justify-content: center;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>
