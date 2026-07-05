<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('JourneyView');
</script>

<template>
  <section v-show="activeTab === 'journey'" class="travel-board-section" aria-labelledby="travel-board-title">
    <header class="travel-command-bar">
      <div class="travel-title-group">
        <p class="section-kicker">旅程工作台</p>
        <input
          id="travel-board-title"
          class="travel-title-input"
          :value="activeJourneyTrip?.title ?? '旅程行事曆'"
          aria-label="旅程名稱"
          @change="updateActiveJourneyTitle(getInputValue($event))"
          @blur="updateActiveJourneyTitle(getInputValue($event))"
        />
        <p>{{ activeJourneyDateRange }} · {{ journeyTripCountdownLabel }}</p>
      </div>
      <div class="travel-live-summary" aria-label="旅程狀態">
        <div class="travel-progress-ring" :style="{ '--travel-progress': `${activeJourneyProgress}%` }">
          <strong>{{ activeJourneyProgress }}%</strong>
          <span>完成</span>
        </div>
        <dl>
          <div>
            <dt>路線</dt>
            <dd>{{ activeJourneyRouteLabel }}</dd>
          </div>
          <div>
            <dt>下一站</dt>
            <dd>{{ activeJourneyNextEntry }}</dd>
          </div>
        </dl>
      </div>
    </header>

    <div class="travel-control-strip">
      <select :value="activeJourneyTrip?.id ?? ''" aria-label="選擇旅程" @change="selectJourneyTripFromEvent">
        <option v-for="trip in journeyTripOptions" :key="trip.id" :value="trip.id">
          {{ trip.title }} · {{ formatJourneyDateLabel(trip.startDate) }}
        </option>
      </select>

      <div class="travel-mode-switch" role="tablist" aria-label="旅程檢視">
        <button type="button" :class="{ active: journeyPanelMode === 'schedule' }" @click="journeyPanelMode = 'schedule'">日程</button>
        <button type="button" :class="{ active: journeyPanelMode === 'import' }" @click="journeyPanelMode = 'import'">工具</button>
      </div>

      <div class="travel-trip-actions">
        <span class="travel-sync-pill">{{ journeySyncLabel }}</span>
        <button class="ghost-button" type="button" @click="createBlankJourneyTrip">新增旅程</button>
        <button class="ghost-button" type="button" @click="autoScheduleActiveJourney">自動排時段</button>
        <button class="ghost-button" type="button" @click="exportActiveJourneyCalendar">匯出</button>
      </div>
    </div>

    <div class="travel-stat-grid" aria-label="旅程總覽">
      <article v-for="stat in journeySummaryStats" :key="stat.label">
        <span>{{ stat.label }}</span>
        <strong>{{ stat.value }}</strong>
      </article>
    </div>

    <template v-if="journeyPanelMode === 'schedule'">
      <div class="travel-planner-layout">
        <aside class="travel-day-rail" aria-label="旅程天數">
          <div class="travel-rail-head">
            <div>
              <span>Days</span>
              <strong>{{ activeJourneyMonthLabel }}</strong>
            </div>
            <button class="travel-icon-button" type="button" aria-label="新增一天" @click="addJourneyDay">+</button>
          </div>

          <div class="travel-day-list">
            <button
              v-for="day in journeyDayRailItems"
              :key="day.id"
              type="button"
              class="travel-day-tab"
              :class="{ active: day.isActive, today: day.isToday }"
              @click="selectJourneyDay(day.id)"
            >
              <span>{{ day.dayLabel }}</span>
              <strong>{{ day.city }}</strong>
              <small>{{ day.dateLabel }} · {{ day.total ? `${day.done}/${day.total}` : '待安排' }}</small>
            </button>
          </div>

          <div class="travel-mini-calendar" aria-label="旅程月曆">
            <div class="travel-weekdays" aria-hidden="true">
              <span>一</span>
              <span>二</span>
              <span>三</span>
              <span>四</span>
              <span>五</span>
              <span>六</span>
              <span>日</span>
            </div>
            <div class="travel-calendar-grid">
              <button
                v-for="cell in journeyCalendarCells"
                :key="cell.id"
                type="button"
                :disabled="cell.isBlank"
                :class="{ active: cell.isActive, today: cell.isToday, blank: cell.isBlank }"
                @click="!cell.isBlank && selectJourneyDay(cell.id)"
              >
                <span>{{ cell.dayNumber || '' }}</span>
                <em>{{ cell.city }}</em>
              </button>
            </div>
          </div>
        </aside>

        <article v-if="activeJourneyDay" class="travel-day-workspace">
          <div class="travel-day-panel-head">
            <div>
              <p class="section-kicker">{{ activeJourneyDay.dayLabel }} · {{ formatJourneyDateLabel(activeJourneyDay.date) }}</p>
              <h3>{{ activeJourneyDay.city || '未設定城市' }}</h3>
            </div>
            <span>{{ activeJourneyDayMeta.done }} / {{ activeJourneyDayMeta.entries }}</span>
          </div>

          <div class="travel-day-fields">
            <label>
              <span>日期</span>
              <input
                v-model="activeJourneyDay.date"
                type="date"
                @input="queueJourneyTripsSave"
                @change="updateJourneyDayField(activeJourneyDay.id, 'date', activeJourneyDay.date)"
              />
            </label>
            <label>
              <span>城市</span>
              <input
                v-model="activeJourneyDay.city"
                placeholder="城市或區域"
                @input="queueJourneyTripsSave"
                @change="updateJourneyDayField(activeJourneyDay.id, 'city', activeJourneyDay.city)"
                @blur="updateJourneyDayField(activeJourneyDay.id, 'city', activeJourneyDay.city)"
              />
            </label>
            <label>
              <span>住宿</span>
              <input
                v-model="activeJourneyDay.stay"
                placeholder="飯店、民宿或地點"
                @input="queueJourneyTripsSave"
                @change="updateJourneyDayField(activeJourneyDay.id, 'stay', activeJourneyDay.stay)"
                @blur="updateJourneyDayField(activeJourneyDay.id, 'stay', activeJourneyDay.stay)"
              />
            </label>
          </div>

          <div class="travel-day-toolbar">
            <button class="soft-button" type="button" @click="addJourneyEntry(activeJourneyDay.id)">新增行程</button>
            <button class="ghost-button" type="button" @click="journeyPanelMode = 'import'">匯入資料</button>
            <button class="ghost-button" type="button" @click="removeJourneyDay(activeJourneyDay.id)">刪除這天</button>
          </div>

          <div v-if="activeJourneyDayEntries.length" class="travel-schedule-sections">
            <section v-for="section in activeJourneyScheduleSections" :key="section.id" class="travel-schedule-section">
              <div class="travel-schedule-heading">
                <span>{{ section.label }}</span>
                <small>{{ section.caption }}</small>
              </div>
              <ol class="travel-timeline">
                <li v-for="entry in section.entries" :key="entry.id" class="travel-event" :class="{ done: entry.done }">
                  <div class="travel-event-time">
                    <input
                      v-model="entry.time"
                      type="time"
                      step="60"
                      aria-label="開始時間"
                      @input="queueJourneyTripsSave"
                      @change="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'time', entry.time)"
                    />
                    <span></span>
                    <input
                      v-model="entry.endTime"
                      type="time"
                      step="60"
                      aria-label="結束時間"
                      @input="queueJourneyTripsSave"
                      @change="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'endTime', entry.endTime)"
                    />
                  </div>

                  <div class="travel-event-body">
                    <div class="travel-event-title-row">
                      <button
                        class="travel-check"
                        type="button"
                        :aria-label="entry.done ? '標記未完成' : '標記完成'"
                        @click="toggleJourneyEntryDone(activeJourneyDay.id, entry.id)"
                      >
                        {{ entry.done ? '✓' : '' }}
                      </button>
                      <input
                        v-model="entry.plan"
                        class="travel-event-title"
                        placeholder="行程安排"
                        @input="queueJourneyTripsSave"
                        @change="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'plan', entry.plan)"
                        @blur="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'plan', entry.plan)"
                      />
                      <button class="travel-remove-entry" type="button" aria-label="移除行程" @click="removeJourneyEntry(activeJourneyDay.id, entry.id)">×</button>
                    </div>

                    <div class="travel-event-meta">
                      <input
                        v-model="entry.transport"
                        placeholder="交通工具"
                        @input="queueJourneyTripsSave"
                        @change="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'transport', entry.transport)"
                        @blur="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'transport', entry.transport)"
                      />
                      <input
                        v-model="entry.duration"
                        placeholder="車程/時間"
                        @input="queueJourneyTripsSave"
                        @change="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'duration', entry.duration)"
                        @blur="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'duration', entry.duration)"
                      />
                    </div>
                    <textarea
                      v-model="entry.note"
                      placeholder="訂位、票券、注意事項"
                      @input="queueJourneyTripsSave"
                      @change="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'note', entry.note)"
                      @blur="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'note', entry.note)"
                    ></textarea>
                  </div>
                </li>
              </ol>
            </section>
          </div>
          <div v-else class="travel-empty-state">
            <strong>這一天還沒有行程</strong>
            <button class="soft-button" type="button" @click="addJourneyEntry(activeJourneyDay.id)">新增第一筆</button>
          </div>
        </article>
      </div>
    </template>

    <template v-else>
      <div class="travel-import-panel" aria-labelledby="travel-import-title">
        <div class="section-title-row">
          <div>
            <p class="section-kicker">資料工具</p>
            <h2 id="travel-import-title">匯入、建立與整理旅程</h2>
          </div>
        </div>
        <p class="travel-import-help">{{ journeyImportHelp }}</p>

        <div class="travel-import-grid">
          <div class="travel-import-main">
            <div class="travel-import-actions">
              <label class="import-button">
                <input type="file" accept=".xlsx,.xls,.csv,.tsv,text/csv,text/tab-separated-values,image/*" :disabled="journeyImportBusy" @change="importJourneyFile" />
                匯入檔案
              </label>
              <button class="soft-button" type="button" :disabled="journeyImportBusy || !journeyImportText.trim()" @click="importJourneyText">解析貼上內容</button>
            </div>
            <textarea v-model="journeyImportText" class="travel-import-textarea" placeholder="貼上 Day、日期、城市、行程安排、住宿、交通工具、車程/時間、備註的表格文字"></textarea>
          </div>

          <div class="travel-import-side">
            <label>
              <span>新旅程</span>
              <input v-model="journeyNewTripTitle" placeholder="新旅程名稱" />
            </label>
            <button class="ghost-button" type="button" @click="createBlankJourneyTrip">建立空白旅程</button>
            <label>
              <span>新增日期</span>
              <input v-model="journeyNewDayDate" type="date" aria-label="新增日期" />
            </label>
            <button class="ghost-button" type="button" @click="addJourneyDay">新增一天</button>
            <button class="ghost-button danger" type="button" @click="activeJourneyTrip && removeJourneyTrip(activeJourneyTrip.id)">刪除旅程</button>
          </div>
        </div>
        <p v-if="journeyImportMessage" class="empty-photo-note">{{ journeyImportMessage }}</p>
      </div>
    </template>
  </section>
</template>
