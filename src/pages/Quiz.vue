<template>
  <div class="quiz-page">
    <div class="quiz-container">
      <header class="quiz-header">
        <h1 class="quiz-title">Bible Quiz</h1>
        <p class="quiz-sub">Test what you know, and read the reference for every answer.</p>
      </header>

      <p v-if="loading" class="quiz-status" role="status">Loading questions...</p>

      <!-- "No questions" and "could not load" are different facts and are shown
           differently. Neither blames the visitor. -->
      <section v-else-if="problem" class="quiz-notice glass-card">
        <div class="quiz-notice-icon" aria-hidden="true">📖</div>
        <h2 class="quiz-notice-title">{{ emptyCopy.title }}</h2>
        <p class="quiz-notice-text">{{ emptyCopy.text }}</p>
      </section>

      <template v-else>
        <div class="quiz-controls">
          <nav class="quiz-tabs" aria-label="Testament">
            <button
              v-for="t in TESTAMENTS"
              :key="t"
              type="button"
              class="quiz-tab"
              :class="{ 'is-active': testament === t }"
              :aria-pressed="testament === t"
              @click="setTestament(t)"
            >{{ t }}</button>
          </nav>

          <nav class="quiz-tabs" aria-label="Quiz language">
            <button
              v-for="l in QUIZ_LANGUAGES"
              :key="l"
              type="button"
              class="quiz-tab"
              :class="{ 'is-active': language === l }"
              :aria-pressed="language === l"
              @click="setLanguage(l)"
            >{{ langLabel(l) }}</button>
          </nav>
        </div>

        <section v-if="!session.length" class="quiz-notice glass-card">
          <p class="quiz-notice-title">Nothing to ask yet</p>
          <p class="quiz-notice-text">
            There are no {{ testament }} questions in {{ langLabel(language) }} yet.
            Try the other section or language.
          </p>
        </section>

        <template v-else>
          <!-- aria-live so the score is announced as it changes. -->
          <p class="quiz-score" role="status" aria-live="polite">
            Question {{ index + 1 }} of {{ session.length }} &middot;
            Score {{ score }} / {{ session.length }}
          </p>

          <section class="quiz-card glass-card">
            <p class="quiz-question" :class="scriptClass(language)">
              {{ current.question }}
            </p>

            <ul class="quiz-options">
              <li v-for="(opt, i) in current.options" :key="`opt-${i}`">
                <button
                  type="button"
                  class="quiz-option"
                  :class="optionClass(i)"
                  :disabled="answered"
                  @click="choose(i)"
                >
                  <span class="quiz-option-mark" aria-hidden="true">{{ markFor(i) }}</span>
                  <span class="quiz-option-text" :class="scriptClass(language)">{{ opt }}</span>
                </button>
              </li>
            </ul>

            <!-- Feedback appears only after an answer, never before. -->
            <div
              v-if="answered"
              class="quiz-feedback"
              :class="wasCorrect ? 'is-right' : 'is-wrong'"
            >
              <p class="quiz-verdict">
                <span aria-hidden="true">{{ wasCorrect ? '✓' : '✕' }}</span>
                {{ wasCorrect ? 'Correct' : 'Not quite' }}
              </p>
              <p class="quiz-explanation">
                {{ current.explanation || `The correct answer is: ${current.options[current.correctAnswerIndex]}` }}
              </p>
            </div>
          </section>

          <div class="quiz-actions">
            <button type="button" class="quiz-btn" @click="reset">Start over</button>
            <button
              v-if="answered"
              type="button"
              class="quiz-btn quiz-btn-primary"
              @click="next"
            >{{ index + 1 >= session.length ? 'See result' : 'Next question' }}</button>
          </div>

          <section v-if="finished" class="quiz-result glass-card">
            <h2 class="quiz-result-title">
              {{ score === session.length ? 'Perfect score' : 'Quiz complete' }}
            </h2>
            <p class="quiz-result-score">
              You answered {{ score }} of {{ session.length }} correctly.
            </p>
            <p class="quiz-result-text">{{ resultLine }}</p>
          </section>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  fetchQuizQuestions,
  questionsFor,
  normaliseQuestion,
  TESTAMENTS,
  QUIZ_LANGUAGES,
  QUIZ_EMPTY_COPY
} from '../js/appsService.js'
import { scriptClass, getLanguage } from '../js/hymnService.js'

const questions = ref([])
const loading = ref(true)
const problem = ref('')

const testament = ref(TESTAMENTS[0])
const language = ref('english')

/** Index of the chosen option, or null while the question is unanswered. */
const chosen = ref(null)
const index = ref(0)
const score = ref(0)
const finished = ref(false)

function langLabel(key) {
  return getLanguage(key)?.label || key
}

const emptyCopy = computed(
  () => QUIZ_EMPTY_COPY[problem.value] || QUIZ_EMPTY_COPY.unknown
)

/** Questions for the chosen section + language, re-validated on the way in. */
const session = computed(() =>
  questionsFor(questions.value, testament.value)
    .filter((q) => q.language === language.value)
    .map((q) => normaliseQuestion(q) || q)
    .filter((q) => q && q.options?.length)
)

const current = computed(() => session.value[index.value] || null)
const answered = computed(() => chosen.value !== null)
const wasCorrect = computed(() => chosen.value === current.value?.correctAnswerIndex)

function optionClass(i) {
  if (!answered.value) return ''
  const q = current.value
  if (i === q.correctAnswerIndex) return 'is-correct'
  if (i === chosen.value) return 'is-wrong'
  return 'is-dimmed'
}

function markFor(i) {
  const letter = 'ABCD'[i] || String(i + 1)
  if (!answered.value) return letter
  const q = current.value
  if (i === q.correctAnswerIndex) return '✓'
  if (i === chosen.value) return '✕'
  return letter
}

function choose(i) {
  // Locked after the first answer: otherwise the score would depend on how many
  // times someone changed their mind.
  if (answered.value || !current.value) return
  chosen.value = i
  if (i === current.value.correctAnswerIndex) score.value += 1
}

function next() {
  if (!answered.value) return
  if (index.value + 1 >= session.value.length) {
    finished.value = true
    return
  }
  index.value += 1
  chosen.value = null
}

function reset() {
  index.value = 0
  chosen.value = null
  score.value = 0
  finished.value = false
}

function setTestament(t) {
  testament.value = t
  reset()
}

function setLanguage(l) {
  language.value = l
  reset()
}

const resultLine = computed(() => {
  const total = session.value.length || 1
  const pct = Math.round((score.value / total) * 100)
  if (pct === 100) return 'A flawless round - well done.'
  if (pct >= 80) return 'A strong result. A few to revisit.'
  if (pct >= 50) return 'A fair start - keep going.'
  return 'Worth another read through the chapters involved.'
})

async function load() {
  loading.value = true
  problem.value = ''
  try {
    const result = await fetchQuizQuestions()
    questions.value = result.questions
    if (result.problem) problem.value = result.problem
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.quiz-page { padding: 40px 0 64px; }

.quiz-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px;
}

.quiz-header { text-align: center; margin-bottom: 26px; }

.quiz-title {
  margin: 0 0 8px;
  font-size: 2rem;
  font-weight: 800;
  color: var(--text-primary);
}

.quiz-sub { margin: 0; color: var(--text-secondary); }

.quiz-status { text-align: center; color: var(--text-secondary); }

.quiz-notice {
  padding: 30px 24px;
  text-align: center;
  border-radius: 20px;
}

.quiz-notice-icon { font-size: 40px; margin-bottom: 10px; }

.quiz-notice-title {
  margin: 0 0 8px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.quiz-notice-text {
  margin: 0 auto;
  max-width: 48ch;
  color: var(--text-secondary);
  line-height: 1.6;
}

.quiz-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  margin-bottom: 18px;
}

.quiz-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.quiz-tab {
  min-height: 42px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary, rgba(127, 127, 127, 0.08));
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.quiz-tab.is-active {
  background: rgba(79, 124, 255, 0.18);
  border-color: var(--primary-color, #4f7cff);
}

.quiz-score {
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.quiz-card { padding: 26px; border-radius: 20px; }

.quiz-question {
  margin: 0 0 20px;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.5;
  color: var(--text-primary);
}

.quiz-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.quiz-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 15px;
  border-radius: 11px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary, rgba(127, 127, 127, 0.08));
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.quiz-option:hover:not(:disabled) { background: rgba(127, 127, 127, 0.16); }

.quiz-option:disabled { cursor: default; }

.quiz-option-mark {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(127, 127, 127, 0.2);
  font-size: 0.82rem;
  font-weight: 700;
}

.quiz-option.is-correct {
  border-color: #16a34a;
  background: rgba(22, 163, 74, 0.14);
}

.quiz-option.is-correct .quiz-option-mark { background: #16a34a; color: #fff; }

.quiz-option.is-wrong {
  border-color: #dc2626;
  background: rgba(220, 38, 38, 0.12);
}

.quiz-option.is-wrong .quiz-option-mark { background: #dc2626; color: #fff; }

.quiz-option.is-dimmed { opacity: 0.5; }

.quiz-feedback {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 12px;
  border-left: 3px solid;
}

.quiz-feedback.is-right { border-color: #16a34a; background: rgba(22, 163, 74, 0.1); }
.quiz-feedback.is-wrong { border-color: #dc2626; background: rgba(220, 38, 38, 0.08); }

.quiz-verdict {
  margin: 0 0 6px;
  font-weight: 700;
  color: var(--text-primary);
}

.quiz-explanation {
  margin: 0;
  font-size: 0.92rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.quiz-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

.quiz-btn {
  min-height: 42px;
  padding: 9px 18px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.quiz-btn-primary {
  background: var(--primary);
  color: #fff;
  border-color: transparent;
}

.quiz-result {
  margin-top: 20px;
  padding: 26px;
  text-align: center;
  border-radius: 20px;
}

.quiz-result-title {
  margin: 0 0 8px;
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-primary);
}

.quiz-result-score { margin: 0 0 6px; color: var(--text-primary); }

.quiz-result-text { margin: 0; color: var(--text-secondary); }
</style>