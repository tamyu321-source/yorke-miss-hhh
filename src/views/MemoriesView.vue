<script lang="ts">
import { createContextViewComponent } from '../appViewContext';

export default createContextViewComponent('MemoriesView');
</script>

<template>
    <section v-show="activeTab === 'memories'" class="timeline-section" aria-labelledby="timeline-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">相識到見面</p>
          <h2 id="timeline-title">可以左右滑的時間軸</h2>
        </div>
      </div>
      <div class="timeline-track" aria-hidden="true">
        <span :style="timelineProgressStyle"></span>
      </div>
      <div class="timeline-scroll">
        <article
          v-for="event in timelineEvents"
          :key="event.date"
          class="timeline-card"
          :class="{ active: currentDayIndex >= event.dayIndex }"
        >
          <strong>{{ event.date }}</strong>
          <h3>{{ event.title }}</h3>
          <p>{{ event.text }}</p>
        </article>
      </div>
    </section>


    <section v-show="activeTab === 'memories'" class="secret-code-section" aria-labelledby="secret-code-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">雙人暗號</p>
          <h2 id="secret-code-title">{{ secretCodeUnlocked ? '隱藏卡片已開啟' : '輸入只有你們懂的詞' }}</h2>
        </div>
      </div>
      <div class="secret-code-row">
        <input v-model="secretCodeInput" maxlength="16" placeholder="輸入暗號" />
        <button class="soft-button" type="button" @click="unlockSecretCode">解鎖</button>
      </div>
      <div class="secret-code-row">
        <input v-model="newSecretCode" maxlength="16" placeholder="新增暗號" />
        <button class="ghost-button" type="button" @click="addCustomSecretCode">加入</button>
      </div>
      <div v-if="customSecretCodes.length" class="secret-code-list">
        <button v-for="code in customSecretCodes" :key="code" type="button" @click="removeCustomSecretCode(code)">
          {{ code }} ×
        </button>
      </div>
      <p class="hidden-card" :class="{ unlocked: secretCodeUnlocked }">
        {{ secretCodeUnlocked ? hiddenCardLine : '卡片還在信封裡。' }}
      </p>
    </section>

    <section v-show="activeTab === 'memories'" class="photo-wall-section" aria-labelledby="photo-wall-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">照片回憶牆</p>
          <h2 id="photo-wall-title">把可以公開在本機的小畫面收起來</h2>
        </div>
      </div>
      <label class="photo-upload">
        <input type="file" accept="image/*" multiple @change="addMemoryPhotos" />
        加入照片
      </label>
      <div v-if="photoFilmstrip.length" class="photo-filmstrip" aria-label="回憶膠卷">
        <figure
          v-for="photo in photoFilmstrip"
          :key="`film-${photo.id}`"
          :style="{ '--film-rotate': photo.rotate }"
        >
          <img :src="photo.dataUrl" :alt="photo.name" />
          <figcaption>
            <strong>{{ photo.dateLabel }}</strong>
            <span>{{ photo.name }}</span>
          </figcaption>
        </figure>
      </div>
      <div v-if="memoryPhotos.length" class="photo-grid">
        <figure v-for="photo in memoryPhotos" :key="photo.id">
          <img :src="photo.dataUrl" :alt="photo.name" />
          <figcaption>
            <span>{{ photo.name }}</span>
            <button type="button" @click="removeMemoryPhoto(photo.id)">移除</button>
          </figcaption>
        </figure>
      </div>
      <p v-else class="empty-photo-note">照片只會存在這台裝置裡。</p>
    </section>

    <section v-show="activeTab === 'memories'" class="wish-section" aria-labelledby="wish-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">微願望瓶</p>
          <h2 id="wish-title">把想一起做的小事先放進來</h2>
        </div>
        <span class="date-pill">{{ completedWishCount }} / {{ wishes.length }}</span>
      </div>
      <div class="wish-input-row">
        <input v-model="newWish" maxlength="36" placeholder="例如：一起看一次夜景" @keyup.enter="addWish" />
        <button class="soft-button" type="button" @click="addWish">加入</button>
      </div>
      <div v-if="wishes.length" class="wish-list">
        <article v-for="wish in wishes" :key="wish.id" :class="{ done: wish.done }">
          <button type="button" @click="toggleWish(wish.id)">{{ wish.done ? '✓' : '+' }}</button>
          <p>{{ wish.text }}</p>
          <button type="button" @click="removeWish(wish.id)">移除</button>
        </article>
      </div>
      <p v-else class="empty-photo-note">願望瓶還是空的，先放一件很小的事就好。</p>
    </section>


    <section v-show="activeTab === 'memories'" class="capsule-section" aria-labelledby="capsule-title">
      <div class="capsule-header">
        <div>
          <p class="section-kicker">回憶膠囊</p>
          <h2 id="capsule-title">{{ unlockedCount }} / {{ journeyDays.length }}</h2>
        </div>
        <span class="date-pill">{{ dateKey }}</span>
      </div>

      <ol class="capsule-list">
        <li
          v-for="capsule in visibleCapsulesDisplay"
          :key="capsule.text"
          :class="{ locked: !capsule.unlocked, newest: capsule.unlocked && capsule.index === unlockedCount - 1 }"
        >
          <button
            class="capsule-card"
            :class="{ flipped: capsule.flipped }"
            type="button"
            :aria-label="capsule.unlocked ? `打開 ${capsule.dateLabel} 膠囊` : `查看 ${capsule.dateLabel} 膠囊解鎖時間`"
            @click="toggleCapsule(capsule.index)"
          >
            <span class="capsule-face capsule-front">
              <span class="capsule-index">{{ String(capsule.index + 1).padStart(2, '0') }}</span>
              <span>{{ capsule.unlocked ? capsule.dateLabel : `${capsule.dateLabel} 尚未解鎖` }}</span>
            </span>
            <span class="capsule-face capsule-back">
              <span>{{ capsule.unlocked ? capsule.text : capsule.lockedText }}</span>
            </span>
          </button>
        </li>
      </ol>
      <button class="wide-soft-button" type="button" @click="capsuleShowAll = !capsuleShowAll">
        {{ capsuleShowAll ? '只看最近 7 天' : '查看全部膠囊' }}
      </button>
    </section>
</template>
