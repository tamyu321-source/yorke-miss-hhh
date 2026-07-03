<script lang="ts">
import { computed } from 'vue';
import { useAppViewContext } from '../appViewContext';

export default {
  name: 'BottomNav',
  setup() {
    const context = useAppViewContext();
    const currentTab = computed(() => context.activeTab.value);

    function setActiveTab(tab: string) {
      context.activeTab.value = tab;
    }

    return {
      currentTab,
      navIndicatorStyle: context.navIndicatorStyle,
      setActiveTab
    };
  }
};
</script>

<template>
  <nav class="bottom-nav" aria-label="主要導覽">
    <span class="nav-indicator" :style="navIndicatorStyle" aria-hidden="true"></span>
    <button type="button" :class="{ active: currentTab === 'countdown' }" @click="setActiveTab('countdown')">倒數</button>
    <button type="button" :class="{ active: currentTab === 'today' }" @click="setActiveTab('today')">今日</button>
    <button type="button" :class="{ active: currentTab === 'journey' }" @click="setActiveTab('journey')">行程</button>
    <button type="button" :class="{ active: currentTab === 'period' }" @click="setActiveTab('period')">粽子</button>
    <button type="button" :class="{ active: currentTab === 'memories' }" @click="setActiveTab('memories')">回憶</button>
    <button type="button" :class="{ active: currentTab === 'prepare' }" @click="setActiveTab('prepare')">準備</button>
  </nav>
</template>
