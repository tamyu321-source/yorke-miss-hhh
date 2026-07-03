<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('TodayView');
</script>

<template>
    <section v-show="activeTab === 'today'" class="today-mode-section" aria-labelledby="today-mode-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">今日模式</p>
          <h2 id="today-mode-title">今天先看這三件事</h2>
        </div>
        <button class="ghost-button" type="button" @click="resetToday">重置今日</button>
      </div>
      <div class="today-focus-list">
        <article>
          <span>文案</span>
          <p>{{ todayNote }}</p>
        </article>
        <article>
          <span>任務</span>
          <p>{{ todayTask }}</p>
        </article>
        <article>
          <span>問題</span>
          <p>{{ todayQuestion.prompt }}</p>
        </article>
      </div>
    </section>

    <section v-show="activeTab === 'today'" class="ritual-section" aria-labelledby="ritual-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">今日開封</p>
          <h2 id="ritual-title">{{ ritualComplete ? '今天已經被好好收起來' : '把今天一格一格打開' }}</h2>
        </div>
        <span class="date-pill">{{ ritualProgress }}%</span>
      </div>
      <button class="wide-soft-button" :class="{ completed: ritualOpened }" type="button" @click="openTodayRitual">
        {{ ritualOpened ? '今日文案已開封' : '開封今日文案' }}
      </button>
      <div class="ritual-steps">
        <span v-for="step in ritualSteps" :key="step.id" :class="{ done: step.done }">
          {{ step.done ? '✓' : '+' }} {{ step.label }}
        </span>
      </div>
      <button class="ghost-button ritual-finish" type="button" :disabled="ritualProgress < 100" @click="completeTodayRitual">
        {{ ritualComplete ? '已生成今日小票' : '完成今日儀式' }}
      </button>
      <div class="daily-receipt">
        <pre>{{ dailyReceipt }}</pre>
        <button class="soft-button" type="button" @click="copyDailyReceipt">
          {{ shareCopied ? '已複製' : '複製今日小票' }}
        </button>
      </div>
    </section>

    <section v-if="isScamRadarDay" v-show="activeTab === 'today'" class="radar-section" aria-labelledby="radar-title">
      <div>
        <p class="section-kicker">防詐雷達</p>
        <h2 id="radar-title">{{ dateKey === '2026-04-19' ? '第一次掃描' : '持續觀察中' }}</h2>
      </div>
      <button class="soft-button" type="button" @click="scanRadar">掃描</button>
      <p v-if="radarScanned">{{ radarResult }}</p>
      <div v-if="radarScanned" class="radar-choices">
        <button
          v-for="choice in radarChoices"
          :key="choice.id"
          class="ghost-button"
          :class="{ selected: radarChoiceId === choice.id }"
          type="button"
          @click="chooseRadar(choice.id)"
        >
          {{ choice.label }}
        </button>
      </div>
      <p v-if="radarChoiceResult">{{ radarChoiceResult }}</p>
    </section>

    <section v-show="activeTab === 'today'" class="checkin-section" aria-labelledby="checkin-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">每日簽到軌跡</p>
          <h2 id="checkin-title">今天也有想你</h2>
        </div>
        <span class="date-pill">連續 {{ checkinStreak }} 天</span>
      </div>
      <button class="wide-soft-button" :class="{ completed: checkedInToday }" type="button" @click="checkInToday">
        {{ checkedInToday ? '今天已留下光點' : '留下今天的光點' }}
      </button>
      <div class="checkin-dots" aria-hidden="true">
        <span v-for="day in journeyDays.length" :key="day" :class="{ active: checkins.includes(formatDateKey(addDays(configuredStartDay, day - 1))) }"></span>
      </div>
    </section>

    <section v-show="activeTab === 'today'" class="fortune-section" aria-labelledby="fortune-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">今日小籤</p>
          <h2 id="fortune-title">{{ fortuneReady ? fortuneTitle : '抽一張今天的籤' }}</h2>
        </div>
        <button class="soft-button" type="button" :disabled="fortuneReady" @click="drawFortune">
          {{ fortuneReady ? '已抽' : '抽籤' }}
        </button>
      </div>
      <p class="fortune-line">{{ fortuneReady ? fortuneLine : '一天只抽一次，讓今天自己說話。' }}</p>
    </section>


    <section v-show="activeTab === 'today'" class="message-section" aria-labelledby="message-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">每日紙飛機</p>
          <h2 id="message-title">寄一句今天的想念</h2>
        </div>
      </div>
      <textarea v-model="dailyMessage" maxlength="80" placeholder="今天的紙飛機"></textarea>
      <div class="message-actions">
        <span>{{ dailyMessage.length }} / 80</span>
        <div>
          <button class="ghost-button" type="button" @click="clearDailyMessage">清空</button>
          <button class="soft-button" type="button" @click="saveDailyMessage">保存</button>
        </div>
      </div>
      <p class="paper-note">{{ savedMessageLine }}</p>
    </section>

    <section v-show="activeTab === 'today'" class="question-section" aria-labelledby="question-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">每日問題卡</p>
          <h2 id="question-title">{{ todayQuestion.prompt }}</h2>
        </div>
      </div>
      <p class="question-hint">{{ todayQuestion.hint }}</p>
      <textarea v-model="dailyAnswer" maxlength="120" placeholder="把今天的答案留在這裡"></textarea>
      <div class="message-actions">
        <span>{{ dailyAnswer.length }} / 120</span>
        <div>
          <button class="ghost-button" type="button" @click="clearDailyAnswer">清空</button>
          <button class="soft-button" type="button" @click="saveDailyAnswer">保存</button>
        </div>
      </div>
    </section>


    <section v-show="activeTab === 'today'" class="mood-section" aria-labelledby="mood-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">今日心情天氣</p>
          <h2 id="mood-title">{{ selectedMood ? selectedMood.label : '選一種今天的天氣' }}</h2>
        </div>
      </div>
      <div class="mood-options">
        <button
          v-for="mood in moodOptions"
          :key="mood.id"
          class="mood-button"
          :class="{ active: selectedMoodId === mood.id }"
          type="button"
          @click="selectMood(mood.id)"
        >
          <span>{{ mood.icon }}</span>
          <strong>{{ mood.label }}</strong>
        </button>
      </div>
      <p class="mood-line">{{ selectedMoodLine }}</p>
      <div class="mood-bottle" aria-label="心情瓶">
        <p class="section-kicker">心情瓶</p>
        <div class="bottle-glass">
          <span
            v-for="dot in moodBottleDots"
            :key="dot.id"
            class="bottle-dot"
            :class="`mood-dot-${dot.moodId}`"
            :style="{ left: dot.left, bottom: dot.bottom }"
          ></span>
        </div>
        <p>已收進 {{ moodHistory.length }} 顆心情光點</p>
      </div>
    </section>

    <section v-show="activeTab === 'today'" class="secret-section" aria-labelledby="secret-title">
      <div>
        <p class="section-kicker">悄悄話</p>
        <h2 id="secret-title">藏起來的一句話</h2>
      </div>
      <button
        class="secret-button"
        :class="{ charging: secretPressing }"
        type="button"
        @pointerdown="startSecretPress"
        @pointerup="cancelSecretPress"
        @pointerleave="cancelSecretPress"
        @pointercancel="cancelSecretPress"
      >
        <span class="secret-charge" aria-hidden="true"></span>
        {{ secretRevealed ? secretWhisper : '信封未開' }}
      </button>
      <button v-if="secretRevealed" class="ghost-button secret-mail-button" type="button" :disabled="secretMailed" @click="mailSecret">
        {{ secretMailed ? '已收進信封' : '收進信封' }}
      </button>
    </section>

    <section v-show="activeTab === 'today'" class="task-section" aria-labelledby="task-title">
      <div>
        <p class="section-kicker">今日小任務</p>
        <h2 id="task-title">{{ todayTask }}</h2>
      </div>
      <button class="task-button" :class="{ completed: taskCompleted }" type="button" @click="toggleTask">
        <span class="checkmark" aria-hidden="true">✓</span>
        <span>{{ taskCompleted ? '已完成' : '完成' }}</span>
      </button>
    </section>
</template>
