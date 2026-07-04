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
          <h2 id="secret-code-title">{{ secretCodeUnlocked ? '雙人私密區' : '先對暗號，再開信封' }}</h2>
        </div>
        <span class="date-pill">{{ secretCodeUnlocked ? '已開啟' : '上鎖中' }}</span>
      </div>

      <div v-if="!secretCodeUnlocked" class="secret-code-gate">
        <div class="secret-code-lock" aria-hidden="true">⌁</div>
        <div class="secret-code-row">
          <input v-model="secretCodeInput" maxlength="16" placeholder="輸入你們約好的暗號" @keyup.enter="unlockSecretCode" />
          <button class="soft-button" type="button" @click="unlockSecretCode">打開信封</button>
        </div>
        <div class="secret-code-help-actions">
          <button class="ghost-button" type="button" @click="toggleSecretCodeHelp">
            {{ secretCodeHelpVisible ? '收起提示' : '忘記暗號' }}
          </button>
          <button class="ghost-button" type="button" @click="resetCustomSecretCodes">恢復預設暗號</button>
        </div>
        <div v-if="secretCodeHelpVisible" class="secret-code-recovery">
          <strong>預設暗號</strong>
          <div class="secret-code-hint-list">
            <button v-for="code in defaultSecretCodes" :key="code" type="button" @click="useSecretCodeHint(code)">
              {{ code }}
            </button>
          </div>
          <p>如果你後來改過又忘了，可以先恢復預設暗號；打開信封後再新增新的雙人暗號。</p>
        </div>
        <p class="secret-code-status">{{ secretCodeMessage || '暗號通過後，才會看到隱藏卡片與暗號管理。' }}</p>
      </div>

      <template v-else>
        <div class="secret-code-unlocked-panel">
          <div>
            <strong>信封已打開</strong>
            <p>{{ secretCodeMessage || '可以新增、編輯只在暗號通過後才看得到的卡片。' }}</p>
          </div>
          <button class="ghost-button" type="button" @click="lockSecretCode">重新上鎖</button>
        </div>

        <div class="hidden-card-editor">
          <input v-model="hiddenCardTitleDraft" maxlength="28" placeholder="卡片標題" />
          <textarea v-model="hiddenCardTextDraft" maxlength="220" placeholder="寫一張只有解鎖後才看得到的卡片"></textarea>
          <div class="message-actions">
            <span>{{ hiddenCardTextDraft.length }} / 220</span>
            <div>
              <button v-if="editingHiddenCardId" class="ghost-button" type="button" @click="cancelHiddenCardEdit">取消</button>
              <button class="soft-button" type="button" @click="saveHiddenCard">
                {{ editingHiddenCardId ? '儲存修改' : '新增卡片' }}
              </button>
            </div>
          </div>
        </div>

        <div class="hidden-card-list">
          <article v-for="card in hiddenCards" :key="card.id" class="hidden-card unlocked">
            <strong>{{ card.title }}</strong>
            <p>{{ card.text }}</p>
            <div>
              <button type="button" @click="editHiddenCard(card.id)">編輯</button>
              <button type="button" @click="removeHiddenCard(card.id)">刪除</button>
            </div>
          </article>
        </div>

        <div class="secret-code-management">
          <div>
            <strong>管理雙人暗號</strong>
            <p>新增後，兩個人下次都可以用這組暗號打開信封。</p>
          </div>
          <div class="secret-code-row">
            <input v-model="newSecretCode" maxlength="16" placeholder="新增一組暗號" @keyup.enter="addCustomSecretCode" />
            <button class="ghost-button" type="button" @click="addCustomSecretCode">加入</button>
          </div>
          <div v-if="customSecretCodes.length" class="secret-code-list">
            <button v-for="code in customSecretCodes" :key="code" type="button" @click="removeCustomSecretCode(code)">
              {{ code }} ×
            </button>
          </div>
          <p v-else class="secret-code-status">目前只使用預設暗號，還沒有新增自訂暗號。</p>
        </div>
      </template>
    </section>

    <section v-show="activeTab === 'memories'" class="photo-wall-section" aria-labelledby="photo-wall-title">
      <div class="section-title-row">
        <div>
          <p class="section-kicker">照片回憶牆</p>
          <h2 id="photo-wall-title">把可以公開在本機的小畫面收起來</h2>
        </div>
        <span class="date-pill">{{ memoryPhotoCountLabel }}</span>
      </div>
      <div class="photo-wall-actions">
        <label class="photo-upload" :class="{ 'is-busy': memoryPhotoBusy }">
          <input type="file" accept="image/*" multiple :disabled="memoryPhotoBusy" @change="addMemoryPhotos" />
          {{ memoryPhotoBusy ? '整理中' : '加入照片' }}
        </label>
        <button v-if="memoryPhotos.length" class="ghost-button" type="button" @click="selectMemoryPhoto(memoryPhotos[0].id)">最新</button>
      </div>
      <div v-if="memoryPhotos.length" class="photo-wall-zoom-controls" aria-label="照片牆縮放">
        <button type="button" @click="zoomPhotoWall(-0.2)">縮小</button>
        <span>{{ photoWallZoomLabel }}</span>
        <button type="button" @click="zoomPhotoWall(0.2)">放大</button>
        <button type="button" @click="resetPhotoWallZoom">重設</button>
      </div>
      <p v-if="memoryPhotoMessage" class="photo-status">{{ memoryPhotoMessage }}</p>
      <div v-if="memoryPhotos.length" class="photo-wall-gallery">
        <div
          class="photo-wall-canvas"
          :class="{ dragging: photoWallDragging }"
          aria-label="可滑動照片牆"
          @wheel="handlePhotoWallWheel"
          @pointerdown="startPhotoWallGesture"
          @pointermove="movePhotoWallGesture"
          @pointerup="endPhotoWallGesture"
          @pointercancel="endPhotoWallGesture"
        >
          <div class="photo-wall-zoom-surface" :style="photoWallSurfaceStyle">
            <div class="photo-wall-board" :style="photoWallBoardStyle" aria-label="照片牆">
            <button
              v-for="photo in photoWallItems"
              :key="`wall-${photo.id}`"
              class="photo-wall-card"
              :class="{ active: photo.selected, dragging: photo.dragging }"
              :style="photo.wallStyle"
              type="button"
              @pointerdown.stop="startPhotoWallCardDrag(photo.id, $event)"
              @pointermove.stop="movePhotoWallCardDrag(photo.id, $event)"
              @pointerup.stop="endPhotoWallCardDrag(photo.id, $event)"
              @pointercancel.stop="endPhotoWallCardDrag(photo.id, $event)"
              @click="openMemoryPhotoFromWall(photo.id)"
            >
              <span class="photo-wall-pin" aria-hidden="true"></span>
              <img :src="photo.dataUrl" :alt="photo.name" />
              <span class="photo-wall-caption">
                <strong>{{ photo.dateLabel }}</strong>
                <small>{{ photo.name }}</small>
              </span>
            </button>
            </div>
          </div>
        </div>
        <div v-if="selectedMemoryPhoto" class="photo-wall-detail">
          <div>
            <span>目前選取</span>
            <strong>{{ selectedMemoryPhoto.name }}</strong>
            <small>{{ selectedMemoryPhotoMeta }}</small>
          </div>
          <button class="ghost-button" type="button" @click="removeMemoryPhoto(selectedMemoryPhoto.id)">刪除這張</button>
        </div>
      </div>
      <p v-else class="empty-photo-note">照片會先壓縮，再同步到回憶 API。</p>
    </section>

    <div
      v-if="photoViewerOpen && selectedMemoryPhoto"
      class="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="照片檢視器"
      @click.self="closeMemoryPhotoViewer"
    >
      <div class="photo-viewer-panel">
        <div class="photo-viewer-bar">
          <div>
            <span>{{ selectedMemoryPhotoMeta }}</span>
            <strong>{{ selectedMemoryPhoto.name }}</strong>
          </div>
          <button class="photo-viewer-close" type="button" aria-label="關閉照片檢視器" @click="closeMemoryPhotoViewer">×</button>
        </div>
        <div
          class="photo-viewer-stage"
          :class="{ dragging: photoViewerDragging }"
          @wheel="handleMemoryPhotoViewerWheel"
          @pointerdown="startMemoryPhotoViewerGesture"
          @pointermove="moveMemoryPhotoViewerGesture"
          @pointerup="endMemoryPhotoViewerGesture"
          @pointercancel="endMemoryPhotoViewerGesture"
        >
          <img :src="selectedMemoryPhoto.dataUrl" :alt="selectedMemoryPhoto.name" :style="photoViewerTransform" draggable="false" />
        </div>
        <div class="photo-viewer-toolbar" aria-label="照片檢視工具">
          <button type="button" @click="zoomMemoryPhotoViewer(-0.25)">縮小</button>
          <span>{{ Math.round(photoViewerScale * 100) }}%</span>
          <button type="button" @click="zoomMemoryPhotoViewer(0.25)">放大</button>
          <button type="button" @click="resetMemoryPhotoViewer">重設</button>
          <button type="button" @click="saveSelectedMemoryPhotoToDevice">儲存</button>
        </div>
      </div>
    </div>

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
          :key="capsule.index"
          :class="{ locked: !capsule.unlocked, newest: capsule.unlocked && capsule.index === unlockedCount - 1 }"
        >
          <button
            class="capsule-card"
            :class="{ flipped: capsule.flipped }"
            type="button"
            :aria-label="capsule.unlocked ? `打開 ${capsule.dateLabel} 膠囊` : `查看 ${capsule.dateLabel} 膠囊解鎖時間`"
            @click="toggleCapsule(capsule.index)"
          >
            <span v-if="!capsule.flipped" class="capsule-face capsule-front">
              <span class="capsule-index">{{ String(capsule.index + 1).padStart(2, '0') }}</span>
              <span>{{ capsule.unlocked ? capsule.dateLabel : `${capsule.dateLabel} 尚未解鎖` }}</span>
            </span>
            <span v-else class="capsule-face capsule-back">
              <span>{{ capsule.unlocked ? capsule.text : capsule.lockedText }}</span>
            </span>
          </button>
          <div v-if="capsule.unlocked" class="capsule-tools">
            <button class="ghost-button" type="button" @click="startEditCapsule(capsule.index)">
              {{ capsule.customized ? '編輯文字' : '寫自己的版本' }}
            </button>
          </div>
          <div v-if="capsule.editing" class="capsule-edit-panel">
            <textarea v-model="capsuleEditText" maxlength="160" placeholder="改寫這顆膠囊的文字"></textarea>
            <div class="message-actions">
              <span>{{ capsuleEditText.length }} / 160</span>
              <div>
                <button class="ghost-button" type="button" @click="cancelEditCapsule">取消</button>
                <button class="soft-button" type="button" @click="saveCapsuleNote">儲存</button>
              </div>
            </div>
          </div>
        </li>
      </ol>
      <button class="wide-soft-button" type="button" @click="capsuleShowAll = !capsuleShowAll">
        {{ capsuleShowAll ? '只看最近 7 天' : '查看全部膠囊' }}
      </button>
    </section>
</template>
