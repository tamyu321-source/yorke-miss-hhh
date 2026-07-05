<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('AppShellEffects');
</script>

<template>
    <div v-if="themeTransition" class="theme-transition-layer" aria-hidden="true"></div>
    <div class="burst-layer" aria-hidden="true">
      <span
        v-for="particle in burstParticles"
        :key="particle.id"
        class="theme-burst"
        :style="{ '--burst-x': `${particle.x}px`, '--burst-y': `${particle.y}px`, animationDelay: particle.delay }"
      ></span>
    </div>
    <div v-if="updateReady" class="pwa-update-toast" role="status">
      <span aria-hidden="true"></span>
      <div>
        <strong>新版本準備好了</strong>
        <p>套用後會帶著最新動畫重新打開。</p>
      </div>
      <button type="button" @click="refreshForUpdate">更新</button>
      <button type="button" aria-label="稍後再說" @click="dismissUpdateToast">×</button>
    </div>
    <div v-if="onboardingVisible && !introActive" class="onboarding-layer" role="dialog" aria-label="快速導覽">
      <article v-for="step in onboardingSteps" :key="step.title">
        <span aria-hidden="true"></span>
        <strong>{{ step.title }}</strong>
        <p>{{ step.text }}</p>
      </article>
      <button class="soft-button" type="button" @click="dismissOnboarding">開始使用</button>
    </div>

    <button
      v-if="appUnlocked && introActive"
      class="opening-sequence"
      :class="[`opening-${introMode}`, { closing: introClosing }]"
      type="button"
      aria-label="進入第一次見面倒數"
      @click="requestFinishOpening"
    >
      <span class="opening-grid"></span>
      <span class="opening-scan"></span>
      <span class="opening-flare"></span>
      <span class="opening-finale" aria-hidden="true"></span>
      <span
        v-for="star in openingStars"
        :key="star.id"
        class="opening-star"
        :style="{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay }"
      ></span>
      <span class="opening-orbit opening-orbit-one"></span>
      <span class="opening-orbit opening-orbit-two"></span>
      <span class="opening-orbit opening-orbit-three"></span>
      <span class="opening-plane" aria-hidden="true">
        <svg viewBox="0 0 64 64" focusable="false">
          <polygon points="7,32 57,10 43,56 31,39 17,47" fill="currentColor" />
          <polyline points="57,10 31,39 43,56" fill="none" stroke="rgba(255,255,255,.82)" stroke-linecap="round" stroke-linejoin="round" stroke-width="5" />
        </svg>
      </span>
      <span class="opening-copy">
        <span>第一次見面倒數</span>
        <strong>{{ displayGirlName }} 飛向 {{ displayBoyName }}</strong>
        <em>{{ progressPercent }}% {{ openingThemeLabel }}</em>
        <span class="opening-chapters" aria-hidden="true">
          <i v-for="chapter in openingChapters" :key="chapter">{{ chapter }}</i>
        </span>
        <span class="opening-status" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </span>
      </span>
    </button>

    <div class="motion-sky" aria-hidden="true">
      <span class="aurora aurora-one"></span>
      <span class="aurora aurora-two"></span>
      <span class="orbit-ring orbit-one"></span>
      <span class="orbit-ring orbit-two"></span>
      <span v-for="beam in backgroundBeams" :key="`beam-${beam.id}`" class="sky-beam" :style="{ left: beam.left, animationDelay: beam.delay }"></span>
      <span
        v-for="mote in backgroundMotes"
        :key="`mote-${mote.id}`"
        class="sky-mote"
        :style="{ left: mote.left, top: mote.top, width: mote.size, height: mote.size, animationDelay: mote.delay }"
      ></span>
      <span class="sky-vortex"></span>
      <span v-for="light in theaterLights" :key="`sky-${light.id}`" class="sky-star" :style="{ left: light.left, top: light.top, animationDelay: light.delay }"></span>
    </div>


    <div v-if="appUnlocked && !introActive && activeTab !== 'prepare'" class="global-quick-actions">
      <button
        class="theme-discovery"
        type="button"
        aria-label="前往主題切換"
        @click="openThemeSettings"
      >
        <span aria-hidden="true"></span>
        換氛圍
      </button>
      <button
        class="music-discovery"
        :class="{ active: settings.backgroundMusic }"
        type="button"
        :aria-label="backgroundMusicAriaLabel"
        :aria-pressed="settings.backgroundMusic"
        @click="toggleBackgroundMusic"
      >
        <span aria-hidden="true"></span>
        {{ backgroundMusicLabel }}
      </button>
    </div>
</template>
