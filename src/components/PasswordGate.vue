<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('PasswordGate');
</script>

<template>
    <section v-if="!appUnlocked" class="password-gate" :class="{ 'cloud-loading': cloudLoadingActive }" aria-labelledby="password-gate-title">
      <template v-if="cloudLoadingActive">
        <div class="cloud-loading-panel" role="status" aria-live="polite">
          <span class="cloud-loading-orbit" aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
          </span>
          <p class="eyebrow">雲端同步</p>
          <h1 id="password-gate-title">正在把今天準備好</h1>
          <p>{{ cloudStatus }}</p>
          <div class="cloud-loading-steps">
            <span v-for="step in cloudLoadingSteps" :key="step.label" :class="{ done: step.done }">
              {{ step.done ? '✓' : '•' }} {{ step.label }}
            </span>
          </div>
          <div class="cloud-loading-actions">
            <button class="local-data-button" type="button" @click="useLocalDataForThisSession">
              先用本地資料
            </button>
            <small>雲端較慢時可先進入，之後仍可到資料工具手動同步。</small>
          </div>
        </div>
      </template>
      <template v-else>
        <p class="eyebrow">第一次見面倒數</p>
        <h1 id="password-gate-title">先說暗號</h1>
        <p class="password-hint">提示：小笨蛋生日</p>
        <form class="password-form" @submit.prevent="unlockApp">
        <input
          v-model="passwordInput"
          inputmode="numeric"
          autocomplete="current-password"
          maxlength="16"
          placeholder="輸入密碼"
          type="password"
        />
        <button class="soft-button" type="submit" :disabled="passwordBusy">
          {{ passwordBusy ? '確認中...' : '進入' }}
        </button>
        </form>
        <div v-if="passwordSuccess" class="password-success" aria-live="polite">
          <span aria-hidden="true"></span>
          <strong>暗號通過</strong>
        </div>
        <p class="password-status">{{ passwordStatus || cloudStatus }}</p>
        <div v-if="showPasswordInstallHint" class="password-install-hint">
          <strong>想放到 iPhone 桌面？</strong>
          <p>Safari 不會自動彈出安裝提示，請點分享按鈕，再選「加入主畫面」。</p>
        </div>
      </template>
    </section>
</template>
