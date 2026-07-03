<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('JourneyView');
</script>

<template>
    <section v-show="activeTab === 'journey'" class="travel-board-section" aria-labelledby="travel-board-title">
      <div class="travel-hero">
        <div>
          <p class="section-kicker">共同旅程</p>
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
        <div class="travel-progress-ring" :style="{ '--travel-progress': `${activeJourneyProgress}%` }">
          <strong>{{ activeJourneyProgress }}%</strong>
          <span>完成</span>
        </div>
      </div>

      <div class="travel-trip-row">
        <select :value="activeJourneyTrip?.id ?? ''" aria-label="選擇旅程" @change="selectJourneyTripFromEvent">
          <option v-for="trip in journeyTripOptions" :key="trip.id" :value="trip.id">
            {{ trip.title }} · {{ formatJourneyDateLabel(trip.startDate) }}
          </option>
        </select>
        <div class="travel-trip-actions">
          <button class="ghost-button" type="button" @click="createBlankJourneyTrip">新增旅程</button>
          <button class="ghost-button" type="button" @click="autoScheduleActiveJourney">自動排時段</button>
          <button class="ghost-button" type="button" @click="journeyPanelMode = 'import'">匯入</button>
        </div>
      </div>

      <div class="travel-mode-switch" role="tablist" aria-label="旅程檢視">
        <button type="button" :class="{ active: journeyPanelMode === 'schedule' }" @click="journeyPanelMode = 'schedule'">行事曆</button>
        <button type="button" :class="{ active: journeyPanelMode === 'import' }" @click="journeyPanelMode = 'import'">資料工具</button>
      </div>

      <div class="travel-stat-grid" aria-label="旅程總覽">
        <article v-for="stat in journeySummaryStats" :key="stat.label">
          <span>{{ stat.label }}</span>
          <strong>{{ stat.value }}</strong>
        </article>
      </div>

      <template v-if="journeyPanelMode === 'schedule'">
        <div class="travel-calendar-card" aria-label="旅程月曆">
          <div class="travel-calendar-head">
            <div>
              <span>Itinerary</span>
              <strong>{{ activeJourneyMonthLabel }}</strong>
            </div>
            <small>{{ activeJourneyDayIndex + 1 }} / {{ activeJourneyDays.length }}</small>
          </div>
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
              <strong>{{ cell.label }}</strong>
              <em>{{ cell.city }}</em>
              <i v-if="cell.total">{{ cell.done }}/{{ cell.total }}</i>
            </button>
          </div>
        </div>

        <article v-if="activeJourneyDay" class="travel-day-panel">
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
              <input :value="activeJourneyDay.date" type="date" @input="updateJourneyDayField(activeJourneyDay.id, 'date', getInputValue($event))" />
            </label>
            <label>
              <span>城市</span>
              <input :value="activeJourneyDay.city" @input="updateJourneyDayField(activeJourneyDay.id, 'city', getInputValue($event))" />
            </label>
            <label>
              <span>住宿</span>
              <input :value="activeJourneyDay.stay" @input="updateJourneyDayField(activeJourneyDay.id, 'stay', getInputValue($event))" />
            </label>
          </div>

          <div class="travel-schedule-sections">
            <section v-for="section in activeJourneyScheduleSections" :key="section.id" class="travel-schedule-section">
              <div class="travel-schedule-heading">
                <span>{{ section.label }}</span>
                <small>{{ section.caption }}</small>
              </div>
              <ol class="travel-timeline">
                <li v-for="entry in section.entries" :key="entry.id" class="travel-event" :class="{ done: entry.done }">
                  <div class="travel-event-time">
                    <label class="travel-time-input">
                      <span>開始</span>
                      <input
                        :value="entry.time"
                        type="time"
                        step="60"
                        aria-label="開始時間"
                        @input="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'time', getInputValue($event))"
                      />
                    </label>
                    <label class="travel-time-input">
                      <span>結束</span>
                      <input
                        :value="entry.endTime"
                        type="time"
                        step="60"
                        aria-label="結束時間"
                        @input="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'endTime', getInputValue($event))"
                      />
                    </label>
                    <button class="travel-check" type="button" @click="toggleJourneyEntryDone(activeJourneyDay.id, entry.id)">
                      {{ entry.done ? '✓' : '+' }}
                    </button>
                  </div>
                  <div class="travel-event-body">
                    <input class="travel-event-title" :value="entry.plan" placeholder="行程安排" @input="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'plan', getInputValue($event))" />
                    <div class="travel-event-meta">
                      <input :value="entry.transport" placeholder="交通工具" @input="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'transport', getInputValue($event))" />
                      <input :value="entry.duration" placeholder="車程/時間" @input="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'duration', getInputValue($event))" />
                    </div>
                    <textarea :value="entry.note" placeholder="備註" @input="updateJourneyEntryField(activeJourneyDay.id, entry.id, 'note', getTextareaValue($event))"></textarea>
                    <button class="ghost-button travel-remove-entry" type="button" @click="removeJourneyEntry(activeJourneyDay.id, entry.id)">移除</button>
                  </div>
                </li>
              </ol>
            </section>
          </div>
          <p v-if="!activeJourneyDayEntries.length" class="empty-photo-note">這一天還沒有行程，可以先新增一筆。</p>

          <div class="travel-actions">
            <button class="soft-button" type="button" @click="addJourneyEntry(activeJourneyDay.id)">新增行程</button>
            <button class="ghost-button" type="button" @click="addJourneyDay">新增一天</button>
            <button class="ghost-button" type="button" @click="removeJourneyDay(activeJourneyDay.id)">刪除這天</button>
          </div>
        </article>
      </template>

      <template v-else>
        <div class="travel-import-panel" aria-labelledby="travel-import-title">
          <div class="section-title-row">
            <div>
              <p class="section-kicker">匯入旅程</p>
              <h2 id="travel-import-title">從表格或圖片產生行事曆</h2>
            </div>
          </div>
          <p class="travel-import-help">{{ journeyImportHelp }}</p>
          <div class="travel-import-actions">
            <label class="import-button">
              <input type="file" accept=".xlsx,.xls,.csv,.tsv,text/csv,text/tab-separated-values,image/*" :disabled="journeyImportBusy" @change="importJourneyFile" />
              匯入檔案
            </label>
            <button class="soft-button" type="button" :disabled="journeyImportBusy || !journeyImportText.trim()" @click="importJourneyText">解析貼上內容</button>
          </div>
          <textarea v-model="journeyImportText" class="travel-import-textarea" placeholder="貼上 Day、日期、城市、行程安排、住宿、交通工具、車程/時間、備註的表格文字"></textarea>
          <div class="travel-create-row">
            <input v-model="journeyNewTripTitle" placeholder="新旅程名稱" />
            <button class="ghost-button" type="button" @click="createBlankJourneyTrip">建立空白旅程</button>
          </div>
          <div class="travel-create-row">
            <input v-model="journeyNewDayDate" type="date" aria-label="新增日期" />
            <button class="ghost-button" type="button" @click="addJourneyDay">新增一天</button>
          </div>
          <div class="travel-actions">
            <button class="wide-soft-button" type="button" @click="exportActiveJourneyCalendar">匯出這次旅程行事曆</button>
            <button class="ghost-button" type="button" @click="activeJourneyTrip && removeJourneyTrip(activeJourneyTrip.id)">刪除旅程</button>
          </div>
          <p v-if="journeyImportMessage" class="empty-photo-note">{{ journeyImportMessage }}</p>
        </div>
      </template>
    </section>
</template>
