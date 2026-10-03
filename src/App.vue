<template>
  <div class="app-wrapper">
    <AppNavigation />
    <main class="main-content">
      <router-view />
    </main>
    <footer class="footer">
      <div class="container">
        <div class="footer-content">
          <span>© {{ new Date().getFullYear() }} Lord's Recovery Church - Pakistan</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import AppNavigation from './components/AppNavigation.vue'
</script>
<style scoped>
.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.main-content {
  flex: 1;
  background: var(--bg-primary);
}

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
  pointer-events: none;
}

.hero-section::after {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -5%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, var(--accent-light) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
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

/* Footer */
.footer {
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  padding: 24px 0;
  margin-top: auto;
}

.footer-content {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
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
