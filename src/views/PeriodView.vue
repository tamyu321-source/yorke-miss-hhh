<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('PeriodView');
</script>

<template>
  <section
    v-show="activeTab === 'period'"
    class="period-hero-section"
    :class="[`phase-${professionalPeriodPhase.tone}`, { 'is-private': periodPrivacyMode }]"
    aria-labelledby="period-title"
  >
    <div class="period-hero-top">
      <div class="period-hero-copy">
        <p class="section-kicker">週期照護</p>
        <h2 id="period-title">{{ periodDisplayName }}</h2>
        <p>{{ professionalPeriodPhase.copy }}</p>
      </div>
      <div class="period-next-orb" aria-label="下次預估日期">
        <span>{{ professionalPeriodPhase.label }}</span>
        <strong>{{ professionalNextPeriodPrediction?.nextDate ?? '--' }}</strong>
        <small>預估開始</small>
      </div>
    </div>

    <div class="period-hero-actions">
      <button class="period-privacy-toggle" :class="{ active: periodPrivacyMode }" type="button" @click="togglePeriodPrivacyMode">
        {{ periodPrivacyMode ? '顯示細節' : '隱私模式' }}
      </button>
    </div>

    <div class="period-hero-metrics">
      <article v-for="card in professionalPeriodSummaryCards.slice(0, 4)" :key="card.label">
        <span>{{ card.label }}</span>
        <strong>{{ periodPrivacyMode ? '已隱藏' : card.value }}</strong>
      </article>
    </div>
  </section>

  <section v-show="activeTab === 'period'" class="period-reminder-section" aria-labelledby="period-reminder-title">
    <div class="section-title-row">
      <div>
        <p class="section-kicker">提醒</p>
        <h2 id="period-reminder-title">先把照護排進生活</h2>
      </div>
      <span class="date-pill">下次 {{ periodPrivacyMode ? '--' : professionalNextPeriodPrediction?.nextDate ?? '--' }}</span>
    </div>
    <div class="period-reminder-grid">
      <article v-for="reminder in periodReminderCards" :key="reminder.label" :class="`tone-${reminder.tone}`">
        <span>{{ reminder.status }}</span>
        <strong>{{ periodPrivacyMode ? '--' : reminder.date }}</strong>
        <p>{{ reminder.label }}</p>
        <small>{{ reminder.detail }}</small>
      </article>
    </div>
  </section>

  <section v-show="activeTab === 'period'" class="period-calendar-section" aria-labelledby="period-calendar-title">
    <div class="section-title-row">
      <div>
        <p class="section-kicker">六週視圖</p>
        <h2 id="period-calendar-title">接下來的身體節奏</h2>
      </div>
      <span class="date-pill">信心 {{ periodConfidenceLabel }}</span>
    </div>

    <div class="period-calendar-tools" aria-label="切換週期視圖">
      <button class="ghost-button" type="button" aria-label="查看前四週" @click="shiftPeriodCalendar(-1)">前</button>
      <span>{{ periodPrivacyMode ? '日期已隱藏' : periodCalendarRangeLabel }}</span>
      <button class="ghost-button" type="button" @click="resetPeriodCalendar">今天</button>
      <button class="ghost-button" type="button" aria-label="查看後四週" @click="shiftPeriodCalendar(1)">後</button>
    </div>

    <div class="period-calendar-grid" :class="{ 'is-private': periodPrivacyMode }">
      <article v-for="day in professionalPeriodCalendarDays" :key="day.key" :class="day.classes">
        <span>{{ day.weekday }}</span>
        <strong>{{ periodPrivacyMode ? '•' : day.dayNumber }}</strong>
        <small>{{ periodPrivacyMode ? '' : day.label }}</small>
      </article>
    </div>

    <div class="period-calendar-legend">
      <span><i class="legend-recorded"></i>實際</span>
      <span><i class="legend-predicted"></i>預估</span>
      <span><i class="legend-fertile"></i>受孕窗</span>
      <span><i class="legend-ovulation"></i>排卵</span>
    </div>
  </section>

  <section v-show="activeTab === 'period'" class="period-alert-section" aria-labelledby="period-alert-title">
    <div>
      <p class="section-kicker">狀況提示</p>
      <h2 id="period-alert-title">需要多留意的變化</h2>
    </div>
    <div v-if="periodPrivacyMode" class="period-private-cover">
      <strong>細節已隱藏</strong>
      <span>關閉隱私模式後可查看提示。</span>
    </div>
    <div v-else-if="periodAnomalyAlerts.length" class="period-alert-list">
      <article v-for="alert in periodAnomalyAlerts" :key="alert.title" :class="`tone-${alert.tone}`">
        <strong>{{ alert.title }}</strong>
        <p>{{ alert.detail }}</p>
      </article>
    </div>
    <article v-else class="period-alert-empty">
      <strong>目前沒有明顯異常訊號</strong>
      <p>繼續記錄日期、痛感與流量，之後比較容易看出變化。</p>
    </article>
  </section>

  <section v-show="activeTab === 'period'" class="period-prediction-section" aria-labelledby="period-prediction-title">
    <div>
      <p class="section-kicker">預測</p>
      <h2 id="period-prediction-title">經期、經前、排卵</h2>
    </div>
    <div class="period-prediction-list">
      <article v-for="prediction in professionalPeriodPredictions" :key="prediction.cycleDays" :class="{ likely: prediction.isLikely }">
        <div>
          <span>{{ prediction.cycleDays }} 天週期</span>
          <strong>{{ periodPrivacyMode ? '--' : `${prediction.nextDate} - ${prediction.endDate}` }}</strong>
        </div>
        <dl>
          <div>
            <dt>經前</dt>
            <dd>{{ periodPrivacyMode ? '--' : prediction.pmsStart }}</dd>
          </div>
          <div>
            <dt>排卵</dt>
            <dd>{{ periodPrivacyMode ? '--' : prediction.ovulationDate }}</dd>
          </div>
          <div>
            <dt>受孕窗</dt>
            <dd>{{ periodPrivacyMode ? '--' : prediction.fertileWindow }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>

  <section v-show="activeTab === 'period'" class="period-care-section" aria-labelledby="period-care-title">
    <div>
      <p class="section-kicker">照護建議</p>
      <h2 id="period-care-title">今天可以這樣照顧</h2>
    </div>
    <div class="period-care-grid">
      <article v-for="suggestion in periodCareSuggestionCards" :key="suggestion.title">
        <strong>{{ suggestion.title }}</strong>
        <p>{{ suggestion.detail }}</p>
      </article>
    </div>
  </section>

  <section v-show="activeTab === 'period'" class="period-record-section" aria-labelledby="period-record-title">
    <div class="period-record-heading">
      <div>
        <p class="section-kicker">{{ editingPeriodRecordId ? '修改紀錄' : '快速紀錄' }}</p>
        <h2 id="period-record-title">{{ periodRecordFormTitle }}</h2>
      </div>
      <button v-if="editingPeriodRecordId" class="ghost-button" type="button" @click="cancelEditPeriodRecord">取消</button>
    </div>

    <div class="period-date-row">
      <label>
        開始
        <input v-model="newPeriodStartDate" type="date" />
      </label>
      <label>
        結束
        <input v-model="newPeriodEndDate" type="date" />
      </label>
    </div>

    <div class="period-field-group">
      <p>流量</p>
      <div class="period-segmented">
        <button
          v-for="flow in periodFlowOptions"
          :key="flow.id"
          type="button"
          :class="{ active: newPeriodFlow === flow.id }"
          @click="newPeriodFlow = flow.id"
        >
          <strong>{{ flow.short }}</strong>
          <span>{{ flow.label }}</span>
        </button>
      </div>
    </div>

    <div class="period-field-group">
      <div class="period-slider-label">
        <p>疼痛程度</p>
        <strong>{{ newPeriodPainLevel }}/10</strong>
      </div>
      <input v-model.number="newPeriodPainLevel" class="period-pain-slider" type="range" min="0" max="10" />
    </div>

    <div class="period-field-group">
      <p>症狀</p>
      <div class="period-chip-grid">
        <button
          v-for="symptom in periodSymptomOptions"
          :key="symptom.id"
          type="button"
          :class="{ active: newPeriodSymptoms.includes(symptom.id) }"
          @click="togglePeriodSelection('symptom', symptom.id)"
        >
          {{ symptom.label }}
        </button>
      </div>
    </div>

    <div class="period-field-group">
      <p>心情</p>
      <div class="period-chip-grid">
        <button
          v-for="mood in periodMoodOptions"
          :key="mood.id"
          type="button"
          :class="{ active: newPeriodMoods.includes(mood.id) }"
          @click="togglePeriodSelection('mood', mood.id)"
        >
          {{ mood.label }}
        </button>
      </div>
    </div>

    <div class="period-field-group">
      <p>照護</p>
      <div class="period-chip-grid care-grid">
        <button
          v-for="care in periodCareOptions"
          :key="care.id"
          type="button"
          :class="{ active: newPeriodCare.includes(care.id) }"
          @click="togglePeriodSelection('care', care.id)"
        >
          {{ care.label }}
        </button>
      </div>
    </div>

    <label class="period-note-label">
      備註
      <input v-model="newPeriodNote" maxlength="80" placeholder="例如：熱敷有效、晚上比較痛、今天想吃甜的" />
    </label>
    <button class="wide-soft-button period-save-button" type="button" @click="addPeriodRecord">{{ periodRecordSubmitLabel }}</button>
    <p v-if="periodMessage" class="period-message">{{ periodMessage }}</p>
  </section>

  <section v-show="activeTab === 'period'" class="period-insight-section" aria-labelledby="period-insight-title">
    <div>
      <p class="section-kicker">洞察</p>
      <h2 id="period-insight-title">越記越準的個人模式</h2>
    </div>
    <div class="period-insight-grid">
      <article v-for="card in professionalPeriodInsightCards" :key="card.label">
        <span>{{ card.label }}</span>
        <strong>{{ periodPrivacyMode ? '已隱藏' : card.value }}</strong>
      </article>
    </div>
  </section>

  <section v-show="activeTab === 'period'" class="period-trend-section" aria-labelledby="period-trend-title">
    <div>
      <p class="section-kicker">趨勢</p>
      <h2 id="period-trend-title">最近幾次的節奏</h2>
    </div>
    <div v-if="periodPrivacyMode" class="period-private-cover">
      <strong>趨勢已隱藏</strong>
      <span>適合在公共場合快速遮住日期與身體資料。</span>
    </div>
    <div v-else class="period-trend-list">
      <article v-for="row in periodTrendRows" :key="row.id">
        <div class="period-trend-meta">
          <strong>{{ row.label }}</strong>
          <span>{{ row.cycleDays ? `${row.cycleDays} 天週期` : '第一筆' }}</span>
        </div>
        <div class="period-trend-bars">
          <span>
            週期
            <i :style="{ width: row.cycleWidth }"></i>
          </span>
          <span>
            經期 {{ row.periodLength }} 天
            <i class="length" :style="{ width: row.lengthWidth }"></i>
          </span>
          <span>
            痛感 {{ row.painLevel }}/10
            <i class="pain" :style="{ width: row.painWidth }"></i>
          </span>
        </div>
      </article>
    </div>
  </section>

  <section
    v-show="activeTab === 'period'"
    class="period-history-section"
    :class="{ 'is-private': periodPrivacyMode }"
    aria-labelledby="period-history-title"
  >
    <div class="section-title-row">
      <div>
        <p class="section-kicker">歷史</p>
        <h2 id="period-history-title">週期時間線</h2>
      </div>
      <span class="date-pill">{{ periodRecords.length }} 筆</span>
    </div>
    <div class="period-history-list">
      <article v-for="record in professionalPeriodTimelineRecords" :key="record.id">
        <div>
          <strong>{{ periodPrivacyMode ? '日期已隱藏' : record.startLabel }}<template v-if="!periodPrivacyMode && record.endLabel"> - {{ record.endLabel }}</template></strong>
          <span v-if="periodPrivacyMode">細節已隱藏</span>
          <template v-else>
            <span>{{ record.cycleDays ? `${record.cycleDays} 天週期` : '第一筆紀錄' }} · {{ record.flowLabel }} · 痛感 {{ record.painLevel }}/10</span>
            <small v-if="record.symptomLabels">症狀：{{ record.symptomLabels }}</small>
            <small v-if="record.moodLabels">心情：{{ record.moodLabels }}</small>
            <p v-if="record.note">{{ record.note }}</p>
          </template>
        </div>
        <div class="period-history-actions">
          <button class="ghost-button" type="button" @click="startEditPeriodRecord(record.id)">編輯</button>
          <button class="ghost-button" type="button" @click="removePeriodRecord(record.id)">移除</button>
        </div>
      </article>
    </div>
  </section>

  <section v-show="activeTab === 'period'" class="period-disclaimer-section">
    <p>預測只適合日常照護與提醒，不是醫療診斷。若出血異常、疼痛劇烈、週期突然大幅改變，或有懷孕可能，請優先尋求專業醫療建議。</p>
  </section>
</template>
