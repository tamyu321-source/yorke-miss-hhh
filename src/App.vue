<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { createExportData, downloadJsonBackup, parseImportData, type AppExportData } from './backup';
import { downloadCalendar } from './calendar';
import {
  clearCloudSession,
  fetchCloudState,
  isCloudSyncConfigured,
  requestCloudSession,
  restoreCloudSession,
  saveCloudState
} from './cloudSync';
import { loadStoredPhotos, mergePhotos, savePhotos } from './photoDb';
import { checkForAppUpdate as checkServiceWorkerUpdate, refreshForWaitingServiceWorker } from './pwa';
import { restoreAppLocalStorage, storageKey } from './storage';
import type {
  ActiveTab,
  AppSettings,
  Countdown,
  DailyQuestion,
  Fortune,
  JourneyDay,
  MeetingMoment,
  MemoryPhoto,
  MoodOption,
  PlaneDragState,
  RadarChoice,
  Sparkle,
  ThemeId,
  TimelineEvent,
  WishItem
} from './types';

type CountdownUnit = keyof Countdown;

type BurstParticle = {
  id: number;
  x: number;
  y: number;
  delay: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const OPENING_DURATION_MS = 6400;
const OPENING_RETURN_DURATION_MS = 4600;
const OPENING_SKIP_DURATION_MS = 620;
const OPENING_REDUCED_DURATION_MS = 650;
const BOY_NAME = '大笨蛋北七';
const GIRL_NAME = '小笨蛋粽子';
const defaultSettings: AppSettings = {
  boyName: '大笨蛋北七',
  girlName: '小笨蛋粽子',
  theme: 'peach',
  startDate: '2026-04-08',
  startTime: '00:00',
  targetTime: '18:00',
  welcomeLine: '把倒數放慢一點，讓見面自己靠近。',
  reducedMotion: false
};

const themeOptions: Array<{ id: ThemeId; label: string }> = [
  { id: 'peach', label: '蜜桃光' },
  { id: 'mint', label: '薄荷風' },
  { id: 'night', label: '夜航燈' }
];

const relationshipPhases = [
  {
    untilDay: 1,
    label: '相識',
    noteOpenings: ['今天是你們相識的日子，故事從一個很輕的招呼開始'],
    noteDetails: ['那時候還不知道，這一天會被好好記住'],
    taskIdeas: ['把今天定成你們的相識紀念日'],
    capsuleIdeas: ['4 月 8 日，相識的第一頁']
  },
  {
    untilDay: 18,
    label: '初識',
    noteOpenings: [
      '剛認識的日子，連一句普通訊息都像新的路標',
      '還在慢慢認識彼此，語氣裡藏著一點點好奇',
      '今天的距離不急著變短，先讓名字變得熟悉',
      '故事還很安靜，但已經開始有了方向',
      '你們正在學會分辨對方的節奏',
      '有些靠近，是從願意多聊一句開始'
    ],
    noteDetails: [
      '把這份剛開始的好奇收好，它會變成後來的溫柔',
      '不用把答案想太快，只要讓每一次對話都真誠一點',
      '陌生感正在退後，熟悉感正在悄悄靠前',
      '如果今天有笑一下，那就是很好的進度',
      '兩個人的世界還沒重疊很多，但已經有一點光',
      '這段開始很輕，卻值得被認真記下來'
    ],
    taskIdeas: [
      '記下一個今天對對方的新發現',
      '把一段覺得舒服的聊天存成回憶',
      '問一個輕鬆的小問題',
      '分享一件今天發生的普通小事',
      '聽一首適合剛認識時的歌',
      '寫下你對這段相識的第一個印象'
    ],
    capsuleIdeas: [
      '第一次記住對方名字的感覺',
      '一則讓人想再回覆的訊息',
      '剛認識時的小小好奇',
      '開始期待下一次聊天的瞬間',
      '從陌生變熟悉的第一步',
      '相識初期的輕輕心動'
    ]
  },
  {
    untilDay: 45,
    label: '熟悉',
    noteOpenings: [
      '慢慢熟起來以後，日常開始有了對方的位置',
      '今天不是突然靠近，而是又多了一點理解',
      '你們開始把普通的事，也說給彼此聽',
      '熟悉感不是大聲宣布的，是每天多留下來一點',
      '有些訊息看起來平凡，其實是在蓋一座小橋',
      '大笨蛋北七和小笨蛋粽子，開始有了只有彼此懂的節奏',
      '今天的聊天如果很自然，那就是很珍貴的靠近',
      '你們正在從認識，走向更願意分享的地方'
    ],
    noteDetails: [
      '這段時間不用催促，只要讓舒服的感覺慢慢長大',
      '一點點熟悉，一點點在意，都是故事正在展開',
      '能把無聊說給對方聽，其實也是一種信任',
      '每天的問候都很小，累積起來卻很溫柔',
      '不是每一天都要特別，但每一天都在加深',
      '把今天的靠近記下來，未來會覺得很可愛',
      '如果開始在意對方的心情，那就不是普通朋友那麼簡單了',
      '這份自然感，會是後來很多甜的來源'
    ],
    taskIdeas: [
      '分享今天最真實的一個心情',
      '記下一句對方說過、你想留住的話',
      '傳一張今天看見的天空或街景',
      '問問對方今天累不累',
      '整理一個你們共同喜歡的小主題',
      '把一段讓你笑的聊天截圖收藏',
      '留意對方喜歡的食物或飲料',
      '寫下你覺得對方可愛的一個地方'
    ],
    capsuleIdeas: [
      '第一次覺得聊天變自然',
      '開始分享日常的一天',
      '一個被記住的小習慣',
      '一句剛好讓人安心的話',
      '慢慢熟悉後的舒服感',
      '普通日子裡的特別位置',
      '一段聊到捨不得結束的晚上',
      '從好奇變成在意的轉折'
    ]
  },
  {
    untilDay: 75,
    label: '靠近',
    noteOpenings: [
      '有些心意沒有立刻說破，但已經在日常裡露出一點光',
      '你們開始不只分享生活，也開始把對方放進計畫裡',
      '今天的靠近，比昨天更像一個答案',
      '曖昧最可愛的地方，是兩個人都在小心確認',
      '大笨蛋北七想著小笨蛋粽子時，距離好像也沒那麼遠',
      '有些關心一說出口，就不只是普通朋友了',
      '慢慢靠近的日子裡，心意正在變得清楚',
      '今天也許沒有告白，但已經有了很像喜歡的溫柔'
    ],
    noteDetails: [
      '不用急著定義，能一起往前就已經很好',
      '把心動放慢一點，才有時間看清楚它的樣子',
      '你們不是突然變重要，是每天都多重要一點',
      '那些想多聊一下的念頭，都在替答案鋪路',
      '如果開始期待對方的出現，那就是心裡有位置了',
      '這段不急不躁的靠近，很適合被溫柔收藏',
      '喜歡有時候不是一句話，是很多次沒有離開',
      '今天的在意，也許就是後來的確定'
    ],
    taskIdeas: [
      '寫下一個你最近開始在意對方的瞬間',
      '準備一個不刻意但很溫柔的關心',
      '問問對方最近最期待什麼',
      '記下一件想和對方一起完成的小事',
      '挑一首像現在心情的歌',
      '把想說但還沒說的話寫在備忘錄',
      '分享一個自己的小弱點',
      '想一想你們如果見面，第一站想去哪裡'
    ],
    capsuleIdeas: [
      '心意開始變明顯的一天',
      '一句不像普通朋友的關心',
      '想把對方放進計畫裡的瞬間',
      '還沒說破但已經靠近的時期',
      '一點點心動，一點點確認',
      '開始想像見面的畫面',
      '讓人捨不得已讀不回的訊息',
      '兩個人都在慢慢靠近的證據'
    ]
  },
  {
    untilDay: 98,
    label: '確認心意',
    noteOpenings: [
      '慢慢走到這裡，喜歡不再只是猜測',
      '你們終於把心意看得更清楚了一點',
      '從相識到現在，答案不是突然出現，是一起長出來的',
      '今天適合承認：對方已經不是普通的存在',
      '大笨蛋北七和小笨蛋粽子，正在把彼此放進更重要的位置',
      '決定靠近以後，等待也有了新的名字',
      '你們不是急著開始，而是慢慢確定這份喜歡',
      '這段關係終於從也許，走向了更肯定的我們'
    ],
    noteDetails: [
      '交往不是衝動，是那些日常累積出的安心',
      '能慢慢決定，反而顯得這份心意更珍貴',
      '願你們把喜歡說得真誠，也把彼此照顧得安穩',
      '從今天開始，想念有了更清楚的方向',
      '確認心意以後，很多小事都變得更甜',
      '這不是一場突然的浪漫，是兩個人認真走來的結果',
      '把這份確定收好，它會陪你們走到見面那天',
      '故事沒有變得誇張，只是更真了'
    ],
    taskIdeas: [
      '寫下你想好好珍惜對方的一個原因',
      '替你們的關係留一句溫柔註解',
      '說一句明確但不浮誇的喜歡',
      '記下今天最想感謝對方的地方',
      '整理一個見面時想完成的小願望',
      '把 8 月 14 日加入重要提醒',
      '確認彼此都舒服的相處方式',
      '給對方一個安穩的晚安'
    ],
    capsuleIdeas: [
      '慢慢決定要交往的心情',
      '從相識走到喜歡的證明',
      '把彼此放進更重要的位置',
      '第一次清楚說出在意',
      '關係變得更確定的一天',
      '不是衝動，是累積出來的喜歡',
      '開始以我們想事情的瞬間',
      '交往前後那份安穩的甜'
    ]
  },
  {
    untilDay: 118,
    label: '見面倒數',
    noteOpenings: [
      '心意確定以後，小飛機的目的地也更亮了',
      '現在的倒數，不只是日期靠近，也是你們靠近',
      '台南到上海的航線，正在替第一次見面鋪路',
      '今天的等待有了更甜的重量',
      '小笨蛋粽子離大笨蛋北七的城市又近了一點',
      '見面這件事，開始從想像變成計畫',
      '你們把喜歡帶進倒數裡，日子也變得更有光',
      '每一天少一點距離，就多一點真實'
    ],
    noteDetails: [
      '把行程慢慢整理好，也把心情慢慢照顧好',
      '不用把見面想得完美，只要真實就會很珍貴',
      '第一次見面的前奏，適合溫柔也適合期待',
      '想像裡的擁抱，正在往現實靠近',
      '這段等待會在見面那天變成很亮的回憶',
      '緊張可以有，因為它也是在乎的一部分',
      '把想說的話留一點給當天，讓眼睛先替你們說',
      '願這趟靠近順利，願那天剛剛好'
    ],
    taskIdeas: [
      '確認一次見面當天的時間安排',
      '準備一套舒服又好看的穿搭',
      '挑一家見面後想一起吃的店',
      '檢查交通、住宿或證件資訊',
      '寫下見面第一件想做的事',
      '整理想帶的小物或小驚喜',
      '把想拍的照片構圖記下來',
      '留一點空白時間給自然發生的事'
    ],
    capsuleIdeas: [
      '小飛機開始認真靠近終點',
      '第一次見面的行程雛形',
      '想一起吃飯的清單',
      '見面當天想穿的樣子',
      '行李裡留給期待的位置',
      '快要見面前的緊張和甜',
      '上海終點越來越清楚',
      '想把線上日常帶到現實的一天'
    ]
  },
  {
    untilDay: 129,
    label: '抵達前夕',
    noteOpenings: [
      '最後幾天，等待開始變得很像心跳',
      '小飛機快到了，故事也快要從螢幕走出來',
      '今天離見面很近，近到連緊張都變得可愛',
      '倒數進入最後一段，請把笑容提前準備好',
      '小笨蛋粽子快要真的見到大笨蛋北七了',
      '這段從 4 月 8 日開始的故事，快要翻到新的一頁',
      '現在每一分鐘都像在替見面暖身',
      '快到了，別忘了把自己照顧好'
    ],
    noteDetails: [
      '把路線、心情和想說的話都放好，剩下的交給那天',
      '不用演得很完美，真實的你們就已經很好',
      '見面之前的期待，會在第一眼變成答案',
      '願抵達順利，願開口時剛好是最自然的語氣',
      '等了這麼久，終於要把想念變成看得見的人',
      '把最後的倒數過慢一點，因為它也很值得記住',
      '明明快到了，卻更想把每個小時都珍惜起來',
      '故事沒有結束，它只是要正式開始'
    ],
    taskIdeas: [
      '最後確認路線和時間',
      '把證件、充電器和錢包放在同一處',
      '早點休息，讓明天的自己精神很好',
      '準備一段見面時想說的真心話',
      '檢查天氣和備用方案',
      '把行李放在看得見的地方',
      '給對方一句安心的晚安',
      '帶著笑容出發'
    ],
    capsuleIdeas: [
      '最後倒數的心跳聲',
      '出發前夜的安靜',
      '終點城市亮起的燈',
      '快要真實見面的前一頁',
      '把等待收進背包',
      '第一眼之前的深呼吸',
      '明天就能說你好',
      '故事正式開始前的最後一格'
    ]
  }
];

const abstractNoteOpenings = [
  '風把一小段距離摺進今天',
  '雲慢慢往同一個方向移動',
  '有些名字，會在日子裡變得柔軟',
  '時間沒有大聲說話，卻悄悄留下光',
  '今天像一張乾淨的紙，適合收藏一點想念',
  '心裡的小小航線，又亮了一點',
  '世界很大，但有些方向會越來越清楚',
  '一段故事正在慢慢學會自己的形狀',
  '海風把沒有說出口的話，輕輕推遠',
  '等待不是空白，是一種很安靜的靠近',
  '日子像慢慢展開的信紙',
  '有些溫柔不用命名，也會被記住'
];

const abstractNoteDetails = [
  '不用知道今天發生了什麼，只要知道它也在把你們往前帶。',
  '那些沒有被寫下來的片刻，也會在心裡慢慢發芽。',
  '靠近有時候很輕，輕到只像一次想起。',
  '如果故事有聲音，今天大概是很小聲的一頁。',
  '願這一天被溫柔經過，也被未來偷偷收藏。',
  '距離還在，但方向已經不是空的。',
  '有些等待不是為了抵達，而是為了把心意養得更真。',
  '今天不必具體，也可以很值得。',
  '所有尚未確定的事，都可以先交給時間。',
  '慢慢來，月光也不是一下子就照滿整條路。'
];

const abstractTaskIdeas = [
  '替今天留一句不必解釋的話',
  '挑一首適合此刻心情的歌',
  '拍下一個讓你覺得安靜的畫面',
  '把一點點期待放進備忘錄',
  '給自己一段不被打擾的時間',
  '記下一個今天想保留的顏色',
  '把心情整理成很短的一行字',
  '聽一段風聲、雨聲，或城市的聲音',
  '寫下一件讓你願意微笑的小事',
  '讓今天比昨天更柔軟一點'
];

const abstractCapsuleIdeas = [
  '一頁還沒寫完的春天',
  '藏在風裡的小小記號',
  '一顆還沒說出口的星星',
  '慢慢靠近的證明',
  '某個安靜發亮的瞬間',
  '名字開始變溫柔的地方',
  '海面上很輕的一道光',
  '一封沒有寄出的信',
  '等待裡的一點甜',
  '路途中的一枚小月亮',
  '時間替你們留下的摺痕',
  '故事還在呼吸的一頁'
];

const noteTextures = [
  '晨光把邊界擦得很淡',
  '雲影從心上慢慢經過',
  '風停在還沒說出口的地方',
  '海面替遠方留了一點亮',
  '城市把聲音收得很輕',
  '月色像一封沒有寄出的信',
  '時間把溫柔摺成小小一角',
  '午後的光落在安靜的頁邊',
  '雨意把思念洗得更透明',
  '星星在很遠的地方練習發光',
  '路燈把夜晚照得剛剛好',
  '日子在掌心留下柔軟的紋路',
  '春天把名字寫得很輕',
  '夏天慢慢靠近玻璃窗',
  '空氣裡有一點不明說的甜',
  '遠方像被一層光輕輕罩住',
  '心裡的小航線安靜延伸',
  '一頁日曆翻過去時很輕',
  '光從縫隙裡慢慢長出來',
  '想念沒有吵鬧，只是待在原地',
  '沉默也像一種很慢的靠近',
  '夜色把話語收進口袋',
  '風把今天吹成很柔的形狀',
  '雲朵替距離留下一點餘白',
  '窗邊的光像一次輕輕點頭',
  '世界暫時安靜到可以聽見心意',
  '小小的期待在角落醒來',
  '遠方不是空的，而是正在等',
  '一點微光落進普通的一天',
  '時間像細線，把兩端慢慢牽起',
  '心事在夜裡變得比較誠實',
  '海風帶走一點不確定',
  '某個方向正在變得清楚',
  '溫柔像慢慢化開的糖',
  '今天的空白也有自己的重量',
  '想念繞過城市，停在名字旁邊',
  '一小段距離被光照得很軟'
];

const noteWhispers = [
  '不必急著命名，也會被時間記住',
  '不用具體，也能在心裡留下位置',
  '尚未抵達的事，正在路上慢慢成形',
  '有些靠近很安靜，卻從來沒有停下',
  '願今天被輕輕收藏，等以後再回頭看',
  '心意可以很小聲，但方向會很明亮',
  '每一個普通日子，都在替故事鋪一層光',
  '等風再近一些，答案也會更清楚一些',
  '把未完成留給明天，也是一種溫柔',
  '距離還在，可是等待已經有了形狀',
  '不說太滿，反而更像真心',
  '這一頁慢慢翻過，就離下一頁更近',
  '日子沒有劇情，也可以很值得',
  '那些沒有被寫下的片刻，也會發芽',
  '讓心意在安靜裡長大一點',
  '今天只需要好好經過，就已經很好',
  '如果有光，它大概正落在同一個方向',
  '故事不催促，只是一天一天變深',
  '尚未說出的話，先交給風保管',
  '靠近不是聲響，是慢慢亮起的路',
  '願所有不確定，都被時間照得柔和',
  '有些等待，本身就是一種回答',
  '今天的溫柔不用證明，它自己存在',
  '把心放慢，才聽得見細小的甜',
  '未來還沒來，但已經有了輪廓',
  '一切都可以慢慢，除了想見面的方向',
  '這份安靜會被保存到很久以後',
  '在還沒見面以前，先讓期待好好呼吸',
  '願每一段空白，都不是空白',
  '小小的一天，也能藏下一整片星光',
  '沒有大事發生，也能更靠近一點'
];

const taskMotions = [
  '替今天留下一個溫柔的標點',
  '把心情寫成一句很短的風景',
  '收集一種讓人安靜下來的顏色',
  '選一首適合放慢腳步的歌',
  '拍下一個不需要解釋的畫面',
  '把一點期待放進備忘錄',
  '讓自己比昨天更早休息一點',
  '寫下一句想交給未來的話',
  '整理一個小小的心情角落',
  '為今天保留三分鐘的空白',
  '記住一個讓你覺得柔軟的瞬間',
  '把不安折小，放到明天再看',
  '聽一段城市裡很輕的聲音',
  '把想念寫得含蓄一點',
  '讓今天有一個乾淨的收尾',
  '找一個適合微笑的理由',
  '把手機裡的一張照片留給以後',
  '給遠方一個很小聲的祝福',
  '把今天的光記成一個詞',
  '替心裡的航線畫一個小點'
];

const taskObjects = [
  '一枚月亮',
  '一陣風',
  '一片雲',
  '一盞路燈',
  '一段旋律',
  '一頁日曆',
  '一個名字',
  '一點星光',
  '一封沒寄出的信',
  '一條海岸線',
  '一杯溫熱的水',
  '一個安靜的午後',
  '一小段路',
  '一張乾淨的紙',
  '一顆慢慢靠近的心',
  '一個還沒抵達的答案',
  '一行很輕的字',
  '一個剛好的晚安',
  '一場尚未落下的雨',
  '一個被保存的瞬間',
  '一點不張揚的甜',
  '一朵停在遠方的雲',
  '一個藏好的微笑'
];

const capsuleAdjectives = [
  '柔軟',
  '安靜',
  '微亮',
  '透明',
  '輕盈',
  '含蓄',
  '溫熱',
  '遙遠',
  '清澈',
  '緩慢',
  '細小',
  '明亮',
  '乾淨',
  '靜謐',
  '真實',
  '未完成',
  '剛剛好',
  '不張揚',
  '被珍藏'
];

const capsuleNouns = [
  '春天摺痕',
  '雲邊註記',
  '海風頁碼',
  '星光標本',
  '月色便條',
  '航線小點',
  '心事書籤',
  '日曆微光',
  '遠方回音',
  '信紙角落',
  '城市餘溫',
  '名字影子',
  '等待碎片',
  '玻璃窗光',
  '午後停格',
  '雨聲小節',
  '路燈倒影',
  '沉默花瓣',
  '靠近證明',
  '未寄信封',
  '夏日序章',
  '時間細線',
  '故事側臉'
];

const specialJourneyDays: Record<string, Omit<JourneyDay, 'dateLabel'>> = {
  '2026-04-19': {
    note: `第 12 天｜警覺。小笨蛋粽子把心門留了一條縫，也把雷達開得很亮；大笨蛋北七在遠方努力看起來不像詐騙。`,
    task: '4 月 19 日 小任務：把可疑和可愛都先放進同一個抽屜，明天再看一次。',
    capsule: '4 月 19 日｜警覺：差點被歸類成詐騙的一頁。'
  },
  '2026-04-20': {
    note: `第 13 天｜觀察。懷疑還沒有完全退潮，但故事沒有被關掉；有些真心，剛開始也需要通過兩天的防詐測試。`,
    task: '4 月 20 日 小任務：給直覺一點時間，也給溫柔一點空間。',
    capsule: '4 月 20 日｜觀察：防詐雷達持續運轉的第二天。'
  }
};

const suitcaseItems = ['笑容', '證件', '充電器', '耳機', '勇氣', '想說的話', '一點點可愛', '見面時的慢慢來'];

const moodOptions: MoodOption[] = [
  { id: 'sunny', icon: '晴', label: '晴', line: '今天心裡有一點乾淨的光。' },
  { id: 'cloudy', icon: '雲', label: '微雲', line: '雲在，心也可以慢慢走。' },
  { id: 'rainy', icon: '雨', label: '小雨', line: '雨聲把想念洗得更清楚。' },
  { id: 'starry', icon: '星', label: '星夜', line: '夜裡有星，遠方就不算太遠。' }
];

const secretWhispers = [
  '有些喜歡還沒說出口，就已經先在心裡坐好了。',
  '如果今天有一點想念，那就讓它悄悄發光。',
  '遠方不是距離，是小笨蛋粽子正在飛去的方向。',
  '大笨蛋北七也許很北七，但故事偏偏把他留了下來。',
  '等見面那天，所有慢慢來都會變成剛剛好。',
  '喜歡不一定要很大聲，安靜一點也很真。',
  '這一段等待，是兩個笨蛋一起寫的小詩。',
  '如果心跳有航班，它今天也準時起飛了。'
];

const fortuneDeck: Fortune[] = [
  { title: '今日宜慢慢靠近', line: '把話說輕一點，心意會自己留下來。' },
  { title: '今日宜保存微光', line: '不需要很盛大，一點點亮就夠了。' },
  { title: '今日宜相信直覺', line: '直覺不必催促，只要陪你看清楚。' },
  { title: '今日宜好好吃飯', line: '照顧自己，也是把見面那天照顧好。' },
  { title: '今日宜收起不安', line: '把不安折小，放進明天會變輕。' },
  { title: '今日宜想一件甜事', line: '甜不用很多，剛好能讓嘴角上揚就行。' },
  { title: '今日宜把路走慢', line: '慢慢走，才看得見沿途的光。' },
  { title: '今日宜留白', line: '有些空白，是為了讓故事呼吸。' },
  { title: '今日宜聽風', line: '風會把沒有說出口的話帶遠一點。' },
  { title: '今日宜晚安早一點', line: '夢裡也可以讓小飛機補一點油。' }
];

const timelineEvents: TimelineEvent[] = [
  { date: '4/8', title: '相識', text: '故事從一個輕輕的招呼開始。', dayIndex: 0 },
  { date: '4/19', title: '防詐觀察', text: '小笨蛋粽子的雷達開始發光。', dayIndex: 11 },
  { date: '4/20', title: '繼續觀察', text: '大笨蛋北七暫時通過第二天測試。', dayIndex: 12 },
  { date: '5 月', title: '熟悉發芽', text: '名字慢慢變成日常裡柔軟的位置。', dayIndex: 30 },
  { date: '6 月', title: '慢慢靠近', text: '心意還不急著說滿，但方向清楚了。', dayIndex: 62 },
  { date: '7 月', title: '確認心意', text: '喜歡不是突然，是一點一點走來。', dayIndex: 91 },
  { date: '8/14', title: '第一次見面', text: '等待結束，故事正式開始。', dayIndex: 128 }
];

const defaultSecretCodes = ['北七粽子', '粽子北七', '大笨蛋小笨蛋', '小笨蛋大笨蛋'];

const hiddenCardLines = [
  '暗號正確。這裡藏著一張只給兩個笨蛋看的小卡：願每一次靠近，都有剛剛好的勇氣。',
  '如果世界很吵，就把這張卡當成你們的小房間。門外是日子，門內是溫柔。',
  '從 4 月 8 日開始，有些光就不再只是普通的光了。'
];

const dailyQuestions: DailyQuestion[] = [
  { prompt: '今天想把哪一種風寄給對方？', hint: '可以是海風、晚風，也可以是不知道名字的風。' },
  { prompt: '今天心裡最像哪一種天氣？', hint: '不一定要晴天，微雲也很適合想念。' },
  { prompt: '如果今天是一封信，信封會是什麼顏色？', hint: '選一個不用解釋也喜歡的顏色。' },
  { prompt: '今天想替未來保留哪一個小瞬間？', hint: '越普通越好，普通才會長久。' },
  { prompt: '如果小飛機能帶一句話，它會帶什麼？', hint: '一句很短、很輕、很真的話。' },
  { prompt: '今天哪一個字最接近你的心情？', hint: '光、風、慢、近、等，都可以。' },
  { prompt: '想像見面的第一分鐘，背景會有什麼聲音？', hint: '腳步聲、風聲、心跳聲，都算。' },
  { prompt: '今天想把哪一點勇氣放進行李箱？', hint: '小小一點就好，會累積的。' }
];

const radarChoices: RadarChoice[] = [
  { id: 'smooth', label: '太會說話', result: '雷達震動：有點可疑，但語氣還算真誠，先扣 12 分再觀察。' },
  { id: 'mystery', label: '太神祕', result: '雷達亮燈：神祕值偏高，建議小笨蛋粽子保持聰明。' },
  { id: 'soft', label: '有點可愛', result: '雷達遲疑：可愛會干擾判斷，但暫時沒有封鎖必要。' }
];

const meetingChecklistItems = ['出門', '登機', '抵達上海', '看到大笨蛋北七', '說出第一句話'];

const meetingMomentItems: MeetingMoment[] = [
  { id: 'breathe', label: '先把路上的緊張慢慢放下' },
  { id: 'first-look', label: '把第一眼好好記住' },
  { id: 'walk', label: '留一段不用安排的散步' },
  { id: 'photo', label: '把今天的一張照片收進回憶' },
  { id: 'quiet', label: '留一句只有彼此聽見的話' }
];

const now = ref(new Date());
const taskCompleted = ref(false);
const dailyMessage = ref('');
const selectedMoodId = ref('');
const secretRevealed = ref(false);
const secretMailed = ref(false);
const suitcaseChecked = ref<string[]>([]);
const flippedCapsules = ref<number[]>([]);
const sparkles = ref<Sparkle[]>([]);
const radarScanned = ref(false);
const checkins = ref<string[]>([]);
const fortuneTitle = ref('');
const fortuneLine = ref('');
const moodHistory = ref<string[]>([]);
const planeDrag = ref<PlaneDragState>({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
const secretCodeInput = ref('');
const secretCodeUnlocked = ref(false);
const memoryPhotos = ref<MemoryPhoto[]>([]);
const dailyAnswer = ref('');
const radarChoiceId = ref('');
const meetingChecklist = ref<string[]>([]);
const activeTab = ref<ActiveTab>('countdown');
const capsuleShowAll = ref(false);
const isOnline = ref(navigator.onLine);
const installReady = ref(false);
const customSecretCodes = ref<string[]>([]);
const newSecretCode = ref('');
const importMessage = ref('');
const pendingImport = ref<AppExportData | null>(null);
const importMode = ref<'merge' | 'replace'>('merge');
const settings = ref<AppSettings>({ ...defaultSettings });
const settingsDraft = ref<AppSettings>({ ...defaultSettings });
const ritualOpened = ref(false);
const ritualComplete = ref(false);
const shareCopied = ref(false);
const updateReady = ref(false);
const wishes = ref<WishItem[]>([]);
const newWish = ref('');
const meetingMoments = ref<string[]>([]);
const sceneTilt = ref({ x: 0, y: 0 });
const introActive = ref(true);
const introClosing = ref(false);
const introMode = ref<'first' | 'returning'>('first');
const flipUnits = ref<CountdownUnit[]>([]);
const burstParticles = ref<BurstParticle[]>([]);
const themeTransition = ref(false);
const packingItems = ref<string[]>([]);
const milestoneFlash = ref(false);
const secretPressing = ref(false);
const appUnlocked = ref(false);
const passwordInput = ref('');
const passwordStatus = ref('');
const passwordBusy = ref(false);
const passwordSuccess = ref(false);
const cloudToken = ref('');
const cloudStatus = ref('尚未同步');
const cloudSyncBusy = ref(false);
const cloudSyncConfigured = isCloudSyncConfigured();

let timer: number | undefined;
let secretPressTimer: number | undefined;
let planeResetTimer: number | undefined;
let introTimer: number | undefined;
let passwordSuccessTimer: number | undefined;
let themeTransitionTimer: number | undefined;
let milestoneTimer: number | undefined;
let cloudSyncTimer: number | undefined;
let deferredInstallPrompt: Event | null = null;
let refreshingForUpdate = false;
let sparkleId = 0;
let burstId = 0;
let previousProgressMilestone = 0;
let lastCloudSnapshot = '';
let loadingCloudSnapshot = false;

const todayStart = computed(() => startOfDay(now.value));
const configuredStartDate = computed(() => {
  const [year, month, day] = parseDateSetting(settings.value.startDate);
  const [hours, minutes] = parseClockTime(settings.value.startTime, defaultSettings.startTime);
  return new Date(year, month - 1, day, hours, minutes, 0);
});
const configuredStartDay = computed(() => startOfDay(configuredStartDate.value));
const rawDayIndex = computed(() => Math.floor((todayStart.value.getTime() - configuredStartDay.value.getTime()) / DAY_MS));
const unlockedCount = computed(() => {
  if (todayStart.value.getTime() < configuredStartDay.value.getTime()) return 0;
  return Math.min(rawDayIndex.value + 1, journeyDays.value.length);
});
const targetDate = computed(() => {
  const [hours, minutes] = parseClockTime(settings.value.targetTime, defaultSettings.targetTime);
  return new Date(2026, 7, 14, hours, minutes, 0);
});
const journeyDays = computed(() => createJourneyDays(configuredStartDay.value, targetDate.value));
const currentDayIndex = computed(() => clamp(rawDayIndex.value, 0, journeyDays.value.length - 1));
const targetDayStart = computed(() => startOfDay(targetDate.value));
const isMeetingDay = computed(() => todayStart.value.getTime() >= targetDayStart.value.getTime());
const countdown = computed<Countdown>(() => getCountdown(now.value, targetDate.value));
const progress = computed(() => {
  const total = targetDate.value.getTime() - configuredStartDate.value.getTime();
  const elapsed = now.value.getTime() - configuredStartDate.value.getTime();
  if (total <= 0) return 1;
  return clamp(elapsed / total, 0, 1);
});
const progressPercent = computed(() => Math.round(progress.value * 100));
const planeStyle = computed(() => {
  const x = 11 + progress.value * 75;
  const y = 72 - progress.value * 47;
  return {
    left: `calc(${x}% + ${planeDrag.value.offsetX}px)`,
    top: `calc(${y}% + ${planeDrag.value.offsetY}px)`
  };
});
const planeTrailStyle = computed(() => {
  const x = 11 + progress.value * 75;
  const y = 72 - progress.value * 47;
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${Math.max(42, progressPercent.value * 1.05)}px`
  };
});
const routeFillStyle = computed(() => ({
  width: `${progressPercent.value}%`
}));
const dateKey = computed(() => formatDateKey(todayStart.value));
const todayJourney = computed(() => journeyDays.value[currentDayIndex.value]);
const todayNote = computed(() =>
  isMeetingDay.value
    ? `等待結束，故事正式開始。${BOY_NAME} 和 ${GIRL_NAME}，終於可以見面了。❤️`
    : todayJourney.value.note
);
const todayTask = computed(() => todayJourney.value.task);
const selectedMood = computed(() => moodOptions.find((mood) => mood.id === selectedMoodId.value));
const selectedMoodLine = computed(() => selectedMood.value?.line ?? '今天的心情還沒有命名，先留一點空白也很好。');
const closenessLabel = computed(() => getClosenessLabel(progressPercent.value));
const secretWhisper = computed(() => pick(secretWhispers, currentDayIndex.value * 5));
const isScamRadarDay = computed(() => dateKey.value === '2026-04-19' || dateKey.value === '2026-04-20');
const radarResult = computed(() =>
  dateKey.value === '2026-04-19'
    ? '可疑程度 87%，但可愛程度也很高。建議小笨蛋粽子繼續觀察。'
    : '可疑程度 62%，真心訊號開始變強。防詐雷達暫時不拉警報。'
);
const savedMessageLine = computed(() =>
  dailyMessage.value.trim() ? dailyMessage.value.trim() : '今天還沒有寄出紙飛機留言。'
);
const suitcaseProgress = computed(() => Math.round((suitcaseChecked.value.length / suitcaseItems.length) * 100));
const checkedInToday = computed(() => checkins.value.includes(dateKey.value));
const checkinStreak = computed(() => getCheckinStreak(checkins.value, todayStart.value));
const fortuneReady = computed(() => Boolean(fortuneTitle.value && fortuneLine.value));
const moodBottleDots = computed(() =>
  moodHistory.value.slice(-42).map((entry, index) => ({
    id: `${entry}-${index}`,
    moodId: entry.split(':')[1] ?? 'sunny',
    left: `${8 + ((index * 17) % 82)}%`,
    bottom: `${8 + Math.floor(index / 7) * 12}%`
  }))
);
const timelineProgressStyle = computed(() => ({
  width: `${progressPercent.value}%`
}));
const preparationStats = computed(() => {
  const messageBoost = dailyMessage.value.trim() ? 18 : 0;
  const taskBoost = taskCompleted.value ? 22 : 0;
  const moodBoost = selectedMoodId.value ? 14 : 0;
  const suitcaseBoost = Math.round(suitcaseProgress.value * 0.35);
  const secretBoost = secretRevealed.value ? 11 : 0;
  const checkinBoost = checkedInToday.value ? 9 : 0;

  return [
    { label: '精神', value: clamp(32 + taskBoost + moodBoost + checkinBoost, 0, 100) },
    { label: '勇氣', value: clamp(28 + secretBoost + messageBoost + checkinStreak.value * 3, 0, 100) },
    { label: '期待', value: clamp(36 + suitcaseBoost + messageBoost + Math.round(progress.value * 18), 0, 100) }
  ];
});
const hiddenCardLine = computed(() => pick(hiddenCardLines, currentDayIndex.value * 3));
const todayQuestion = computed(() => pick(dailyQuestions, currentDayIndex.value * 5));
const radarChoiceResult = computed(() => radarChoices.find((choice) => choice.id === radarChoiceId.value)?.result ?? '');
const meetingChecklistProgress = computed(() =>
  Math.round((meetingChecklist.value.length / meetingChecklistItems.length) * 100)
);
const theaterLights = computed(() =>
  Array.from({ length: 18 }, (_, index) => ({
    id: index,
    left: `${6 + ((index * 17) % 88)}%`,
    top: `${10 + ((index * 23) % 76)}%`,
    delay: `${(index % 6) * 160}ms`
  }))
);
const openingStars = computed(() =>
  Array.from({ length: 32 }, (_, index) => ({
    id: index,
    left: `${4 + ((index * 29) % 92)}%`,
    top: `${6 + ((index * 37) % 86)}%`,
    delay: `${(index % 9) * 130}ms`,
    size: `${3 + (index % 4)}px`
  }))
);
const backgroundMotes = computed(() =>
  Array.from({ length: 22 }, (_, index) => ({
    id: index,
    left: `${3 + ((index * 31) % 94)}%`,
    top: `${4 + ((index * 19) % 90)}%`,
    delay: `${(index % 11) * 240}ms`,
    size: `${4 + (index % 5)}px`
  }))
);
const backgroundBeams = computed(() =>
  Array.from({ length: 5 }, (_, index) => ({
    id: index,
    left: `${8 + index * 21}%`,
    delay: `${index * 420}ms`
  }))
);
const secretCodeList = computed(() => [...defaultSecretCodes, ...customSecretCodes.value]);
const displayBoyName = computed(() => settings.value.boyName.trim() || BOY_NAME);
const displayGirlName = computed(() => settings.value.girlName.trim() || GIRL_NAME);
const startDateLabel = computed(() => `${settings.value.startDate} ${settings.value.startTime}`);
const targetDateLabel = computed(() => `2026 年 8 月 14 日 ${settings.value.targetTime}`);
const themeClass = computed(() => `theme-${settings.value.theme}`);
const openingThemeLabel = computed(() => {
  if (settings.value.theme === 'mint') return '清風啟程';
  if (settings.value.theme === 'night') return '夜航啟動';
  return '暖光啟程';
});
const openingChapters = computed(() =>
  introMode.value === 'first'
    ? ['暗號通過', '同步回憶', '校準航線', '打開今天']
    : ['歡迎回來', '更新今日', '校準距離', '回到倒數']
);
const ritualSteps = computed(() => [
  { id: 'open', label: '打開今日文案', done: ritualOpened.value },
  { id: 'fortune', label: '抽一張今日小籤', done: fortuneReady.value },
  { id: 'mood', label: '收進一顆心情光點', done: Boolean(selectedMoodId.value) },
  { id: 'task', label: '完成今日小任務', done: taskCompleted.value }
]);
const ritualProgress = computed(() =>
  Math.round((ritualSteps.value.filter((step) => step.done).length / ritualSteps.value.length) * 100)
);
const dailyReceipt = computed(() =>
  [
    `第一次見面倒數｜${dateKey.value}`,
    `${displayGirlName.value} → ${displayBoyName.value}`,
    `靠近度：${progressPercent.value}%`,
    `今日文案：${todayNote.value}`,
    `今日小籤：${fortuneReady.value ? `${fortuneTitle.value}｜${fortuneLine.value}` : '還沒抽，留給一點未知'}`,
    `心情：${selectedMood.value?.label ?? '還沒命名'}`,
    `任務：${taskCompleted.value ? '已完成' : todayTask.value}`
  ].join('\n')
);
const meetingSummary = computed(() => [
  { label: '已解鎖膠囊', value: `${unlockedCount.value}/${journeyDays.value.length}` },
  { label: '連續打卡', value: `${checkinStreak.value} 天` },
  { label: '回憶照片', value: `${memoryPhotos.value.length} 張` },
  { label: '完成願望', value: `${wishes.value.filter((wish) => wish.done).length}/${wishes.value.length}` }
]);
const meetingSummaryLine = computed(() => {
  const moodLabel = selectedMood.value?.label ?? '未命名';
  return `目前靠近度 ${progressPercent.value}%，心情是「${moodLabel}」，已完成 ${meetingMoments.value.length} 個見面前想保留的瞬間。`;
});
const pendingImportSummary = computed(() => {
  if (!pendingImport.value) return '';
  return `準備${importMode.value === 'replace' ? '覆蓋' : '合併'}：${Object.keys(pendingImport.value.localStorage).length} 筆紀錄、${pendingImport.value.photos.length} 張照片。`;
});
const sceneStyle = computed(() => ({
  '--scene-tilt-x': `${sceneTilt.value.x}deg`,
  '--scene-tilt-y': `${sceneTilt.value.y}deg`
}));
const activeTabIndex = computed(() => {
  const tabs: ActiveTab[] = ['countdown', 'today', 'memories', 'prepare'];
  return Math.max(tabs.indexOf(activeTab.value), 0);
});
const navIndicatorStyle = computed(() => ({
  transform: `translateX(calc(${activeTabIndex.value * 100}% + ${activeTabIndex.value * 6}px))`
}));

const visibleCapsules = computed(() =>
  journeyDays.value.map((day, index) => ({
    text: day.capsule,
    dateLabel: day.dateLabel,
    index,
    unlocked: index < unlockedCount.value,
    flipped: flippedCapsules.value.includes(index)
  }))
);
const visibleCapsulesDisplay = computed(() => {
  if (capsuleShowAll.value) return visibleCapsules.value;
  const unlocked = visibleCapsules.value.filter((capsule) => capsule.unlocked);
  const recent = unlocked.slice(Math.max(unlocked.length - 7, 0));
  const lockedPreview = visibleCapsules.value.find((capsule) => !capsule.unlocked);
  return lockedPreview ? [...recent, lockedPreview] : recent;
});

watch(
  dateKey,
  (key) => {
    loadDailyState(key);
  },
  { immediate: true }
);

watch(countdown, (next, previous) => {
  if (!previous) return;
  const changed = (['days', 'hours', 'minutes'] as CountdownUnit[]).filter(
    (unit) => next[unit] !== previous[unit]
  );
  if (!changed.length) return;

  flipUnits.value = Array.from(new Set([...flipUnits.value, ...changed]));
  window.setTimeout(() => {
    flipUnits.value = flipUnits.value.filter((unit) => !changed.includes(unit));
  }, 520);
});

watch(progressPercent, (value) => {
  const milestone = [90, 75, 50, 25].find((mark) => value >= mark) ?? 0;
  if (!milestone || milestone === previousProgressMilestone) return;
  previousProgressMilestone = milestone;
  triggerMilestoneWave();
});

onMounted(() => {
  loadSettings();
  loadSuitcase();
  loadCheckins();
  loadMoodHistory();
  loadSecretCode();
  loadCustomSecretCodes();
  loadMemoryPhotos();
  loadMeetingChecklist();
  loadWishes();
  loadMeetingMoments();
  checkForAppUpdate();
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('pointermove', updateSceneTilt);
  navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
  timer = window.setInterval(() => {
    now.value = new Date();
  }, 1_000);
  restoreSavedCloudSession();
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
  if (planeResetTimer) window.clearTimeout(planeResetTimer);
  if (introTimer) window.clearTimeout(introTimer);
  if (passwordSuccessTimer) window.clearTimeout(passwordSuccessTimer);
  if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
  if (milestoneTimer) window.clearTimeout(milestoneTimer);
  if (cloudSyncTimer) window.clearInterval(cloudSyncTimer);
  window.removeEventListener('online', updateOnlineState);
  window.removeEventListener('offline', updateOnlineState);
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.removeEventListener('pointermove', updateSceneTilt);
  navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
  cancelSecretPress();
});

async function unlockApp() {
  if (!cloudSyncConfigured) {
    passwordStatus.value = '尚未設定雲端 API，請先部署 Google Cloud Run 並設定 VITE_CLOUD_API_URL。';
    return;
  }

  const password = passwordInput.value.trim();
  if (!password) {
    passwordStatus.value = '請輸入密碼。提示：小笨蛋生日。';
    return;
  }

  passwordBusy.value = true;
  passwordStatus.value = '正在確認密碼...';

  try {
    cloudToken.value = await requestCloudSession(password);
    passwordSuccess.value = true;
    passwordStatus.value = '暗號通過，正在打開今天。';
    await waitForPasswordSuccess();
    appUnlocked.value = true;
    startOpeningSequence();
    passwordSuccess.value = false;
    passwordInput.value = '';
    passwordStatus.value = '';
    await loadCloudData();
    startCloudSyncLoop();
  } catch {
    clearCloudSession();
    cloudToken.value = '';
    appUnlocked.value = false;
    passwordSuccess.value = false;
    passwordStatus.value = '密碼不對，提示：小笨蛋生日。';
  } finally {
    passwordBusy.value = false;
  }
}

function restoreSavedCloudSession() {
  if (!cloudSyncConfigured) {
    cloudStatus.value = '尚未設定雲端 API';
    return;
  }

  const token = restoreCloudSession();
  if (!token) return;

  cloudToken.value = token;
  appUnlocked.value = true;
  startOpeningSequence();
  void loadCloudData().then(startCloudSyncLoop).catch(() => {
    clearCloudSession();
    cloudToken.value = '';
    appUnlocked.value = false;
    passwordStatus.value = '登入已過期，請重新輸入密碼。';
  });
}

async function loadCloudData() {
  if (!cloudToken.value) return;

  loadingCloudSnapshot = true;
  cloudStatus.value = '正在載入雲端資料...';

  try {
    const cloudData = await fetchCloudState(cloudToken.value);
    if (cloudData) {
      restoreAppLocalStorage(cloudData.localStorage, 'replace');
      memoryPhotos.value = cloudData.photos;
      await savePhotos(memoryPhotos.value);
      reloadPersistentState();
      cloudStatus.value = '已載入雲端資料';
    } else {
      cloudStatus.value = '雲端還沒有資料，會用目前裝置建立第一份資料';
    }
    lastCloudSnapshot = getComparableCloudSnapshot();
    if (!cloudData) {
      await syncCloudNow(true);
    }
  } finally {
    loadingCloudSnapshot = false;
  }
}

function startCloudSyncLoop() {
  if (cloudSyncTimer) return;
  cloudSyncTimer = window.setInterval(() => {
    void syncCloudNow();
  }, 12_000);
  window.setTimeout(() => {
    void syncCloudNow();
  }, 900);
}

async function syncCloudNow(force = false) {
  if (!appUnlocked.value || !cloudToken.value || cloudSyncBusy.value || loadingCloudSnapshot) return;

  const snapshot = getComparableCloudSnapshot();
  if (!force && snapshot === lastCloudSnapshot) return;

  cloudSyncBusy.value = true;
  cloudStatus.value = '正在同步雲端...';

  try {
    await saveCloudState(cloudToken.value, createExportData(memoryPhotos.value));
    lastCloudSnapshot = snapshot;
    cloudStatus.value = `已同步 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    cloudStatus.value = '同步失敗，稍後會再試一次';
  } finally {
    cloudSyncBusy.value = false;
  }
}

function getComparableCloudSnapshot() {
  const data = createExportData(memoryPhotos.value);
  return JSON.stringify({
    localStorage: data.localStorage,
    photos: data.photos
  });
}

function lockApp() {
  clearCloudSession();
  cloudToken.value = '';
  appUnlocked.value = false;
  passwordInput.value = '';
  passwordStatus.value = '';
  cloudStatus.value = '已鎖定';
  if (cloudSyncTimer) {
    window.clearInterval(cloudSyncTimer);
    cloudSyncTimer = undefined;
  }
}

function toggleTask() {
  taskCompleted.value = !taskCompleted.value;
  const key = storageKey('task', dateKey.value);

  if (taskCompleted.value) {
    localStorage.setItem(key, 'done');
    launchThemeBurst();
    gentleVibrate(12);
    return;
  }

  localStorage.removeItem(key);
}

function loadDailyState(key: string) {
  taskCompleted.value =
    localStorage.getItem(storageKey('task', key)) === 'done' ||
    localStorage.getItem(`first-meeting-task:${key}`) === 'done';
  dailyMessage.value = localStorage.getItem(storageKey('message', key)) ?? '';
  selectedMoodId.value = localStorage.getItem(storageKey('mood', key)) ?? '';
  secretRevealed.value = localStorage.getItem(storageKey('secret', key)) === 'open';
  secretMailed.value = localStorage.getItem(storageKey('secret-mailed', key)) === 'yes';
  fortuneTitle.value = localStorage.getItem(storageKey('fortune-title', key)) ?? '';
  fortuneLine.value = localStorage.getItem(storageKey('fortune-line', key)) ?? '';
  dailyAnswer.value = localStorage.getItem(storageKey('question-answer', key)) ?? '';
  radarChoiceId.value = localStorage.getItem(storageKey('radar-choice', key)) ?? '';
  ritualOpened.value = localStorage.getItem(storageKey('ritual-opened', key)) === 'yes';
  ritualComplete.value = localStorage.getItem(storageKey('ritual-complete', key)) === 'yes';
  shareCopied.value = false;
  radarScanned.value = false;
}

function saveDailyMessage() {
  const message = dailyMessage.value.trim();

  if (message) {
    localStorage.setItem(storageKey('message', dateKey.value), message);
    dailyMessage.value = message;
    gentleVibrate(10);
    return;
  }

  localStorage.removeItem(storageKey('message', dateKey.value));
  dailyMessage.value = '';
}

function clearDailyMessage() {
  localStorage.removeItem(storageKey('message', dateKey.value));
  dailyMessage.value = '';
}

function selectMood(moodId: string) {
  selectedMoodId.value = moodId;
  localStorage.setItem(storageKey('mood', dateKey.value), moodId);
  addMoodHistory(moodId);
  gentleVibrate(8);
}

function toggleSuitcaseItem(item: string) {
  const checked = new Set(suitcaseChecked.value);

  if (checked.has(item)) {
    checked.delete(item);
  } else {
    checked.add(item);
  }

  suitcaseChecked.value = Array.from(checked);
  packingItems.value = [...packingItems.value.filter((value) => value !== item), item];
  window.setTimeout(() => {
    packingItems.value = packingItems.value.filter((value) => value !== item);
  }, 620);
  localStorage.setItem(storageKey('suitcase'), JSON.stringify(suitcaseChecked.value));
  gentleVibrate(8);
}

function loadSuitcase() {
  const stored = localStorage.getItem(storageKey('suitcase'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      suitcaseChecked.value = parsed.filter((item) => suitcaseItems.includes(item));
    }
  } catch {
    suitcaseChecked.value = [];
  }
}

function checkInToday() {
  if (checkedInToday.value) return;
  checkins.value = [...checkins.value, dateKey.value].sort();
  localStorage.setItem(storageKey('checkins'), JSON.stringify(checkins.value));
  launchThemeBurst();
  gentleVibrate(16);
}

function loadCheckins() {
  const stored = localStorage.getItem(storageKey('checkins'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      checkins.value = parsed.filter((item) => typeof item === 'string');
    }
  } catch {
    checkins.value = [];
  }
}

function drawFortune() {
  if (fortuneReady.value) return;
  const fortune = pick(fortuneDeck, currentDayIndex.value * 7 + dateKey.value.length);
  fortuneTitle.value = fortune.title;
  fortuneLine.value = fortune.line;
  localStorage.setItem(storageKey('fortune-title', dateKey.value), fortune.title);
  localStorage.setItem(storageKey('fortune-line', dateKey.value), fortune.line);
  gentleVibrate(14);
}

function addMoodHistory(moodId: string) {
  const entry = `${dateKey.value}:${moodId}`;
  const next = moodHistory.value.filter((item) => !item.startsWith(`${dateKey.value}:`));
  next.push(entry);
  moodHistory.value = next;
  localStorage.setItem(storageKey('mood-history'), JSON.stringify(next));
}

function loadMoodHistory() {
  const stored = localStorage.getItem(storageKey('mood-history'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      moodHistory.value = parsed.filter((item) => typeof item === 'string');
    }
  } catch {
    moodHistory.value = [];
  }
}

function toggleCapsule(index: number, unlocked: boolean) {
  if (!unlocked) return;

  const flipped = new Set(flippedCapsules.value);
  if (flipped.has(index)) {
    flipped.delete(index);
  } else {
    flipped.add(index);
  }

  flippedCapsules.value = Array.from(flipped);
}

function launchSparkles() {
  const dots = Array.from({ length: 9 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 9;
    return {
      id: sparkleId++,
      x: Math.round(Math.cos(angle) * (18 + (index % 3) * 8)),
      y: Math.round(Math.sin(angle) * (14 + (index % 2) * 10))
    };
  });

  sparkles.value = [...sparkles.value, ...dots];
  window.setTimeout(() => {
    const ids = new Set(dots.map((dot) => dot.id));
    sparkles.value = sparkles.value.filter((dot) => !ids.has(dot.id));
  }, 900);
  gentleVibrate(8);
}

function launchThemeBurst() {
  const dots = Array.from({ length: 18 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 18;
    const radius = 34 + (index % 4) * 10;
    return {
      id: burstId++,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      delay: `${(index % 5) * 28}ms`
    };
  });

  burstParticles.value = [...burstParticles.value, ...dots];
  window.setTimeout(() => {
    const ids = new Set(dots.map((dot) => dot.id));
    burstParticles.value = burstParticles.value.filter((dot) => !ids.has(dot.id));
  }, 1100);
}

function triggerMilestoneWave() {
  milestoneFlash.value = true;
  if (milestoneTimer) window.clearTimeout(milestoneTimer);
  milestoneTimer = window.setTimeout(() => {
    milestoneFlash.value = false;
  }, 1300);
}

function scanRadar() {
  radarScanned.value = true;
  playSoftSound('radar');
  gentleVibrate(18);
}

function chooseRadar(choiceId: string) {
  radarChoiceId.value = choiceId;
  localStorage.setItem(storageKey('radar-choice', dateKey.value), choiceId);
  playSoftSound('radar');
  gentleVibrate(14);
}

function startSecretPress() {
  if (secretRevealed.value) return;
  cancelSecretPress();
  secretPressing.value = true;
  secretPressTimer = window.setTimeout(() => {
    revealSecret();
  }, 1_000);
}

function cancelSecretPress() {
  secretPressing.value = false;
  if (!secretPressTimer) return;
  window.clearTimeout(secretPressTimer);
  secretPressTimer = undefined;
}

function revealSecret() {
  secretRevealed.value = true;
  localStorage.setItem(storageKey('secret', dateKey.value), 'open');
  cancelSecretPress();
  launchThemeBurst();
  playSoftSound('secret');
  gentleVibrate(16);
}

function mailSecret() {
  if (!secretRevealed.value || secretMailed.value) return;
  secretMailed.value = true;
  localStorage.setItem(storageKey('secret-mailed', dateKey.value), 'yes');
  playSoftSound('paper');
  gentleVibrate(12);
}

function unlockSecretCode() {
  const normalized = secretCodeInput.value.trim();
  if (!secretCodeList.value.includes(normalized)) return;
  secretCodeUnlocked.value = true;
  localStorage.setItem(storageKey('secret-code'), 'open');
  playSoftSound('secret');
  gentleVibrate(18);
}

function loadSecretCode() {
  secretCodeUnlocked.value = localStorage.getItem(storageKey('secret-code')) === 'open';
}

function addCustomSecretCode() {
  const code = newSecretCode.value.trim();
  if (!code || secretCodeList.value.includes(code)) return;
  customSecretCodes.value = [...customSecretCodes.value, code];
  localStorage.setItem(storageKey('custom-secret-codes'), JSON.stringify(customSecretCodes.value));
  newSecretCode.value = '';
}

function removeCustomSecretCode(code: string) {
  customSecretCodes.value = customSecretCodes.value.filter((item) => item !== code);
  localStorage.setItem(storageKey('custom-secret-codes'), JSON.stringify(customSecretCodes.value));
}

function loadCustomSecretCodes() {
  const stored = localStorage.getItem(storageKey('custom-secret-codes'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      customSecretCodes.value = parsed.filter((item) => typeof item === 'string');
    }
  } catch {
    customSecretCodes.value = [];
  }
}

function saveDailyAnswer() {
  const answer = dailyAnswer.value.trim();
  if (answer) {
    dailyAnswer.value = answer;
    localStorage.setItem(storageKey('question-answer', dateKey.value), answer);
    gentleVibrate(10);
    return;
  }

  localStorage.removeItem(storageKey('question-answer', dateKey.value));
}

function clearDailyAnswer() {
  dailyAnswer.value = '';
  localStorage.removeItem(storageKey('question-answer', dateKey.value));
}

function addMemoryPhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).slice(0, 4);
  if (!files.length) return;

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (!dataUrl.startsWith('data:image/')) return;
      memoryPhotos.value = [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          dataUrl
        },
        ...memoryPhotos.value
      ].slice(0, 8);
      saveMemoryPhotos();
      launchThemeBurst();
    };
    reader.readAsDataURL(file);
  });

  input.value = '';
  gentleVibrate(10);
}

function removeMemoryPhoto(id: string) {
  memoryPhotos.value = memoryPhotos.value.filter((photo) => photo.id !== id);
  saveMemoryPhotos();
}

async function saveMemoryPhotos() {
  await savePhotos(memoryPhotos.value);
}

async function loadMemoryPhotos() {
  const legacyStored = localStorage.getItem(storageKey('memory-photos'));
  let legacyPhotos: MemoryPhoto[] = [];

  try {
    const parsed = legacyStored ? JSON.parse(legacyStored) : [];
    if (Array.isArray(parsed)) {
      legacyPhotos = parsed.filter(
        (photo): photo is MemoryPhoto =>
          typeof photo?.id === 'string' && typeof photo?.name === 'string' && typeof photo?.dataUrl === 'string'
      );
    }
  } catch {
    legacyPhotos = [];
  }

  memoryPhotos.value = await loadStoredPhotos(legacyPhotos);
  if (legacyStored) localStorage.removeItem(storageKey('memory-photos'));
}

function toggleMeetingChecklist(item: string) {
  const checked = new Set(meetingChecklist.value);
  if (checked.has(item)) {
    checked.delete(item);
  } else {
    checked.add(item);
  }
  meetingChecklist.value = Array.from(checked);
  localStorage.setItem(storageKey('meeting-checklist'), JSON.stringify(meetingChecklist.value));
  gentleVibrate(10);
}

function loadMeetingChecklist() {
  const stored = localStorage.getItem(storageKey('meeting-checklist'));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      meetingChecklist.value = parsed.filter((item) => meetingChecklistItems.includes(item));
    }
  } catch {
    meetingChecklist.value = [];
  }
}

async function exportData() {
  downloadJsonBackup(createExportData(memoryPhotos.value), dateKey.value);
  importMessage.value = '已匯出完整備份。';
}

function importData(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const preview = parseImportData(String(reader.result ?? ''));
      pendingImport.value = preview.data;
      importMessage.value = `${preview.summary} 請選擇合併或覆蓋後套用。`;
    } catch {
      importMessage.value = '匯入失敗，檔案格式不對。';
    }
  };
  reader.readAsText(file);
  input.value = '';
}

async function applyImportData() {
  if (!pendingImport.value) return;
  restoreAppLocalStorage(pendingImport.value.localStorage, importMode.value);
  memoryPhotos.value =
    importMode.value === 'replace'
      ? pendingImport.value.photos
      : await mergePhotos(pendingImport.value.photos);
  if (importMode.value === 'replace') {
    await saveMemoryPhotos();
  }
  reloadPersistentState();
  importMessage.value = '匯入完成。';
  pendingImport.value = null;
  await syncCloudNow(true);
}

function cancelImportData() {
  pendingImport.value = null;
  importMessage.value = '已取消匯入。';
}

function reloadPersistentState() {
  loadDailyState(dateKey.value);
  loadSuitcase();
  loadCheckins();
  loadMoodHistory();
  loadSecretCode();
  loadCustomSecretCodes();
  loadMeetingChecklist();
  loadSettings();
  loadWishes();
  loadMeetingMoments();
}

function resetToday() {
  [
    'task',
    'message',
    'mood',
    'secret',
    'secret-mailed',
    'fortune-title',
    'fortune-line',
    'question-answer',
    'radar-choice',
    'ritual-opened',
    'ritual-complete'
  ].forEach((kind) => localStorage.removeItem(storageKey(kind, dateKey.value)));
  checkins.value = checkins.value.filter((day) => day !== dateKey.value);
  moodHistory.value = moodHistory.value.filter((entry) => !entry.startsWith(`${dateKey.value}:`));
  localStorage.setItem(storageKey('checkins'), JSON.stringify(checkins.value));
  localStorage.setItem(storageKey('mood-history'), JSON.stringify(moodHistory.value));
  if (isMeetingDay.value) {
    meetingChecklist.value = [];
    localStorage.removeItem(storageKey('meeting-checklist'));
  }
  loadDailyState(dateKey.value);
}

function openTodayRitual() {
  ritualOpened.value = true;
  localStorage.setItem(storageKey('ritual-opened', dateKey.value), 'yes');
  gentleVibrate(10);
}

function completeTodayRitual() {
  if (ritualProgress.value < 100) return;
  ritualComplete.value = true;
  localStorage.setItem(storageKey('ritual-complete', dateKey.value), 'yes');
  launchSparkles();
}

async function copyDailyReceipt() {
  try {
    await navigator.clipboard.writeText(dailyReceipt.value);
    shareCopied.value = true;
    gentleVibrate(8);
  } catch {
    shareCopied.value = false;
  }
}

function saveSettings() {
  const previousTheme = settings.value.theme;
  const next: AppSettings = {
    boyName: settingsDraft.value.boyName.trim() || defaultSettings.boyName,
    girlName: settingsDraft.value.girlName.trim() || defaultSettings.girlName,
    theme: settingsDraft.value.theme,
    startDate: normalizeDateSetting(settingsDraft.value.startDate),
    startTime: normalizeClockTime(settingsDraft.value.startTime, defaultSettings.startTime),
    targetTime: normalizeClockTime(settingsDraft.value.targetTime, defaultSettings.targetTime),
    welcomeLine: settingsDraft.value.welcomeLine.trim() || defaultSettings.welcomeLine,
    reducedMotion: settingsDraft.value.reducedMotion
  };
  settings.value = next;
  settingsDraft.value = { ...next };
  localStorage.setItem(storageKey('settings'), JSON.stringify(next));
  if (previousTheme !== next.theme) {
    themeTransition.value = true;
    if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
    themeTransitionTimer = window.setTimeout(() => {
      themeTransition.value = false;
    }, 900);
  }
  gentleVibrate(10);
}

function resetSettings() {
  settings.value = { ...defaultSettings };
  settingsDraft.value = { ...defaultSettings };
  localStorage.removeItem(storageKey('settings'));
}

function loadSettings() {
  const stored = localStorage.getItem(storageKey('settings'));
  if (!stored) {
    settings.value = { ...defaultSettings };
    settingsDraft.value = { ...defaultSettings };
    return;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AppSettings>;
    const loaded: AppSettings = {
      ...defaultSettings,
      ...parsed,
      theme: themeOptions.some((theme) => theme.id === parsed.theme) ? (parsed.theme as ThemeId) : defaultSettings.theme,
      startDate: normalizeDateSetting(parsed.startDate ?? defaultSettings.startDate),
      startTime: normalizeClockTime(parsed.startTime ?? defaultSettings.startTime, defaultSettings.startTime),
      targetTime: normalizeClockTime(parsed.targetTime ?? defaultSettings.targetTime, defaultSettings.targetTime),
      reducedMotion: Boolean(parsed.reducedMotion)
    };
    settings.value = loaded;
    settingsDraft.value = { ...loaded };
  } catch {
    settings.value = { ...defaultSettings };
    settingsDraft.value = { ...defaultSettings };
  }
}

function addWish() {
  const text = newWish.value.trim();
  if (!text) return;
  wishes.value = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      done: false,
      createdAt: new Date().toISOString()
    },
    ...wishes.value
  ].slice(0, 18);
  newWish.value = '';
  saveWishes();
}

function toggleWish(id: string) {
  wishes.value = wishes.value.map((wish) => (wish.id === id ? { ...wish, done: !wish.done } : wish));
  saveWishes();
}

function removeWish(id: string) {
  wishes.value = wishes.value.filter((wish) => wish.id !== id);
  saveWishes();
}

function saveWishes() {
  localStorage.setItem(storageKey('wishes'), JSON.stringify(wishes.value));
}

function loadWishes() {
  const stored = localStorage.getItem(storageKey('wishes'));
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      wishes.value = parsed.filter(
        (wish): wish is WishItem =>
          typeof wish?.id === 'string' &&
          typeof wish?.text === 'string' &&
          typeof wish?.done === 'boolean' &&
          typeof wish?.createdAt === 'string'
      );
    }
  } catch {
    wishes.value = [];
  }
}

function toggleMeetingMoment(id: string) {
  const selected = new Set(meetingMoments.value);
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  meetingMoments.value = Array.from(selected);
  localStorage.setItem(storageKey('meeting-moments'), JSON.stringify(meetingMoments.value));
}

function loadMeetingMoments() {
  const stored = localStorage.getItem(storageKey('meeting-moments'));
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      const ids = new Set(meetingMomentItems.map((item) => item.id));
      meetingMoments.value = parsed.filter((id): id is string => typeof id === 'string' && ids.has(id));
    }
  } catch {
    meetingMoments.value = [];
  }
}

function updateOnlineState() {
  isOnline.value = navigator.onLine;
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  installReady.value = true;
}

async function installApp() {
  const promptEvent = deferredInstallPrompt as (Event & { prompt?: () => Promise<void> }) | null;
  if (!promptEvent?.prompt) return;
  await promptEvent.prompt();
  deferredInstallPrompt = null;
  installReady.value = false;
}

async function checkForAppUpdate() {
  await checkServiceWorkerUpdate(() => {
    updateReady.value = true;
  });
}

async function refreshForUpdate() {
  refreshingForUpdate = true;
  await refreshForWaitingServiceWorker();
  window.location.reload();
}

function handleControllerChange() {
  if (refreshingForUpdate) return;
  refreshingForUpdate = true;
  window.location.reload();
}

function updateSceneTilt(event: PointerEvent) {
  if (settings.value.reducedMotion) return;
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  sceneTilt.value = {
    x: clamp((event.clientY / height - 0.5) * -5, -3, 3),
    y: clamp((event.clientX / width - 0.5) * 5, -3, 3)
  };
}

function exportMeetingCalendar() {
  const reminderDate = new Date(targetDate.value);
  reminderDate.setDate(reminderDate.getDate() - 7);
  downloadCalendar(
    [
      {
        title: '第一次見面倒數：最後一週',
        description: `${displayGirlName.value} 飛向 ${displayBoyName.value}，開始整理心情、行李和想說的話。`,
        start: reminderDate,
        end: new Date(reminderDate.getTime() + 60 * 60 * 1000)
      },
      {
        title: '第一次見面',
        description: dailyReceipt.value,
        start: targetDate.value,
        end: new Date(targetDate.value.getTime() + 3 * 60 * 60 * 1000)
      }
    ],
    'first-meeting-countdown.ics'
  );
  importMessage.value = '已匯出行事曆。';
}

function playSoftSound(kind: 'paper' | 'secret' | 'radar') {
  const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = kind === 'radar' ? 'triangle' : 'sine';
  oscillator.frequency.value = kind === 'secret' ? 660 : kind === 'radar' ? 220 : 440;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.24);
  window.setTimeout(() => {
    context.close();
  }, 320);
}

function startPlaneDrag(event: PointerEvent) {
  planeDrag.value = {
    dragging: true,
    startX: event.clientX - planeDrag.value.offsetX,
    startY: event.clientY - planeDrag.value.offsetY,
    offsetX: planeDrag.value.offsetX,
    offsetY: planeDrag.value.offsetY
  };
}

function movePlaneDrag(event: PointerEvent) {
  if (!planeDrag.value.dragging) return;
  planeDrag.value = {
    ...planeDrag.value,
    offsetX: clamp(event.clientX - planeDrag.value.startX, -46, 46),
    offsetY: clamp(event.clientY - planeDrag.value.startY, -36, 36)
  };
}

function endPlaneDrag() {
  if (!planeDrag.value.dragging) return;
  planeDrag.value = { ...planeDrag.value, dragging: false };
  gentleVibrate(6);
  if (planeResetTimer) window.clearTimeout(planeResetTimer);
  planeResetTimer = window.setTimeout(() => {
    planeDrag.value = { dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };
  }, 450);
}

function openThemeSettings() {
  activeTab.value = 'prepare';
  launchThemeBurst();
}

function createJourneyDays(start: Date, target: Date): JourneyDay[] {
  const totalDays = Math.max(Math.floor((startOfDay(target).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1, 1);

  return Array.from({ length: totalDays }, (_, index) => {
    const dayNumber = index + 1;
    const date = addDays(start, index);
    const dateLabel = formatMonthDay(date);
    const specialDay = specialJourneyDays[formatDateKey(date)];

    if (specialDay) {
      return { dateLabel, ...specialDay };
    }

    const phase = getRelationshipPhase(dayNumber);
    const note = buildDailyNote(dayNumber, index, phase.label);
    const task = buildDailyTask(dateLabel, index);
    const capsule = buildDailyCapsule(dateLabel, index, phase.label);

    return { dateLabel, note, task, capsule };
  });
}

function buildDailyNote(dayNumber: number, index: number, phaseLabel: string) {
  const opening = pick(noteTextures, index);
  const whisper = pick(noteWhispers, index * 7);
  const quietImage = pick(abstractNoteOpenings, index * 11);
  const quietDetail = pick(abstractNoteDetails, index * 13);

  return `第 ${dayNumber} 天｜${phaseLabel}。${opening}，${quietImage}。${whisper}；${quietDetail}`;
}

function buildDailyTask(dateLabel: string, index: number) {
  const motion = pick(taskMotions, index * 5);
  const object = pick(taskObjects, index * 7);
  const softHint = pick(abstractTaskIdeas, index * 9);

  return `${dateLabel} 小任務：${motion}，像收好${object}那樣。也可以只是${softHint}。`;
}

function buildDailyCapsule(dateLabel: string, index: number, phaseLabel: string) {
  const adjective = pick(capsuleAdjectives, index * 3);
  const noun = pick(capsuleNouns, index * 5);
  const oldImage = pick(abstractCapsuleIdeas, index * 7);

  return `${dateLabel}｜${phaseLabel}：${buildCapsuleLine(index, adjective, noun, oldImage)}`;
}

function buildCapsuleLine(index: number, adjective: string, noun: string, oldImage: string) {
  const lines = [
    `把${adjective}的${noun}收進今天，旁邊放著${oldImage}。`,
    `${adjective}的${noun}停在頁邊，像${oldImage}。`,
    `今天留下${noun}的一點${adjective}，也留下${oldImage}。`,
    `有一點${adjective}落在${noun}上，慢慢變成${oldImage}。`,
    `${oldImage}靠著${noun}睡著，夢裡有很${adjective}的光。`,
    `把${oldImage}摺好，夾進${adjective}的${noun}裡。`,
    `${noun}沒有說話，只替${oldImage}留下一點${adjective}。`,
    `這一頁很輕，像${adjective}的${oldImage}，也像${noun}。`
  ];

  return lines[index % lines.length];
}

function getRelationshipPhase(dayNumber: number) {
  return relationshipPhases.find((phase) => dayNumber <= phase.untilDay) ?? relationshipPhases[relationshipPhases.length - 1];
}

function getCountdown(value: Date, target: Date): Countdown {
  if (value.getTime() >= target.getTime()) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const diff = Math.max(target.getTime() - value.getTime(), 0);

  return {
    days: Math.floor(diff / DAY_MS),
    hours: Math.floor((diff % DAY_MS) / (60 * 60 * 1000)),
    minutes: Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000)),
    seconds: Math.floor((diff % (60 * 1000)) / 1000)
  };
}

function parseClockTime(value: string, fallback: string): [number, number] {
  const [rawHours, rawMinutes] = normalizeClockTime(value, fallback).split(':').map(Number);
  return [rawHours, rawMinutes];
}

function normalizeClockTime(value: string, fallback: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hours = clamp(Number(match[1]), 0, 23);
  const minutes = clamp(Number(match[2]), 0, 59);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseDateSetting(value: string): [number, number, number] {
  const normalized = normalizeDateSetting(value);
  const [year, month, day] = normalized.split('-').map(Number);
  return [year, month, day];
}

function normalizeDateSetting(value: string) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return defaultSettings.startDate;
  const year = clamp(Number(match[1]), 2020, 2035);
  const month = clamp(Number(match[2]), 1, 12);
  const maxDay = new Date(year, month, 0).getDate();
  const day = clamp(Number(match[3]), 1, maxDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(value: Date, days: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthDay(value: Date) {
  return `${value.getMonth() + 1} 月 ${value.getDate()} 日`;
}

function pick<T>(items: T[], index: number) {
  return items[index % items.length];
}

function getClosenessLabel(percent: number) {
  if (percent >= 100) return '故事正式開始';
  if (percent >= 88) return '快見面了';
  if (percent >= 70) return '心意很近';
  if (percent >= 48) return '慢慢靠近';
  if (percent >= 24) return '熟悉發芽';
  if (percent >= 8) return '觀察與好奇';
  return '相識第一頁';
}

function getCheckinStreak(days: string[], fromDate: Date) {
  const daySet = new Set(days);
  let streak = 0;
  let cursor = startOfDay(fromDate);

  while (daySet.has(formatDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function gentleVibrate(duration: number) {
  if ('vibrate' in navigator) {
    navigator.vibrate(duration);
  }
}

function waitForPasswordSuccess() {
  if (passwordSuccessTimer) window.clearTimeout(passwordSuccessTimer);
  return new Promise<void>((resolve) => {
    passwordSuccessTimer = window.setTimeout(() => {
      passwordSuccessTimer = undefined;
      resolve();
    }, settings.value.reducedMotion ? 160 : 720);
  });
}

function finishOpening() {
  if (introTimer) {
    window.clearTimeout(introTimer);
    introTimer = undefined;
  }
  introClosing.value = false;
  introActive.value = false;
}

function startOpeningSequence() {
  if (introTimer) window.clearTimeout(introTimer);
  const seenOpening = localStorage.getItem(storageKey('intro-seen')) === 'yes';
  introMode.value = seenOpening ? 'returning' : 'first';
  localStorage.setItem(storageKey('intro-seen'), 'yes');
  introActive.value = true;
  introClosing.value = false;
  introTimer = window.setTimeout(
    finishOpening,
    settings.value.reducedMotion
      ? OPENING_REDUCED_DURATION_MS
      : introMode.value === 'returning'
        ? OPENING_RETURN_DURATION_MS
        : OPENING_DURATION_MS
  );
}

function requestFinishOpening() {
  if (!introActive.value) return;
  if (settings.value.reducedMotion) {
    finishOpening();
    return;
  }
  if (introTimer) window.clearTimeout(introTimer);
  introClosing.value = true;
  introTimer = window.setTimeout(finishOpening, OPENING_SKIP_DURATION_MS);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
</script>

<template>
  <main
    class="app-shell"
    :class="[selectedMoodId ? `mood-${selectedMoodId}` : '', themeClass, { 'reduce-motion': settings.reducedMotion }]"
    :style="sceneStyle"
  >
    <div v-if="themeTransition" class="theme-transition-layer" aria-hidden="true"></div>
    <div class="burst-layer" aria-hidden="true">
      <span
        v-for="particle in burstParticles"
        :key="particle.id"
        class="theme-burst"
        :style="{ '--burst-x': `${particle.x}px`, '--burst-y': `${particle.y}px`, animationDelay: particle.delay }"
      ></span>
    </div>

    <button
      v-if="appUnlocked && introActive"
      class="opening-sequence"
      :class="[`opening-${introMode}`, { closing: introClosing }]"
      type="button"
      aria-label="進入第一次見面倒數"
      @click="requestFinishOpening"
    >
      <span class="opening-grid"></span>
      <span class="opening-scan"></span>
      <span class="opening-flare"></span>
      <span class="opening-finale" aria-hidden="true"></span>
      <span
        v-for="star in openingStars"
        :key="star.id"
        class="opening-star"
        :style="{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay }"
      ></span>
      <span class="opening-orbit opening-orbit-one"></span>
      <span class="opening-orbit opening-orbit-two"></span>
      <span class="opening-orbit opening-orbit-three"></span>
      <span class="opening-plane" aria-hidden="true">
        <svg viewBox="0 0 64 64" focusable="false">
          <polygon points="7,32 57,10 43,56 31,39 17,47" fill="currentColor" />
          <polyline points="57,10 31,39 43,56" fill="none" stroke="rgba(255,255,255,.82)" stroke-linecap="round" stroke-linejoin="round" stroke-width="5" />
        </svg>
      </span>
      <span class="opening-copy">
        <span>第一次見面倒數</span>
        <strong>{{ displayGirlName }} 飛向 {{ displayBoyName }}</strong>
        <em>{{ progressPercent }}% {{ openingThemeLabel }}</em>
        <span class="opening-chapters" aria-hidden="true">
          <i v-for="chapter in openingChapters" :key="chapter">{{ chapter }}</i>
        </span>
        <span class="opening-status" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </span>
      </span>
    </button>

    <div class="motion-sky" aria-hidden="true">
      <span class="aurora aurora-one"></span>
      <span class="aurora aurora-two"></span>
      <span class="orbit-ring orbit-one"></span>
      <span class="orbit-ring orbit-two"></span>
      <span v-for="beam in backgroundBeams" :key="`beam-${beam.id}`" class="sky-beam" :style="{ left: beam.left, animationDelay: beam.delay }"></span>
      <span
        v-for="mote in backgroundMotes"
        :key="`mote-${mote.id}`"
        class="sky-mote"
        :style="{ left: mote.left, top: mote.top, width: mote.size, height: mote.size, animationDelay: mote.delay }"
      ></span>
      <span class="sky-vortex"></span>
      <span v-for="light in theaterLights" :key="`sky-${light.id}`" class="sky-star" :style="{ left: light.left, top: light.top, animationDelay: light.delay }"></span>
    </div>

    <section v-if="!appUnlocked" class="password-gate" aria-labelledby="password-gate-title">
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
    </section>

    <template v-else>
    <button
      v-if="!introActive && activeTab !== 'prepare'"
      class="theme-discovery"
      type="button"
      aria-label="前往主題切換"
      @click="openThemeSettings"
    >
      <span aria-hidden="true"></span>
      換氛圍
    </button>

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
        {{ isMeetingDay ? '2026.08.14' : `${displayGirlName} 飛向 ${displayBoyName}` }}
      </h1>

      <div v-if="isMeetingDay" class="arrival-message">
        等待結束，故事正式開始 ❤️
      </div>

      <div v-else class="countdown-grid" aria-label="距離 2026 年 8 月 14 日的倒數">
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

    <section v-show="activeTab === 'countdown'" class="flight-section" aria-label="台南飛向上海">
      <div class="section-heading">
        <span>台南</span>
        <span>{{ progressPercent }}%</span>
        <span>上海</span>
      </div>

      <div class="flight-map" :class="{ 'milestone-wave': milestoneFlash }">
        <div class="map-texture"></div>
        <span class="plane-trail" :style="planeTrailStyle" aria-hidden="true"></span>
        <span class="map-cloud cloud-one" aria-hidden="true"></span>
        <span class="map-cloud cloud-two" aria-hidden="true"></span>
        <span class="map-glint glint-one" aria-hidden="true"></span>
        <span class="map-glint glint-two" aria-hidden="true"></span>
        <svg class="route-svg" viewBox="0 0 320 190" role="img" aria-label="從台南飛往上海的航線">
          <path class="route-shadow" d="M43 139 C105 87, 178 48, 278 47" />
          <path class="route-line" d="M43 139 C105 87, 178 48, 278 47" />
          <circle class="city-dot start" cx="43" cy="139" r="6" />
          <circle class="city-dot end" cx="278" cy="47" r="6" />
        </svg>
        <div class="city-label tainan">台南</div>
        <div class="city-label shanghai">上海</div>
        <button
          class="plane"
          :class="{ dragging: planeDrag.dragging }"
          :style="planeStyle"
          type="button"
          aria-label="讓小飛機撒一點星光"
          @click="launchSparkles"
          @pointerdown="startPlaneDrag"
          @pointermove="movePlaneDrag"
          @pointerup="endPlaneDrag"
          @pointerleave="endPlaneDrag"
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
      <p>{{ isOnline ? '安裝後也可以離線打開，等網路回來會繼續更新。' : '已離線，仍可以打開已快取的倒數頁。' }}</p>
      <button v-if="installReady" class="soft-button" type="button" @click="installApp">安裝到手機</button>
      <button v-if="updateReady" class="ghost-button" type="button" @click="refreshForUpdate">套用最新版本</button>
    </section>

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
        <span class="date-pill">{{ wishes.filter((wish) => wish.done).length }} / {{ wishes.length }}</span>
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
          <input v-model="settingsDraft.startDate" inputmode="numeric" maxlength="10" placeholder="2026-04-08" />
        </label>
        <label>
          <span>開始時間</span>
          <input v-model="settingsDraft.startTime" inputmode="numeric" maxlength="5" placeholder="00:00" />
        </label>
        <label>
          <span>目標時間</span>
          <input v-model="settingsDraft.targetTime" inputmode="numeric" maxlength="5" placeholder="18:00" />
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
          @click="settingsDraft.theme = theme.id"
        >
          {{ theme.label }}
        </button>
      </div>
      <label class="toggle-row">
        <input v-model="settingsDraft.reducedMotion" type="checkbox" />
        <span>減少動畫</span>
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
            :disabled="!capsule.unlocked"
            @click="toggleCapsule(capsule.index, capsule.unlocked)"
          >
            <span class="capsule-face capsule-front">
              <span class="capsule-index">{{ String(capsule.index + 1).padStart(2, '0') }}</span>
              <span>{{ capsule.unlocked ? capsule.dateLabel : `${capsule.dateLabel} 尚未解鎖` }}</span>
            </span>
            <span class="capsule-face capsule-back">
              <span>{{ capsule.text }}</span>
            </span>
          </button>
        </li>
      </ol>
      <button class="wide-soft-button" type="button" @click="capsuleShowAll = !capsuleShowAll">
        {{ capsuleShowAll ? '只看最近 7 天' : '查看全部膠囊' }}
      </button>
    </section>

    <nav class="bottom-nav" aria-label="頁面分區">
      <span class="nav-indicator" :style="navIndicatorStyle" aria-hidden="true"></span>
      <button type="button" :class="{ active: activeTab === 'countdown' }" @click="activeTab = 'countdown'">倒數</button>
      <button type="button" :class="{ active: activeTab === 'today' }" @click="activeTab = 'today'">今日</button>
      <button type="button" :class="{ active: activeTab === 'memories' }" @click="activeTab = 'memories'">回憶</button>
      <button type="button" :class="{ active: activeTab === 'prepare' }" @click="activeTab = 'prepare'">準備</button>
    </nav>
    </template>
  </main>
</template>
