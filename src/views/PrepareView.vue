<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('PrepareView');
</script>

<template>
    <section v-show="activeTab === 'prepare'" class="settings-section" aria-labelledby="settings-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">個人化</p>
          <h2 id="settings-title">把這個倒數調成你們的樣子</h2>
        </div>
      </div>
      <div class="settings-grid">
        <label>
          <span>女主角</span>
          <input v-model="settingsDraft.girlName" maxlength="18" />
        </label>
        <label>
          <span>男主角</span>
          <input v-model="settingsDraft.boyName" maxlength="18" />
        </label>
        <label>
          <span>開始日期</span>
          <input v-model="settingsDraft.startDate" type="date" />
        </label>
        <label>
          <span>開始時間</span>
          <input v-model="settingsDraft.startTime" type="time" step="60" />
        </label>
        <label>
          <span>目標日期</span>
          <input v-model="settingsDraft.targetDate" type="date" />
        </label>
        <label>
          <span>目標時間</span>
          <input v-model="settingsDraft.targetTime" type="time" step="60" />
        </label>
      </div>
      <div class="date-timeline-control">
        <div>
          <span>{{ settingsDraft.startDate }}</span>
          <strong>{{ targetOffsetDays }} 天後見面</strong>
          <span>{{ settingsDraft.targetDate }}</span>
        </div>
        <label>
          <span :style="targetTimelineStyle" aria-hidden="true"></span>
          <input v-model.number="targetOffsetDays" type="range" min="1" :max="targetOffsetMax" />
        </label>
      </div>
      <label class="welcome-setting">
        <span>首頁小句子</span>
        <textarea v-model="settingsDraft.welcomeLine" maxlength="42"></textarea>
      </label>
      <div class="theme-guide">
        <span aria-hidden="true"></span>
        <p>想換成暖光、清風或夜航？主題開關藏在這裡。</p>
      </div>
      <div class="theme-picker" aria-label="主題色">
        <button
          v-for="theme in themeOptions"
          :key="theme.id"
          class="ghost-button"
          :class="{ selected: settingsDraft.theme === theme.id }"
          type="button"
          @click="previewThemeSelection(theme.id)"
        >
          {{ theme.label }}
        </button>
      </div>
      <label class="toggle-row">
        <input v-model="settingsDraft.reducedMotion" type="checkbox" />
        <span>減少動畫</span>
      </label>
      <label class="toggle-row">
        <input v-model="settingsDraft.soundFeedback" type="checkbox" />
        <span>互動音效</span>
      </label>
      <div class="settings-actions">
        <button class="soft-button" type="button" @click="saveSettings">保存設定</button>
        <button class="ghost-button" type="button" @click="resetSettings">恢復預設</button>
      </div>
    </section>

    <section v-show="activeTab === 'prepare'" class="suitcase-section" aria-labelledby="suitcase-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">小笨蛋行李箱</p>
          <h2 id="suitcase-title">出發前慢慢收好</h2>
        </div>
        <span class="date-pill">{{ suitcaseProgress }}%</span>
      </div>
      <div class="suitcase-grid">
        <button
          v-for="item in suitcaseItems"
          :key="item"
          class="suitcase-item"
          :class="{ packed: suitcaseChecked.includes(item), packing: packingItems.includes(item) }"
          type="button"
          @click="toggleSuitcaseItem(item)"
        >
          <span>{{ suitcaseChecked.includes(item) ? '✓' : '+' }}</span>
          {{ item }}
        </button>
      </div>
    </section>

    <section v-show="activeTab === 'prepare'" class="prep-section" aria-labelledby="prep-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">見面前準備儀表</p>
          <h2 id="prep-title">慢慢把自己準備好</h2>
        </div>
      </div>
      <div class="prep-list">
        <div v-for="stat in preparationStats" :key="stat.label" class="prep-meter">
          <div>
            <span>{{ stat.label }}</span>
            <strong>{{ stat.value }}%</strong>
          </div>
          <div class="prep-track">
            <span :style="{ width: `${stat.value}%` }"></span>
          </div>
        </div>
      </div>
    </section>

    <section v-show="activeTab === 'prepare'" class="meeting-plan-section" aria-labelledby="meeting-plan-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">見面留白卡</p>
          <h2 id="meeting-plan-title">不用排滿，只留幾個想記住的瞬間</h2>
        </div>
        <span class="date-pill">{{ meetingMoments.length }} / {{ meetingMomentItems.length }}</span>
      </div>
      <div class="meeting-moment-list">
        <button
          v-for="item in meetingMomentItems"
          :key="item.id"
          class="meeting-moment"
          :class="{ done: meetingMoments.includes(item.id) }"
          type="button"
          @click="toggleMeetingMoment(item.id)"
        >
          <span>{{ meetingMoments.includes(item.id) ? '✓' : '+' }}</span>
          {{ item.label }}
        </button>
      </div>
    </section>

    <section v-if="isMeetingDay" v-show="activeTab === 'prepare'" class="meeting-checklist-section" aria-labelledby="meeting-checklist-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">見面當天 checklist</p>
          <h2 id="meeting-checklist-title">把今天一格一格點亮</h2>
        </div>
        <span class="date-pill">{{ meetingChecklistProgress }}%</span>
      </div>
      <div class="meeting-list">
        <button
          v-for="item in meetingChecklistItems"
          :key="item"
          class="meeting-item"
          :class="{ done: meetingChecklist.includes(item) }"
          type="button"
          @click="toggleMeetingChecklist(item)"
        >
          <span>{{ meetingChecklist.includes(item) ? '✓' : '+' }}</span>
          {{ item }}
        </button>
      </div>
    </section>

    <section v-show="activeTab === 'prepare'" class="data-tools-section" aria-labelledby="data-tools-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">資料工具</p>
          <h2 id="data-tools-title">備份、匯入與今日清理</h2>
        </div>
      </div>
      <div class="data-actions">
        <button class="soft-button" type="button" @click="exportData">匯出 JSON</button>
        <label class="import-button">
          <input type="file" accept="application/json" @change="importData" />
          匯入 JSON
        </label>
        <button class="soft-button calendar-button" type="button" @click="exportMeetingCalendar">匯出行事曆</button>
        <button class="soft-button" type="button" :disabled="cloudSyncBusy" @click="syncCloudNow(true)">
          {{ cloudSyncBusy ? '同步中' : '同步雲端' }}
        </button>
        <button class="ghost-button" type="button" @click="resetToday">重置今日</button>
        <button class="ghost-button" type="button" @click="lockApp">鎖定</button>
      </div>
      <p class="cloud-sync-note">{{ cloudStatus }}</p>
      <div v-if="pendingImport" class="import-preview">
        <p>{{ pendingImportSummary }}</p>
        <div class="import-mode-row">
          <button class="ghost-button" :class="{ selected: importMode === 'merge' }" type="button" @click="importMode = 'merge'">合併</button>
          <button class="ghost-button" :class="{ selected: importMode === 'replace' }" type="button" @click="importMode = 'replace'">覆蓋</button>
        </div>
        <div class="settings-actions">
          <button class="soft-button" type="button" @click="applyImportData">套用匯入</button>
          <button class="ghost-button" type="button" @click="cancelImportData">取消</button>
        </div>
      </div>
      <p v-if="importMessage" class="empty-photo-note">{{ importMessage }}</p>
    </section>
</template>
