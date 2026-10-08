// แอปพลิเคชันคำศัพท์ภาษาไทยสำหรับ Tablet & Desktop
// Thai Vocabulary Web App Controller

class VocabApp {
  constructor() {
    this.words = [];
    this.categories = INITIAL_CATEGORIES;
    this.currentCategory = 'all';
    this.searchQuery = '';
    this.currentTab = 'list'; // 'list' | 'flashcard' | 'quiz' | 'favorites'
    this.speechSpeed = 1.0;
    this.voiceEngine = 'google'; // 'google' (Google Thai ธรรมชาติ) | 'device' (Web Speech API)
    this.audioCache = new Map();
    this.currentAudio = null;
    this.favorites = new Set();
    
    // Flashcard State
    this.flashcardIndex = 0;
    this.isFlipped = false;
    this.flashcardList = [];

    // Quiz State
    this.quizQuestions = [];
    this.quizCurrentIndex = 0;
    this.quizScore = 0;
    this.quizSelectedChoice = null;
    this.quizAnswered = false;

    // Audio Context for sound effects
    this.audioCtx = null;

    this.init();
  }

  init() {
    this.loadFavorites();
    this.loadCustomWords();
    this.updateCategoryCounts();
    this.setupEventListeners();
    this.renderCategories();
    this.renderWordList();
    this.setupSpeechSynthesis();
  }

  // --- Audio Effects via Web Audio API (Zero external mp3 files needed) ---
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playBeep(type = 'correct') {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'correct') {
        // High bright chime (C6 -> G6)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'wrong') {
        // Low gentle buzz
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.25);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'flip') {
        // Subtle soft click/pop
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (e) {
      console.warn('Audio effect error:', e);
    }
  }

  // --- Voice Pronunciation Engine (Google Native Thai & Device Fallback) ---
  setupSpeechSynthesis() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }

  speak(text, speedMultiplier = 1) {
    if (this.voiceEngine === 'google') {
      this.speakGoogle(text, speedMultiplier);
    } else {
      this.speakDevice(text, speedMultiplier);
    }
  }

  // Google Thai TTS: สำเนียงไทยแท้ 100% ชัดเจน เป็นธรรมชาติ ไม่เพี้ยน
  speakGoogle(text, speedMultiplier = 1) {
    const speakerPill = document.getElementById('speakingIndicator');

    // หยุดเสียงเดิมที่กำลังเล่นอยู่
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (speakerPill) speakerPill.classList.remove('hidden');

    const cleanWord = text.trim();
    const targetSpeed = Math.max(0.5, Math.min(2.0, this.speechSpeed * speedMultiplier));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanWord)}&tl=th&client=tw-ob`;

    const audio = new Audio();
    audio.src = url;
    audio.playbackRate = targetSpeed;
    this.currentAudio = audio;

    const cleanup = () => {
      if (speakerPill) speakerPill.classList.add('hidden');
      if (this.currentAudio === audio) this.currentAudio = null;
    };

    audio.onended = cleanup;
    audio.onerror = (err) => {
      console.warn('Google TTS failed, falling back to Device TTS:', err);
      cleanup();
      // หากเกิดข้อผิดพลาด เช่น ออฟไลน์ ให้สลับไปใช้ระบบเสียงในเครื่องอัตโนมัติ
      this.speakDevice(text, speedMultiplier);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn('Audio play prevented or offline:', e);
        cleanup();
        this.speakDevice(text, speedMultiplier);
      });
    }
  }

  // Device Web Speech API Fallback
  speakDevice(text, speedMultiplier = 1) {
    if (!('speechSynthesis' in window)) {
      alert('เบราว์เซอร์นี้ยังไม่รองรับระบบออกเสียง');
      return;
    }

    window.speechSynthesis.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = (this.speechSpeed * speedMultiplier);
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    // คัดเลือกเสียงภาษาไทยที่ดีที่สุดในระบบ (เช่น Niwat, Premwadee, Siri หรือ Google)
    const thaiVoices = voices.filter(v => v.lang.toLowerCase().startsWith('th') || v.name.toLowerCase().includes('thai'));
    
    if (thaiVoices.length > 0) {
      // ให้ลำดับความสำคัญกับ Natural / Neural / Siri / Google
      const bestVoice = thaiVoices.find(v => {
        const name = v.name.toLowerCase();
        return name.includes('natural') || name.includes('neural') || name.includes('siri') || name.includes('google') || name.includes('niwat') || name.includes('premwadee');
      }) || thaiVoices[0];
      utterance.voice = bestVoice;
    }

    const speakerPill = document.getElementById('speakingIndicator');
    if (speakerPill) {
      speakerPill.classList.remove('hidden');
      utterance.onend = () => speakerPill.classList.add('hidden');
      utterance.onerror = () => speakerPill.classList.add('hidden');
    }

    window.speechSynthesis.speak(utterance);
  }

  // --- Local Storage Management ---
  loadFavorites() {
    try {
      const stored = localStorage.getItem('thai_vocab_favorites');
      if (stored) {
        this.favorites = new Set(JSON.parse(stored));
      }
    } catch (e) {
      this.favorites = new Set();
    }
  }

  saveFavorites() {
    localStorage.setItem('thai_vocab_favorites', JSON.stringify([...this.favorites]));
    this.updateCategoryCounts();
  }

  toggleFavorite(id, e) {
    if (e) e.stopPropagation();
    if (this.favorites.has(id)) {
      this.favorites.delete(id);
    } else {
      this.favorites.add(id);
      this.playBeep('correct');
    }
    this.saveFavorites();
    if (this.currentTab === 'favorites') {
      this.renderWordList();
    } else {
      this.updateFavoriteButtons(id);
    }
  }

  updateFavoriteButtons(id) {
    const isFav = this.favorites.has(id);
    document.querySelectorAll(`.fav-btn-${id}`).forEach(btn => {
      btn.innerHTML = isFav 
        ? `<svg class="w-6 h-6 fill-rose-500 text-rose-500" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
        : `<svg class="w-6 h-6 text-slate-400 hover:text-rose-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
    });
  }

  loadCustomWords() {
    let custom = [];
    try {
      const stored = localStorage.getItem('thai_vocab_custom');
      if (stored) custom = JSON.parse(stored);
    } catch (e) {
      custom = [];
    }
    this.words = [...INITIAL_WORDS, ...custom];
  }

  addCustomWord(wordObj) {
    const custom = JSON.parse(localStorage.getItem('thai_vocab_custom') || '[]');
    custom.unshift(wordObj);
    localStorage.setItem('thai_vocab_custom', JSON.stringify(custom));
    this.words = [...INITIAL_WORDS, ...custom];
    this.updateCategoryCounts();
    this.renderCategories();
    this.renderWordList();
  }

  updateCategoryCounts() {
    const counts = { all: this.words.length };
    this.words.forEach(w => {
      counts[w.category] = (counts[w.category] || 0) + 1;
    });
    this.categories.forEach(cat => {
      cat.count = counts[cat.id] || 0;
    });
    const favCountEl = document.getElementById('favCountBadge');
    if (favCountEl) favCountEl.textContent = this.favorites.size;
  }

  // --- Filtering ---
  getFilteredWords() {
    let list = this.words;
    if (this.currentTab === 'favorites') {
      list = list.filter(w => this.favorites.has(w.id));
    } else if (this.currentCategory !== 'all') {
      list = list.filter(w => w.category === this.currentCategory);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(w => 
        w.word.toLowerCase().includes(q) ||
        w.pronunciation.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q) ||
        (w.romanization && w.romanization.toLowerCase().includes(q))
      );
    }
    return list;
  }

  // --- Render Categories (Pills + Pull-Down Menu) ---
  renderCategories() {
    const container = document.getElementById('categoriesContainer');
    const selectEl = document.getElementById('categorySelect');

    // 1. Populate Pull-Down Dropdown Menu
    if (selectEl) {
      selectEl.innerHTML = this.categories.map(cat => `
        <option value="${cat.id}" ${this.currentCategory === cat.id ? 'selected' : ''}>
          ${cat.icon} ${cat.name} (${cat.count} คำ)
        </option>
      `).join('');
    }

    // 2. Populate Category Pills
    if (!container) return;

    container.innerHTML = this.categories.map(cat => {
      const isActive = this.currentCategory === cat.id && this.currentTab === 'list';
      return `
        <button 
          data-category="${cat.id}"
          class="category-btn flex items-center gap-2.5 px-4 py-2.5 rounded-2xl font-medium transition-all text-sm md:text-base whitespace-nowrap shadow-sm border ${
            isActive 
              ? 'bg-gradient-to-r ' + cat.color + ' text-white border-transparent shadow-md scale-105' 
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/80 hover:border-slate-300'
          }"
        >
          <span class="text-xl">${cat.icon}</span>
          <span>${cat.name}</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-bold ${
            isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
          }">${cat.count}</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentCategory = btn.dataset.category;
        if (selectEl) selectEl.value = this.currentCategory;

        if (this.currentTab === 'favorites') {
          this.switchTab('list');
        } else {
          this.renderCategories();
          this.renderWordList();
          // เลื่อนปุ่มหมวดหมู่นี้มาไว้กลางจอ
          btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      });
    });
  }

  // --- Render Word List (Grid Layout optimized for Tablet) ---
  renderWordList() {
    const container = document.getElementById('wordListGrid');
    const emptyState = document.getElementById('emptyState');
    const resultCount = document.getElementById('resultCount');
    if (!container) return;

    const list = this.getFilteredWords();

    if (resultCount) {
      resultCount.textContent = `พบ ${list.length} คำศัพท์`;
    }

    if (list.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = list.map(item => {
      const isFav = this.favorites.has(item.id);
      const categoryObj = this.categories.find(c => c.id === item.category) || { name: 'ทั่วไป', icon: '📖' };

      return `
        <div class="vocab-card bg-white rounded-3xl p-5 md:p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 flex flex-col justify-between group relative overflow-hidden">
          <!-- Top Tag & Fav -->
          <div class="flex items-center justify-between mb-3">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              <span>${categoryObj.icon}</span>
              <span>${categoryObj.name}</span>
              <span class="text-slate-400">•</span>
              <span class="text-indigo-600 font-semibold">${item.partOfSpeech || 'คำศัพท์'}</span>
            </span>
            <button 
              class="fav-btn fav-btn-${item.id} p-2 rounded-full hover:bg-rose-50 transition-colors"
              title="บันทึกเป็นคำโปรด"
              data-id="${item.id}"
            >
              ${isFav 
                ? `<svg class="w-6 h-6 fill-rose-500 text-rose-500" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
                : `<svg class="w-6 h-6 text-slate-400 group-hover:text-rose-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`
              }
            </button>
          </div>

          <!-- Main Word & Pronunciation -->
          <div class="mb-4">
            <div class="flex items-baseline gap-3 flex-wrap">
              <h3 class="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">${item.word}</h3>
              ${item.romanization ? `<span class="text-xs text-slate-400 font-mono">(${item.romanization})</span>` : ''}
            </div>
            
            <div class="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-800 text-sm md:text-base font-medium">
              <span class="text-xs text-amber-600 font-semibold uppercase tracking-wider">คำอ่าน:</span>
              <span class="font-bold tracking-wide">${item.pronunciation}</span>
            </div>
          </div>

          <!-- Meaning & Example -->
          <div class="text-slate-600 text-sm md:text-base leading-relaxed mb-5 space-y-2 flex-grow">
            <p><span class="font-semibold text-slate-700">ความหมาย:</span> ${item.meaning}</p>
            ${item.exampleSentence ? `
              <div class="p-3 bg-slate-50/80 rounded-xl border-l-4 border-indigo-400 text-xs md:text-sm text-slate-600 italic">
                "${item.exampleSentence}"
              </div>
            ` : ''}
          </div>

          <!-- Audio Pronunciation Buttons (Touch Friendly) -->
          <div class="pt-3 border-t border-slate-100 flex items-center gap-2">
            <button 
              class="speak-btn flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-medium text-sm md:text-base shadow-md shadow-indigo-200 transition-all"
              data-word="${item.word}"
              data-speed="1.0"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <span>ฟังเสียง</span>
            </button>

            <button 
              class="speak-btn py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-medium text-xs md:text-sm transition-all"
              title="ฟังเสียงช้า ชัดถ้อยชัดคำ"
              data-word="${item.word}"
              data-speed="0.6"
            >
              🐢 ช้า 0.6x
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.toggleFavorite(btn.dataset.id, e));
    });

    container.querySelectorAll('.speak-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = btn.dataset.word;
        const speed = parseFloat(btn.dataset.speed) || 1.0;
        this.speak(word, speed);
      });
    });
  }

  // --- Flashcard Mode (Interactive 3D Flip) ---
  setupFlashcards() {
    this.flashcardList = this.getFilteredWords();
    if (this.flashcardList.length === 0) {
      this.flashcardList = this.words; // Fallback to all
    }
    this.flashcardIndex = 0;
    this.isFlipped = false;
    this.renderCurrentFlashcard();
  }

  renderCurrentFlashcard() {
    if (this.flashcardList.length === 0) return;
    const item = this.flashcardList[this.flashcardIndex];
    const categoryObj = this.categories.find(c => c.id === item.category) || { name: 'ทั่วไป', icon: '📖' };
    const counterEl = document.getElementById('flashcardCounter');
    const cardEl = document.getElementById('flashcardElement');

    if (counterEl) {
      counterEl.textContent = `${this.flashcardIndex + 1} / ${this.flashcardList.length}`;
    }

    if (cardEl) {
      cardEl.classList.remove('is-flipped');
      this.isFlipped = false;

      // Front: Big Word + Pronounce button + Category
      const front = cardEl.querySelector('.card-front');
      front.innerHTML = `
        <div class="h-full flex flex-col justify-between p-8 text-center bg-gradient-to-br from-white via-indigo-50/30 to-blue-50/50 rounded-3xl border border-indigo-100 shadow-xl">
          <div class="flex items-center justify-between">
            <span class="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white shadow-sm border border-slate-200 text-slate-700">
              ${categoryObj.icon} ${categoryObj.name}
            </span>
            <span class="text-xs text-indigo-500 font-medium">แตะการ์ดเพื่อดูคำอ่านและความหมาย 👆</span>
          </div>
          
          <div class="my-auto py-8">
            <h2 class="text-4xl md:text-6xl font-black text-slate-800 tracking-wide">${item.word}</h2>
            ${item.romanization ? `<p class="text-slate-400 mt-2 font-mono text-sm">${item.romanization}</p>` : ''}
          </div>

          <div class="flex items-center justify-center gap-3">
            <button class="fc-speak-btn flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md shadow-indigo-300 transition-all active:scale-95" data-word="${item.word}">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
              <span>กดฟังเสียง</span>
            </button>
            <button class="fc-speak-slow-btn px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-all active:scale-95" data-word="${item.word}">
              🐢 0.6x
            </button>
          </div>
        </div>
      `;

      // Back: Phonetics + Meaning + Example
      const back = cardEl.querySelector('.card-back');
      back.innerHTML = `
        <div class="h-full flex flex-col justify-between p-8 text-center bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-3xl shadow-xl">
          <div class="flex items-center justify-between">
            <span class="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white/20 backdrop-blur-md">
              ${item.partOfSpeech || 'คำศัพท์'}
            </span>
            <span class="text-xs text-amber-100 font-medium">แตะเพื่อพลิกกลับ ↩️</span>
          </div>

          <div class="my-auto py-4 space-y-4">
            <div>
              <span class="text-xs uppercase tracking-widest text-amber-200 font-bold block mb-1">คำอ่านออกเสียง</span>
              <div class="text-3xl md:text-5xl font-black bg-white/10 backdrop-blur-md py-3 px-6 rounded-2xl inline-block border border-white/20">
                [${item.pronunciation}]
              </div>
            </div>

            <div class="max-w-md mx-auto">
              <span class="text-xs uppercase tracking-widest text-amber-200 font-bold block mb-1">ความหมาย</span>
              <p class="text-base md:text-lg text-white font-medium leading-relaxed">${item.meaning}</p>
            </div>

            ${item.exampleSentence ? `
              <div class="max-w-md mx-auto p-3 bg-black/15 rounded-xl text-xs md:text-sm text-amber-100 italic">
                "${item.exampleSentence}"
              </div>
            ` : ''}
          </div>

          <div class="flex items-center justify-center gap-3">
            <button class="fc-speak-btn flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-orange-600 font-bold shadow-lg transition-all active:scale-95" data-word="${item.word}">
              🔊 ฟังเสียงอีกครั้ง
            </button>
          </div>
        </div>
      `;

      // Speak events inside flashcard
      cardEl.querySelectorAll('.fc-speak-btn').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.speak(b.dataset.word, 1.0);
        });
      });
      cardEl.querySelectorAll('.fc-speak-slow-btn').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.speak(b.dataset.word, 0.6);
        });
      });
    }
  }

  nextFlashcard() {
    if (this.flashcardIndex < this.flashcardList.length - 1) {
      this.flashcardIndex++;
    } else {
      this.flashcardIndex = 0; // Loop around
    }
    this.playBeep('flip');
    this.renderCurrentFlashcard();
  }

  prevFlashcard() {
    if (this.flashcardIndex > 0) {
      this.flashcardIndex--;
    } else {
      this.flashcardIndex = this.flashcardList.length - 1;
    }
    this.playBeep('flip');
    this.renderCurrentFlashcard();
  }

  toggleFlipCard() {
    const cardEl = document.getElementById('flashcardElement');
    if (cardEl) {
      this.isFlipped = !this.isFlipped;
      cardEl.classList.toggle('is-flipped', this.isFlipped);
      this.playBeep('flip');
    }
  }

  // --- Quiz Mode (Interactive Mini Game) ---
  setupQuiz() {
    this.quizQuestions = this.generateQuizQuestions(10);
    this.quizCurrentIndex = 0;
    this.quizScore = 0;
    this.quizAnswered = false;
    this.renderQuizQuestion();
  }

  generateQuizQuestions(total = 10) {
    // Shuffle words
    const shuffled = [...this.words].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(total, shuffled.length));

    return selected.map(targetWord => {
      // Pick 3 random wrong options
      const otherWords = this.words.filter(w => w.id !== targetWord.id);
      const wrongShuffled = otherWords.sort(() => 0.5 - Math.random()).slice(0, 3);
      
      // Determine question type (50% pronunciation quiz, 50% meaning quiz)
      const isPhoneticType = Math.random() > 0.4;

      const choices = [
        {
          text: isPhoneticType ? targetWord.pronunciation : targetWord.meaning,
          isCorrect: true
        },
        ...wrongShuffled.map(w => ({
          text: isPhoneticType ? w.pronunciation : w.meaning,
          isCorrect: false
        }))
      ].sort(() => 0.5 - Math.random());

      return {
        word: targetWord.word,
        pronunciation: targetWord.pronunciation,
        meaning: targetWord.meaning,
        questionType: isPhoneticType ? 'pronunciation' : 'meaning',
        questionPrompt: isPhoneticType ? `คำว่า "${targetWord.word}" มีคำอ่านว่าอย่างไร?` : `คำว่า "${targetWord.word}" มีความหมายตรงกับข้อใด?`,
        choices: choices
      };
    });
  }

  renderQuizQuestion() {
    const container = document.getElementById('quizContainer');
    const summary = document.getElementById('quizSummary');
    if (!container) return;

    if (this.quizCurrentIndex >= this.quizQuestions.length) {
      // Quiz Finished
      container.classList.add('hidden');
      if (summary) {
        summary.classList.remove('hidden');
        document.getElementById('finalScoreText').textContent = `${this.quizScore} / ${this.quizQuestions.length}`;
        const feedback = document.getElementById('finalScoreFeedback');
        const ratio = this.quizScore / this.quizQuestions.length;
        if (ratio === 1) {
          feedback.textContent = 'ยอดเยี่ยมมาก! คุณตอบถูกครบทุกข้อ 🎉';
        } else if (ratio >= 0.7) {
          feedback.textContent = 'เก่งมากครับ! มีความรู้ความจำคำศัพท์ดีเยี่ยม 👍';
        } else {
          feedback.textContent = 'ฝึกฝนอีกนิด รับรองว่าจะจำคำศัพท์ได้แม่นยำแน่นอนครับ! ✌️';
        }
      }
      return;
    }

    container.classList.remove('hidden');
    if (summary) summary.classList.add('hidden');

    const q = this.quizQuestions[this.quizCurrentIndex];
    this.quizAnswered = false;

    // Progress
    document.getElementById('quizProgressText').textContent = `คำถามข้อที่ ${this.quizCurrentIndex + 1} จาก ${this.quizQuestions.length}`;
    document.getElementById('quizProgressBar').style.width = `${((this.quizCurrentIndex) / this.quizQuestions.length) * 100}%`;
    document.getElementById('quizScoreBadge').textContent = `คะแนน: ${this.quizScore}`;

    // Prompt
    document.getElementById('quizTargetWord').textContent = q.word;
    document.getElementById('quizQuestionPrompt').textContent = q.questionPrompt;

    // Speak Button in Quiz
    const speakBtn = document.getElementById('quizSpeakWordBtn');
    if (speakBtn) {
      speakBtn.onclick = () => this.speak(q.word, 1.0);
    }

    // Choices
    const choicesContainer = document.getElementById('quizChoices');
    choicesContainer.innerHTML = q.choices.map((choice, idx) => `
      <button 
        class="quiz-choice-btn w-full p-4 md:p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/40 text-left font-medium text-slate-700 transition-all text-base md:text-lg flex items-center gap-3 active:scale-[0.98]"
        data-index="${idx}"
      >
        <span class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm flex-shrink-0">
          ${String.fromCharCode(65 + idx)}
        </span>
        <span class="flex-grow">${choice.text}</span>
      </button>
    `).join('');

    // Attach choice listeners
    choicesContainer.querySelectorAll('.quiz-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.quizAnswered) return;
        const index = parseInt(btn.dataset.index);
        this.handleQuizAnswer(index);
      });
    });

    const nextBtn = document.getElementById('quizNextBtn');
    if (nextBtn) nextBtn.classList.add('hidden');
  }

  handleQuizAnswer(selectedIndex) {
    this.quizAnswered = true;
    const q = this.quizQuestions[this.quizCurrentIndex];
    const selected = q.choices[selectedIndex];
    const buttons = document.querySelectorAll('.quiz-choice-btn');

    if (selected.isCorrect) {
      this.quizScore++;
      this.playBeep('correct');
      buttons[selectedIndex].classList.remove('border-slate-200', 'bg-white');
      buttons[selectedIndex].classList.add('border-emerald-500', 'bg-emerald-50', 'text-emerald-900', 'ring-2', 'ring-emerald-400');
    } else {
      this.playBeep('wrong');
      buttons[selectedIndex].classList.remove('border-slate-200', 'bg-white');
      buttons[selectedIndex].classList.add('border-rose-500', 'bg-rose-50', 'text-rose-900');

      // Highlight the correct answer
      q.choices.forEach((c, idx) => {
        if (c.isCorrect) {
          buttons[idx].classList.remove('border-slate-200', 'bg-white');
          buttons[idx].classList.add('border-emerald-500', 'bg-emerald-50', 'text-emerald-900');
        }
      });
    }

    // Show Next Button
    const nextBtn = document.getElementById('quizNextBtn');
    if (nextBtn) {
      nextBtn.classList.remove('hidden');
      nextBtn.onclick = () => {
        this.quizCurrentIndex++;
        this.renderQuizQuestion();
      };
    }
  }

  // --- Tab Navigation ---
  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('text-indigo-600', active);
      btn.classList.toggle('border-indigo-600', active);
      btn.classList.toggle('font-bold', active);
      btn.classList.toggle('text-slate-500', !active);
      btn.classList.toggle('border-transparent', !active);
    });

    const listSection = document.getElementById('listSection');
    const flashcardSection = document.getElementById('flashcardSection');
    const quizSection = document.getElementById('quizSection');
    const categoryFilterSection = document.getElementById('categoryFilterSection');

    // Show/hide sections
    if (tab === 'list' || tab === 'favorites') {
      listSection.classList.remove('hidden');
      flashcardSection.classList.add('hidden');
      quizSection.classList.add('hidden');
      if (tab === 'favorites') {
        categoryFilterSection.classList.add('hidden');
      } else {
        categoryFilterSection.classList.remove('hidden');
      }
      this.renderWordList();
    } else if (tab === 'flashcard') {
      listSection.classList.add('hidden');
      flashcardSection.classList.remove('hidden');
      quizSection.classList.add('hidden');
      this.setupFlashcards();
    } else if (tab === 'quiz') {
      listSection.classList.add('hidden');
      flashcardSection.classList.add('hidden');
      quizSection.classList.remove('hidden');
      this.setupQuiz();
    }
  }

  // --- Setup Global Event Listeners ---
  setupEventListeners() {
    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Category Pull-Down Dropdown Menu listener
    const categorySelect = document.getElementById('categorySelect');
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.currentCategory = e.target.value;
        if (this.currentTab === 'favorites') {
          this.switchTab('list');
        } else {
          this.renderCategories();
          this.renderWordList();
          // เลื่อนปุ่มหมวดหมู่เข้ามาในมุมมอง
          const targetBtn = document.querySelector(`.category-btn[data-category="${this.currentCategory}"]`);
          if (targetBtn) {
            targetBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        }
      });
    }

    // Category Scroll Buttons & Mouse Wheel
    const scrollCatLeft = document.getElementById('scrollCatLeft');
    const scrollCatRight = document.getElementById('scrollCatRight');
    const categoriesContainer = document.getElementById('categoriesContainer');

    if (scrollCatLeft && categoriesContainer) {
      scrollCatLeft.addEventListener('click', () => {
        categoriesContainer.scrollBy({ left: -280, behavior: 'smooth' });
      });
    }

    if (scrollCatRight && categoriesContainer) {
      scrollCatRight.addEventListener('click', () => {
        categoriesContainer.scrollBy({ left: 280, behavior: 'smooth' });
      });
    }

    if (categoriesContainer) {
      // รองรับการใช้ลูกกลิ้งเมาส์เลื่อนซ้าย-ขวาบนคอมพิวเตอร์
      categoriesContainer.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          categoriesContainer.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    // Search input
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (clearSearch) {
          clearSearch.classList.toggle('hidden', !this.searchQuery);
        }
        this.renderWordList();
      });
    }

    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        this.searchQuery = '';
        clearSearch.classList.add('hidden');
        this.renderWordList();
      });
    }

    // Flashcard buttons
    const flashcardEl = document.getElementById('flashcardElement');
    if (flashcardEl) {
      flashcardEl.addEventListener('click', () => this.toggleFlipCard());
    }
    const nextFcBtn = document.getElementById('nextFcBtn');
    const prevFcBtn = document.getElementById('prevFcBtn');
    if (nextFcBtn) nextFcBtn.addEventListener('click', () => this.nextFlashcard());
    if (prevFcBtn) prevFcBtn.addEventListener('click', () => this.prevFlashcard());

    // Quiz restart
    const restartQuizBtn = document.getElementById('restartQuizBtn');
    if (restartQuizBtn) restartQuizBtn.addEventListener('click', () => this.setupQuiz());

    // Speed toggle
    const speedSelect = document.getElementById('speechSpeedSelect');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        this.speechSpeed = parseFloat(e.target.value) || 1.0;
      });
    }

    // Voice Engine toggle (Google Thai vs Device)
    const voiceEngineSelect = document.getElementById('voiceEngineSelect');
    if (voiceEngineSelect) {
      voiceEngineSelect.addEventListener('change', (e) => {
        this.voiceEngine = e.target.value;
      });
    }

    // Fullscreen toggle (Great for tablets)
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
        }
      });
    }

    // Add Word Modal
    const addWordBtn = document.getElementById('addWordBtn');
    const addWordModal = document.getElementById('addWordModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const addWordForm = document.getElementById('addWordForm');

    if (addWordBtn && addWordModal) {
      addWordBtn.addEventListener('click', () => {
        addWordModal.classList.remove('hidden');
      });
    }
    if (closeModalBtn && addWordModal) {
      closeModalBtn.addEventListener('click', () => {
        addWordModal.classList.add('hidden');
      });
    }

    if (addWordForm) {
      addWordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const word = document.getElementById('newWord').value.trim();
        const pronunciation = document.getElementById('newPronunciation').value.trim();
        const category = document.getElementById('newCategory').value;
        const partOfSpeech = document.getElementById('newPartOfSpeech').value.trim();
        const meaning = document.getElementById('newMeaning').value.trim();
        const example = document.getElementById('newExample').value.trim();

        if (!word || !pronunciation || !meaning) {
          alert('กรุณากรอกคำศัพท์ คำอ่าน และความหมายให้ครบถ้วนครับ');
          return;
        }

        const newWordObj = {
          id: 'custom_' + Date.now(),
          word: word,
          pronunciation: pronunciation,
          category: category,
          partOfSpeech: partOfSpeech || 'คำนาม',
          meaning: meaning,
          exampleSentence: example,
          romanization: ''
        };

        this.addCustomWord(newWordObj);
        addWordForm.reset();
        addWordModal.classList.add('hidden');
        alert(`เพิ่มคำศัพท์ "${word}" เรียบร้อยแล้วครับ!`);
      });
    }
  }
}

// Start app on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VocabApp();
});
