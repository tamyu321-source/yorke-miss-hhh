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

      <div class="flight-map-stage" :class="{ 'is-global-flight': planeInGlobalFlight }">
      <div class="flight-map" :class="flightMapClass">
        <div class="map-texture"></div>
        <span class="plane-trail" :style="planeTrailStyle" aria-hidden="true"></span>
        <span class="map-cloud cloud-one" aria-hidden="true"></span>
        <span class="map-cloud cloud-two" aria-hidden="true"></span>
        <span class="map-glint glint-one" aria-hidden="true"></span>
        <span class="map-glint glint-two" aria-hidden="true"></span>
        <svg class="route-svg" viewBox="0 0 320 190" preserveAspectRatio="none" role="img" aria-label="從台南飛往上海的航線">
          <defs>
            <mask id="map-water-mask" maskUnits="userSpaceOnUse">
              <rect width="320" height="190" fill="white" />
              <path
                v-for="land in mapLandMasses"
                :key="`${land.id}-water-mask`"
                :d="land.path"
                fill="black"
              />
              <circle
                v-for="island in mapIslandMarkers"
                :key="`${island.id}-water-mask`"
                :cx="island.x"
                :cy="island.y"
                :r="island.radius + 1.4"
                fill="black"
              />
            </mask>
          </defs>
          <g class="map-water-layer" mask="url(#map-water-mask)" aria-hidden="true">
            <path
              v-for="line in mapWaterWaveLines"
              :key="line.id"
              class="map-water-wave"
              :d="line.d"
              :style="{ animationDelay: line.delay }"
            />
          </g>
          <path
            v-for="land in mapLandMasses"
            :key="land.id"
            class="map-land"
            :class="`is-${land.id}`"
            :d="land.path"
          >
            <title>{{ land.label }}</title>
          </path>
          <path
            v-for="line in mapGridLines"
            :key="line.id"
            class="map-grid-line"
            :d="line.d"
          >
            <title>{{ line.label }}</title>
          </path>
          <circle
            v-for="island in mapIslandMarkers"
            :key="island.id"
            class="map-island"
            :cx="island.x"
            :cy="island.y"
            :r="island.radius"
          >
            <title>{{ island.label }}</title>
          </circle>
          <path class="route-shadow" :d="flightRoutePath" />
          <path class="route-line" :d="flightRoutePath" />
          <circle
            v-for="city in mapCityMarkers"
            :key="city.id"
            class="city-dot"
            :class="city.kind"
            :cx="city.point.x"
            :cy="city.point.y"
            r="6"
          >
            <title>{{ city.label }} {{ city.caption }}</title>
          </circle>
        </svg>
        <span
          v-for="stop in mapRouteStopMarkers"
          :key="stop.id"
          class="route-stop"
          :style="stop.style"
          aria-hidden="true"
        >
          {{ stop.label }}
        </span>
        <div
          v-for="city in mapCityMarkers"
          :key="`${city.id}-label`"
          class="city-label"
          :class="city.id"
          :style="city.labelStyle"
        >
          <strong>{{ city.label }}</strong>
          <span>{{ city.caption }}</span>
        </div>
        <div class="map-progress-badge" :style="{ left: `${activeRoutePercent.x}%`, top: `${activeRoutePercent.y}%` }">
          {{ progressPercent }}%
        </div>
      </div>
        <button
          class="plane map-plane"
          :class="{ 'home-plane-hidden': planeInGlobalFlight, 'home-plane-capturing': planeDrag.dragging }"
          :style="planeHomeStyle"
          type="button"
          aria-label="讓小飛機撒一點星光"
          @click="launchSparkles"
          @mousedown="startPlaneMouseDrag"
          @pointerdown="startPlaneDrag"
          @pointermove="movePlaneDrag"
          @pointerup="endPlaneDrag"
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

      <Teleport to="body">
        <div
          v-if="planeInGlobalFlight"
          class="flight-geo-overlay"
          :class="[flightOverlayClass, themeClass]"
          aria-hidden="true"
        >
          <svg class="flight-geo-svg" :viewBox="flightOverlayViewBox" preserveAspectRatio="none">
            <defs>
              <mask id="flight-water-mask" maskUnits="userSpaceOnUse">
                <rect width="100%" height="100%" fill="white" />
                <path
                  v-for="land in flightOverlayLandMasses"
                  :key="`${land.id}-flight-water-mask`"
                  :d="land.path"
                  fill="black"
                />
                <circle
                  v-for="island in flightOverlayIslandMarkers"
                  :key="`${island.id}-flight-water-mask`"
                  :cx="island.x"
                  :cy="island.y"
                  :r="island.radius + 2"
                  fill="black"
                />
              </mask>
            </defs>
            <g class="geo-water-layer" mask="url(#flight-water-mask)" aria-hidden="true">
              <path
                v-for="line in flightOverlayWaterWaveLines"
                :key="line.id"
                class="geo-water-wave"
                :d="line.d"
                :style="{ animationDelay: line.delay }"
              />
            </g>
            <path
              v-for="line in flightOverlayGridLines"
              :key="line.id"
              class="geo-grid-line"
              :d="line.d"
            />
            <path
              v-for="land in flightOverlayLandMasses"
              :key="land.id"
              class="geo-land"
              :class="`is-${land.id}`"
              :d="land.path"
            />
            <circle
              v-for="island in flightOverlayIslandMarkers"
              :key="island.id"
              class="geo-island"
              :cx="island.x"
              :cy="island.y"
              :r="island.radius"
            />
            <path class="geo-route-shadow" :d="flightOverlayRoutePath" />
            <path class="geo-route-line" :d="flightOverlayRoutePath" />
            <circle
              v-for="city in flightOverlayCityMarkers"
              :key="city.id"
              class="geo-city"
              :class="city.kind"
              :cx="city.point.x"
              :cy="city.point.y"
              r="8"
            />
            <circle class="geo-plane-pulse pulse-wide" :cx="planeDrag.screenX" :cy="planeDrag.screenY" r="34" />
            <circle class="geo-plane-pulse" :cx="planeDrag.screenX" :cy="planeDrag.screenY" r="18" />
          </svg>
          <div class="flight-geo-readout" :style="planeZoneHintStyle">
            {{ planeGeoReadout }}
          </div>
        </div>

        <button
          v-if="planeInGlobalFlight"
          class="plane viewport-plane"
          :class="[planeFlightClass, themeClass]"
          :style="planeStyle"
          type="button"
          aria-label="讓小飛機在整個螢幕飛行"
          @click="launchSparkles"
          @mousedown="startPlaneMouseDrag"
          @pointerdown="startPlaneDrag"
          @pointermove="movePlaneDrag"
          @pointerup="endPlaneDrag"
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
      </Teleport>

      <Teleport to="body">
        <div
          v-if="planeDrag.dragging"
          class="flight-zone-hint"
          :class="[`zone-${planeDrag.zone}`, themeClass]"
          :style="planeZoneHintStyle"
          aria-hidden="true"
        >
          {{ planeZoneLabel }}
        </div>

        <div
          v-if="flightLandingEffect"
          :key="flightLandingEffect.id"
          class="flight-landing-effect"
          :class="[`zone-${flightLandingEffect.zone}`, themeClass]"
          :style="{ left: `${flightLandingEffect.x}px`, top: `${flightLandingEffect.y}px` }"
          aria-hidden="true"
        >
          <span></span>
          <strong>{{ flightLandingEffect.label }}</strong>
          <em>{{ flightLandingEffect.detail }}</em>
        </div>
      </Teleport>

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
