<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('CountdownView');
</script>

<template>
    <section v-if="isMeetingDay && activeTab === 'countdown'" class="theater-section" aria-labelledby="theater-title">
      <span
        v-for="light in theaterLights"
        :key="light.id"
        class="theater-light"
        :style="{ left: light.left, top: light.top, animationDelay: light.delay }"
        aria-hidden="true"
      ></span>
      <p class="eyebrow">8 月 14 日劇場</p>
      <h1 id="theater-title">等待落地，故事開場</h1>
      <p>從台南到上海，從螢幕到眼前，所有倒數都在這一天變成真的。</p>
    </section>

    <section v-show="activeTab === 'countdown'" class="hero-section" aria-labelledby="countdown-title">
      <p class="eyebrow">第一次見面倒數</p>
      <h1 id="countdown-title">
        {{ isMeetingDay ? targetDateShortLabel : `${displayGirlName} 飛向 ${displayBoyName}` }}
      </h1>

      <div v-if="isMeetingDay" class="arrival-message">
        等待結束，故事正式開始 ❤️
      </div>

      <div v-else class="countdown-grid" :aria-label="`距離 ${targetDateLabel} 的倒數`">
        <div :class="{ flipping: flipUnits.includes('days') }">
          <strong>{{ countdown.days }}</strong>
          <span>天</span>
        </div>
        <div :class="{ flipping: flipUnits.includes('hours') }">
          <strong>{{ countdown.hours }}</strong>
          <span>小時</span>
        </div>
        <div :class="{ flipping: flipUnits.includes('minutes') }">
          <strong>{{ countdown.minutes }}</strong>
          <span>分鐘</span>
        </div>
        <div>
          <strong>{{ countdown.seconds }}</strong>
          <span>秒</span>
        </div>
      </div>

      <p class="daily-line">{{ todayNote }}</p>
      <p class="target-time">目標時間：{{ targetDateLabel }}</p>
      <p class="target-time">開始時間：{{ startDateLabel }}</p>
      <p class="welcome-line">{{ settings.welcomeLine }}</p>
    </section>

    <section v-if="isArrivalMode" v-show="activeTab === 'countdown'" class="arrival-mode-section" aria-labelledby="arrival-mode-title">
      <div>
        <p class="section-kicker">最後 {{ daysUntilMeeting }} 天</p>
        <h2 id="arrival-mode-title">抵達模式已啟動</h2>
      </div>
      <div class="arrival-ready-ring">
        <strong>{{ arrivalReadyPercent }}%</strong>
        <span>準備完成</span>
      </div>
      <div class="arrival-mode-grid">
        <span v-for="step in arrivalSteps" :key="step.label" :class="{ done: step.done }">
          {{ step.done ? '✓' : '+' }} {{ step.label }}
        </span>
      </div>
    </section>

    <section v-show="activeTab === 'countdown'" class="flight-section" aria-label="台南飛向上海">
      <div class="section-heading">
        <span>台南</span>
        <span>{{ progressPercent }}%</span>
        <span>上海</span>
      </div>

      <div class="flight-map" :class="{ 'milestone-wave': milestoneFlash }">
        <div class="map-texture"></div>
        <span class="plane-trail" :style="planeTrailStyle" aria-hidden="true"></span>
        <span class="map-cloud cloud-one" aria-hidden="true"></span>
        <span class="map-cloud cloud-two" aria-hidden="true"></span>
        <span class="map-glint glint-one" aria-hidden="true"></span>
        <span class="map-glint glint-two" aria-hidden="true"></span>
        <svg class="route-svg" viewBox="0 0 320 190" role="img" aria-label="從台南飛往上海的航線">
          <path class="route-shadow" d="M43 139 C105 87, 178 48, 278 47" />
          <path class="route-line" d="M43 139 C105 87, 178 48, 278 47" />
          <circle class="city-dot start" cx="43" cy="139" r="6" />
          <circle class="city-dot end" cx="278" cy="47" r="6" />
        </svg>
        <div class="city-label tainan">台南</div>
        <div class="city-label shanghai">上海</div>
        <button
          class="plane"
          :class="{ dragging: planeDrag.dragging }"
          :style="planeStyle"
          type="button"
          aria-label="讓小飛機撒一點星光"
          @click="launchSparkles"
          @pointerdown="startPlaneDrag"
          @pointermove="movePlaneDrag"
          @pointerup="endPlaneDrag"
          @pointerleave="endPlaneDrag"
          @pointercancel="endPlaneDrag"
        >
          <svg viewBox="0 0 64 64" focusable="false">
            <polygon points="7,32 57,10 43,56 31,39 17,47" fill="currentColor" />
            <polyline points="57,10 31,39 43,56" fill="none" stroke="#fffaf7" stroke-linecap="round" stroke-linejoin="round" stroke-width="5" />
            <polygon points="17,47 31,39 24,35" fill="#1b2538" opacity=".24" />
          </svg>
          <span
            v-for="sparkle in sparkles"
            :key="sparkle.id"
            class="sparkle"
            :style="{ '--spark-x': `${sparkle.x}px`, '--spark-y': `${sparkle.y}px` }"
            aria-hidden="true"
          ></span>
        </button>
      </div>

      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" :style="routeFillStyle"></div>
      </div>

      <div class="closeness-panel">
        <div>
          <p class="section-kicker">靠近度</p>
          <strong>{{ closenessLabel }}</strong>
        </div>
        <span>{{ progressPercent }}%</span>
      </div>

    </section>

    <section v-show="activeTab === 'countdown'" class="journey-summary-section" aria-labelledby="journey-summary-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">旅程總覽</p>
          <h2 id="journey-summary-title">把靠近的證據收成一束光</h2>
        </div>
        <button class="ghost-button" type="button" @click="exportMeetingCalendar">加入行事曆</button>
      </div>
      <div class="summary-grid">
        <article v-for="item in meetingSummary" :key="item.label">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </div>
      <p class="summary-line">{{ meetingSummaryLine }}</p>
    </section>

    <section v-show="activeTab === 'countdown'" class="pwa-status-section" aria-labelledby="pwa-title">
      <div>
        <p class="section-kicker">PWA 狀態</p>
        <h2 id="pwa-title">{{ isOnline ? '目前在線上' : '目前離線' }}</h2>
      </div>
      <div class="offline-cosmos" :class="{ online: isOnline }">
        <span aria-hidden="true"></span>
        <strong>{{ isOnline ? '同步小宇宙在線' : '離線小宇宙已啟動' }}</strong>
        <p>{{ isOnline ? '照片、設定和今日狀態可以繼續同步。' : '倒數、回憶、設定仍可打開，網路回來後再同步。' }}</p>
      </div>
      <div class="install-guide-card" :class="{ installed: installedDisplayMode }">
        <strong>{{ pwaInstallGuide.title }}</strong>
        <p>{{ pwaInstallGuide.text }}</p>
        <ol v-if="pwaInstallGuide.steps.length">
          <li v-for="step in pwaInstallGuide.steps" :key="step">{{ step }}</li>
        </ol>
      </div>
      <p>{{ isOnline ? '安裝後也可以離線打開，等網路回來會繼續更新。' : '已離線，仍可以打開已快取的倒數頁。' }}</p>
      <button v-if="installReady && !installedDisplayMode" class="soft-button" type="button" @click="installApp">安裝到手機</button>
      <button v-if="updateReady" class="ghost-button" type="button" @click="refreshForUpdate">套用最新版本</button>
    </section>
</template>
