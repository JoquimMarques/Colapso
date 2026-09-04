const STORAGE_KEY = "notas-mobile-v1";
const THEME_KEY = "notas-theme-v1";

function readFirebaseConfig() {
  const singleVar = String(import.meta.env.VITE_FIREBASE || "").trim();
  if (singleVar) {
    try {
      const parsed = JSON.parse(singleVar);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          apiKey: String(parsed.apiKey || ""),
          authDomain: String(parsed.authDomain || ""),
          projectId: String(parsed.projectId || ""),
          storageBucket: String(parsed.storageBucket || ""),
          messagingSenderId: String(parsed.messagingSenderId || ""),
          appId: String(parsed.appId || "")
        };
      }
    } catch {
      // Not JSON — fall through to individual vars.
    }
  }

  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
  };
}

const firebaseConfig = readFirebaseConfig();

const authLockScreenEl = document.getElementById("authLockScreen");
const authLockHintEl = document.getElementById("authLockHint");
const authStatusEl = document.getElementById("authStatus");
const googleLoginBtnEl = document.getElementById("googleLoginBtn");
const accountBtnEl = document.getElementById("accountBtn");
const accountModalEl = document.getElementById("accountModal");
const accountInfoEl = document.getElementById("accountInfo");
const closeAccountBtnEl = document.getElementById("closeAccountBtn");
const logoutBtnEl = document.getElementById("logoutBtn");

const notesListEl = document.getElementById("notesList");
const contentInputEl = document.getElementById("contentInput");
const searchInputEl = document.getElementById("searchInput");
const statusTextEl = document.getElementById("statusText");

const viewNotesBtnEl = document.getElementById("viewNotesBtn");
const viewAddBtnEl = document.getElementById("viewAddBtn");
const viewCalendarBtnEl = document.getElementById("viewCalendarBtn");

const notesScreenEl = document.getElementById("notesScreen");
const calendarScreenEl = document.getElementById("calendarScreen");
const addScreenEl = document.getElementById("addScreen");

const calendarTitleEl = document.getElementById("calendarTitle");
const calendarWeekdaysEl = document.getElementById("calendarWeekdays");
const calendarGridEl = document.getElementById("calendarGrid");

const mainNavEl = document.getElementById("mainNav");
const addNavEl = document.getElementById("addNav");
const editorBackBtnEl = document.getElementById("editorBackBtn");
const toolbarVoiceBtnEl = document.getElementById("toolbarVoiceBtn");
const addActionsBtnEl = document.getElementById("addActionsBtn");

const imagePickerEl = document.getElementById("imagePicker");
const imageGalleryEl = document.getElementById("imageGallery");

const actionMenuModalEl = document.getElementById("actionMenuModal");
const actionMenuHintEl = document.getElementById("actionMenuHint");
const closeActionMenuBtnEl = document.getElementById("closeActionMenuBtn");
const menuImageBtnEl = document.getElementById("menuImageBtn");
const menuLockBtnEl = document.getElementById("menuLockBtn");
const menuDeleteBtnEl = document.getElementById("menuDeleteBtn");
const priorityBtnEls = Array.from(document.querySelectorAll(".priority-btn"));

const pinModalEl = document.getElementById("pinModal");
const pinTitleEl = document.getElementById("pinTitle");
const pinHintEl = document.getElementById("pinHint");
const pinPreviewEl = document.getElementById("pinPreview");
const pinKeyboardEl = document.getElementById("pinKeyboard");
const closePinModalBtnEl = document.getElementById("closePinModalBtn");
const voiceFallbackModalEl = document.getElementById("voiceFallbackModal");
const voiceFallbackHintEl = document.getElementById("voiceFallbackHint");
const voiceFallbackInputEl = document.getElementById("voiceFallbackInput");
const voiceFallbackCancelBtnEl = document.getElementById("voiceFallbackCancelBtn");
const voiceFallbackInsertBtnEl = document.getElementById("voiceFallbackInsertBtn");

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let speechRecognizer = null;
const speechLanguageCandidates = buildSpeechLanguageCandidates();
let speechLanguageIndex = 0;
let speechRetryCount = 0;

let notes = [];
let selectedId = null;
let draftId = null;
let searchQuery = "";
let autoSaveTimer = null;

let currentView = "home";
let pinModalMode = null;
let pinTargetId = null;
let pinBuffer = "";
let pinSuccessCallback = null;
let isRecording = false;
let editorSelectionRange = null;

// Firebase
let firebaseApp = null;
let firebaseAuth = null;
let firestore = null;
let currentUser = null;
let notesUnsub = null;
let firstSyncDone = false;

const googleProvider = () => new firebase.auth.GoogleAuthProvider();

init();

function init() {
  registerPwaServiceWorker();
  initTheme();
  initFirebase();
}

async function initFirebase() {
  const missing = Object.values(firebaseConfig).filter((v) => !v);

  if (missing.length || !window.firebase) {
    const rawSingle = String(import.meta.env.VITE_FIREBASE || "").trim();
    let looksLikeAdminKey = false;
    if (rawSingle) {
      try {
        const parsedGuess = JSON.parse(rawSingle);
        looksLikeAdminKey =
          parsedGuess && typeof parsedGuess === "object" && Boolean(parsedGuess.private_key) && !parsedGuess.apiKey;
      } catch {
        // Not JSON — general error shown below.
      }
    }

    if (looksLikeAdminKey) {
      setAuthStatus(
        "VITE_FIREBASE nao e o firebaseConfig do Web App. Parece a chave de service account (Admin SDK)."
      );
      authLockHintEl.textContent =
        "Coloca na VITE_FIREBASE o objeto firebaseConfig (apiKey, authDomain, projectId, appId...) do teu app web no Firebase Console, nao o JSON de service account.";
    } else {
      setAuthStatus("Configuracao Firebase em falta. Define a variavel VITE_FIREBASE com o firebaseConfig do Web App.");
      authLockHintEl.textContent =
        "Configuracao Firebase em falta. Verifica a variavel de ambiente VITE_FIREBASE (JSON do firebaseConfig).";
    }
    return;
  }

  try {
    firebaseApp = window.firebase.initializeApp(firebaseConfig);
    firebaseAuth = window.firebase.auth(firebaseApp);
    firestore = window.firebase.firestore(firebaseApp);

    if (!navigator.onLine) {
      authLockHintEl.textContent = "Sem ligacao a internet. Inicia sessao para continuar.";
    }

    bindAuth();
  } catch {
    setAuthStatus("Erro ao inicializar o Firebase.");
    authLockHintEl.textContent = "Erro ao inicializar o Firebase. Tenta novamente.";
  }
}

function bindAuth() {
  firebaseAuth.onAuthStateChanged((user) => {
    handleAuthStateChange(user);
  });
}

async function handleAuthStateChange(user) {
  if (user) {
    currentUser = user;
    notes = [];
    firstSyncDone = false;

    authLockScreenEl.classList.add("hidden");
    document.body.classList.remove("app-locked");

    startNotesSubscription();
    return;
  }

  currentUser = null;
  stopNotesSubscription();
  notes = [];
  selectedId = null;
  draftId = null;

  document.body.classList.add("app-locked");
  authLockScreenEl.classList.remove("hidden");
  authStatusEl.textContent = "";
  authLockHintEl.textContent = "Inicia sessao para continuares a usar o Colapso e guardares as tuas notas.";
  render();
}

function startNotesSubscription() {
  const ref = firestore
    .collection("notes")
    .where("ownerId", "==", currentUser.uid);

  notesUnsub = ref.onSnapshot(
    (snapshot) => {
      const incoming = snapshot.docs.map((doc) => normalizeNote(doc.id, doc.data()));

      // Merge with local drafts not yet persisted.
      const localOnly = notes.filter((n) => !incoming.some((i) => i.id === n.id));
      notes = [...incoming, ...localOnly];

      sortNotes();

      if (notes.length === 0) {
        const created = makeNote();
        notes = [created];
        selectedId = created.id;
      } else if (!selectedId || !notes.some((n) => n.id === selectedId)) {
        selectedId = notes[0].id;
      }

      if (!firstSyncDone) {
        firstSyncDone = true;
        persist();
      }

      render();
    },
    (error) => {
      if (error && error.code === "permission-denied") {
        setAuthStatus("Sem permissao para ler notas. Verifica as regras do Firestore.");
        return;
      }
      setAuthStatus("Falha ao sincronizar notas. Verifica a ligacao e as regras do Firestore.");
    }
  );
}

function stopNotesSubscription() {
  if (notesUnsub) {
    notesUnsub();
    notesUnsub = null;
  }
}

function normalizeNote(id, data) {
  return {
    id: Number(id) || Number(data.id),
    title: String(data.title ?? "Nova nota"),
    content: String(data.content ?? ""),
    contentHtml: String(data.contentHtml ?? textToHtml(String(data.content ?? ""))),
    images: Array.isArray(data.images)
      ? data.images
          .map((image) => ({
            id: Number(image.id),
            src: String(image.src ?? ""),
            name: String(image.name ?? "imagem"),
          }))
          .filter((image) => Number.isFinite(image.id) && image.src)
      : [],
    priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : Number(data.pinned) ? 1 : 0,
    locked: Boolean(data.locked),
    pin: String(data.pin ?? ""),
    ownerId: String(data.ownerId ?? currentUser?.uid ?? ""),
    updatedAt: Number(data.updatedAt) || Date.now(),
  };
}

function bindEvents() {
  googleLoginBtnEl.addEventListener("click", () => {
    handleGoogleLogin();
  });

  accountBtnEl.addEventListener("click", () => {
    openAccountModal();
  });

  closeAccountBtnEl.addEventListener("click", () => {
    closeAccountModal();
  });

  accountModalEl.addEventListener("click", (event) => {
    if (event.target === accountModalEl) {
      closeAccountModal();
    }
  });

  logoutBtnEl.addEventListener("click", () => {
    firebaseAuth.signOut().catch(() => {
      setAuthStatus("Erro ao terminar sessao.");
    });
    closeAccountModal();
  });

  viewNotesBtnEl.addEventListener("click", () => {
    setView("home");
  });

  viewAddBtnEl.addEventListener("click", () => {
    const created = makeNote();
    notes.unshift(created);
    selectedId = created.id;
    draftId = created.id;
    renderList();
    openAddScreen(created.id);
  });

  viewCalendarBtnEl.addEventListener("click", () => {
    setView("calendar");
  });

  editorBackBtnEl.addEventListener("click", () => {
    setView("home");
  });

  toolbarVoiceBtnEl.addEventListener("click", () => {
    if (!SpeechRecognitionApi) {
      statusTextEl.textContent = "Ditado nao suportado neste navegador";
      openVoiceFallbackModal("Usa a entrada manual para continuar sem Web Speech API.");
      return;
    }

    if (isRecording) {
      stopDictation();
      statusTextEl.textContent = "Ditado interrompido";
    } else {
      startDictation();
    }
  });

  addActionsBtnEl.addEventListener("click", () => {
    openActionMenu();
  });

  closeActionMenuBtnEl.addEventListener("click", () => {
    closeActionMenu();
  });

  actionMenuModalEl.addEventListener("click", (event) => {
    if (event.target === actionMenuModalEl) {
      closeActionMenu();
    }
  });

  priorityBtnEls.forEach((btn) => {
    btn.addEventListener("click", () => {
      const priority = Number(btn.dataset.priority || 0);
      applyPriority(priority);
      closeActionMenu();
    });
  });

  menuImageBtnEl.addEventListener("click", () => {
    captureEditorSelection();
    closeActionMenu();
    imagePickerEl.click();
  });

  menuLockBtnEl.addEventListener("click", () => {
    const note = notes.find((item) => item.id === draftId);
    if (!note) return;

    closeActionMenu();
    openPinModal("set", note.id);
  });

  menuDeleteBtnEl.addEventListener("click", () => {
    closeActionMenu();
    deleteDraftNote();
  });

  imagePickerEl.addEventListener("change", async () => {
    const note = notes.find((item) => item.id === draftId);
    const file = imagePickerEl.files?.[0];
    if (!file || !note) return;

    const dataUrl = await readImageAsDataUrl(file);
    if (!Array.isArray(note.images)) {
      note.images = [];
    }

    note.images.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      src: dataUrl,
      name: file.name,
    });
    note.updatedAt = Date.now();
    insertImageAtCursor(dataUrl, file.name);
    statusTextEl.textContent = "A guardar...";
    saveDraftFromInputs();
    imagePickerEl.value = "";
  });

  imageGalleryEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("image-remove")) return;

    const note = notes.find((item) => item.id === draftId);
    if (!note || !Array.isArray(note.images)) return;

    const imageId = Number(target.dataset.imageId);
    note.images = note.images.filter((image) => image.id !== imageId);
    note.updatedAt = Date.now();
    statusTextEl.textContent = "A guardar...";
    queueAutoSave();
    renderEditor();
    renderList();
  });

  contentInputEl.addEventListener("input", () => {
    saveDraftFromInputs();
  });

  contentInputEl.addEventListener("keyup", () => {
    captureEditorSelection();
  });

  contentInputEl.addEventListener("mouseup", () => {
    captureEditorSelection();
  });

  contentInputEl.addEventListener("paste", (event) => {
    handleEditorPaste(event);
  });

  searchInputEl.addEventListener("input", () => {
    searchQuery = searchInputEl.value.trim().toLowerCase();
    renderList();
  });

  pinKeyboardEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("pin-key")) return;

    handlePinKey(String(target.dataset.key || ""));
  });

  closePinModalBtnEl.addEventListener("click", () => {
    closePinModal();
  });

  pinModalEl.addEventListener("click", (event) => {
    if (event.target === pinModalEl) {
      closePinModal();
    }
  });

  voiceFallbackCancelBtnEl.addEventListener("click", () => {
    closeVoiceFallbackModal();
  });

  voiceFallbackInsertBtnEl.addEventListener("click", () => {
    submitVoiceFallbackText();
  });

  voiceFallbackInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitVoiceFallbackText();
    }
  });

  voiceFallbackModalEl.addEventListener("click", (event) => {
    if (event.target === voiceFallbackModalEl) {
      closeVoiceFallbackModal();
    }
  });
}

async function handleGoogleLogin() {
  if (!firebaseAuth) return;

  try {
    setAuthStatus("A iniciar sessao...");
    await firebaseAuth.signInWithPopup(googleProvider());
    setAuthStatus("");
  } catch (error) {
    const code = error?.code || "";

    if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
      authLockHintEl.textContent = "Fechaste a janela de login. Tenta novamente.";
      setAuthStatus("");
      return;
    }

    if (code === "auth/unauthorized-domain") {
      authLockHintEl.textContent =
        "Dominio nao autorizado no Firebase. Adiciona este dominio em Firebase > Authentication > Settings > Authorized domains.";
      setAuthStatus("");
      return;
    }

    if (code === "auth/network-request-failed") {
      authLockHintEl.textContent = "Sem ligacao a internet. Verifica a rede e tenta novamente.";
      setAuthStatus("");
      return;
    }

    setAuthStatus("Nao foi possivel iniciar sessao. Tenta novamente.");
    authLockHintEl.textContent = "Ocorreu um erro ao iniciar sessao com o Google.";
  }
}

function setAuthStatus(message) {
  if (authStatusEl) {
    authStatusEl.textContent = message;
  }
}

function openAccountModal() {
  if (!currentUser) return;

  const name = currentUser.displayName || currentUser.email || "Utilizador";
  const email = currentUser.email || "";
  const photo =
    currentUser.photoURL ||
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="%231ea95f"/><text x="32" y="40" font-size="28" fill="white" text-anchor="middle" font-family="sans-serif">' +
      (name.charAt(0) || "?") +
      "</text></svg>";

  accountInfoEl.innerHTML = `
    <img class="account-avatar" src="${photo}" alt="Foto de perfil">
    <div class="account-text">
      <p class="account-name">${escapeHtml(name)}</p>
      <p class="account-email">${escapeHtml(email)}</p>
    </div>
  `;

  accountModalEl.classList.remove("hidden");
  accountModalEl.setAttribute("aria-hidden", "false");
}

function closeAccountModal() {
  accountModalEl.classList.add("hidden");
  accountModalEl.setAttribute("aria-hidden", "true");
}

function render() {
  draftId = selectedId;
  setView(currentView);
  renderList();
  if (document.activeElement !== contentInputEl) {
    renderEditor();
  }
  renderCalendar();
}

function setView(view) {
  currentView = view;
  const showHome = view === "home";
  const showAdd = view === "add";
  const showCalendar = view === "calendar";

  notesScreenEl.classList.toggle("hidden", !showHome);
  addScreenEl.classList.toggle("hidden", !showAdd);
  calendarScreenEl.classList.toggle("hidden", !showCalendar);
  mainNavEl.classList.toggle("hidden", showAdd);
  addNavEl.classList.toggle("hidden", !showAdd);

  viewNotesBtnEl.classList.toggle("is-active", showHome);
  viewAddBtnEl.classList.toggle("is-active", showAdd);
  viewCalendarBtnEl.classList.toggle("is-active", showCalendar);

  document.body.classList.toggle("is-add-view", showAdd);

  if (!showAdd && isRecording) {
    stopDictation();
  }

  if (!showAdd) {
    closeActionMenu();
    closeVoiceFallbackModal();
  }

  if (showCalendar) {
    renderCalendar();
  }
}

function renderList() {
  const filtered = notes.filter((note) => {
    if (!searchQuery) return true;
    return (
      note.title.toLowerCase().includes(searchQuery) ||
      note.content.toLowerCase().includes(searchQuery)
    );
  });

  if (filtered.length === 0) {
    notesListEl.innerHTML = '<div class="empty-state">Sem resultados.</div>';
    return;
  }

  notesListEl.innerHTML = filtered
    .map((note, index) => {
      const activeClass = note.id === selectedId ? "active" : "";
      const priorityClass = `priority-${note.priority || 0}`;
      const lockedClass = note.locked ? "is-locked" : "";
      const priorityTag = getPriorityChip(note.priority || 0);
      const lockTag = note.locked ? '<span class="lock-chip">PIN</span>' : "";
      const noteTitle = note.title && note.title !== "Nova nota" ? note.title : "";
      const title = escapeHtml(noteTitle || generateNoteTitle(note.content) || "Sem titulo");
      const preview = note.locked
        ? "Conteudo bloqueado"
        : escapeHtml((note.content || "").slice(0, 74));
      const date = formatDate(note.updatedAt);
      const imageCount = Array.isArray(note.images) ? note.images.length : 0;
      const imageMeta = imageCount > 0 ? `${imageCount} imagem(ns)` : "";
      const delay = Math.min(index * 25, 200);

      return `
        <button class="note-item ${activeClass} ${priorityClass} ${lockedClass}" data-id="${note.id}" style="animation-delay:${delay}ms">
          <div class="note-head">
            <h3>${title}</h3>
            <div class="note-tags">
              ${priorityTag}
              ${lockTag}
            </div>
          </div>
          <div class="note-meta">${date}</div>
          <div class="note-meta">${preview || "Sem conteudo"}</div>
          <div class="note-meta">${imageMeta}</div>
        </button>
      `;
    })
    .join("");

  notesListEl.querySelectorAll(".note-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.id);
      tryOpenNote(id);
    });
  });
}

function tryOpenNote(noteId) {
  const note = notes.find((item) => item.id === noteId);
  if (!note) return;

  if (note.locked) {
    openPinModal("unlock", note.id, () => {
      selectedId = note.id;
      openAddScreen(note.id);
    });
    return;
  }

  selectedId = note.id;
  openAddScreen(note.id);
}

function renderEditor() {
  const note = notes.find((item) => item.id === draftId) ?? null;

  if (!note) {
    setEditorContent("");
    statusTextEl.textContent = "";
    imageGalleryEl.innerHTML = '<div class="image-empty"></div>';
    actionMenuHintEl.textContent = "Escolhe uma acao.";
    return;
  }

  const html = note.contentHtml || textToHtml(note.content || "");
  setEditorContent(html);
  statusTextEl.textContent = "Guardado automaticamente";
  renderImageGallery(note);
  actionMenuHintEl.textContent = `Prioridade atual: ${getPriorityLabel(note.priority || 0)}.`;
}

function openAddScreen(noteId = null) {
  draftId = noteId;
  renderEditor();
  setView("add");
  placeCaretAtEnd();
}

function saveDraftFromInputs() {
  const note = notes.find((item) => item.id === draftId);
  if (!note) return;

  note.contentHtml = getEditorHtml();
  note.content = htmlToPlainText(note.contentHtml);
  note.title = generateNoteTitle(note.content);
  note.updatedAt = Date.now();
  selectedId = note.id;

  statusTextEl.textContent = "A guardar...";
  queueAutoSave();
  renderList();
}

function queueAutoSave() {
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    sortNotes();
    persist();
    renderList();
    renderCalendar();
    statusTextEl.textContent = "Guardado automaticamente";
  }, 320);
}

function applyPriority(priority) {
  const note = notes.find((item) => item.id === draftId);
  if (!note) return;

  note.priority = Math.max(0, Math.min(3, priority));
  note.updatedAt = Date.now();
  sortNotes();
  persist();
  renderList();
  renderEditor();

  statusTextEl.textContent = `Prioridade ${getPriorityLabel(note.priority)} aplicada`;
}

function deleteDraftNote() {
  if (!draftId) {
    setEditorContent("");
    statusTextEl.textContent = "Nota nova limpa";
    return;
  }

  const ok = window.confirm("Eliminar esta nota?");
  if (!ok) return;

  const noteToDelete = notes.find((note) => note.id === draftId);

  if (noteToDelete && !noteToDelete.isLocalOnly) {
    firestore
      .collection("notes")
      .doc(String(draftId))
      .delete()
      .catch(() => {
        setAuthStatus("Falha ao eliminar no Firestore. Verifica as regras.");
      });
  }

  notes = notes.filter((note) => note.id !== draftId);
  draftId = null;
  window.clearTimeout(autoSaveTimer);

  if (notes.length === 0) {
    selectedId = null;
  } else {
    selectedId = notes[0].id;
  }

  renderList();
  renderCalendar();
  setView("home");
}

function openActionMenu() {
  if (currentView !== "add") return;

  actionMenuModalEl.classList.remove("hidden");
  actionMenuModalEl.setAttribute("aria-hidden", "false");
}

function closeActionMenu() {
  actionMenuModalEl.classList.add("hidden");
  actionMenuModalEl.setAttribute("aria-hidden", "true");
}

function openPinModal(mode, noteId, onSuccess = null) {
  pinModalMode = mode;
  pinTargetId = noteId;
  pinSuccessCallback = onSuccess;
  pinBuffer = "";

  if (mode === "set") {
    pinTitleEl.textContent = "Definir PIN da nota";
    pinHintEl.textContent = "Escolhe um PIN numerico de 4 a 9 digitos.";
  } else {
    pinTitleEl.textContent = "Desbloquear nota";
    pinHintEl.textContent = "Introduz o PIN para abrir esta nota.";
  }

  updatePinPreview();
  pinModalEl.classList.remove("hidden");
  pinModalEl.setAttribute("aria-hidden", "false");
}

function closePinModal() {
  pinModalMode = null;
  pinTargetId = null;
  pinSuccessCallback = null;
  pinBuffer = "";
  pinModalEl.classList.add("hidden");
  pinModalEl.setAttribute("aria-hidden", "true");
}

function setupDictation() {
  if (!SpeechRecognitionApi) return;

  speechRecognizer = null;
  speechRecognizer = new SpeechRecognitionApi();
  speechRecognizer.lang = speechLanguageCandidates[speechLanguageIndex] || "pt-PT";
  speechRecognizer.interimResults = true;
  speechRecognizer.continuous = false;

  speechRecognizer.onresult = (event) => {
    let transcript = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const part = event.results[i][0]?.transcript ?? "";
      if (event.results[i].isFinal) {
        transcript += part;
      }
    }

    const finalText = transcript.trim();
    if (!finalText) return;

    speechRetryCount = 0;
    insertTextAtCursor(`${finalText} `);
    saveDraftFromInputs();
  };

  speechRecognizer.onerror = (event) => {
    isRecording = false;
    toolbarVoiceBtnEl.classList.remove("is-recording");

    if (shouldRetrySpeech(event.error)) {
      retryDictationWithNextLanguage();
      return;
    }

    statusTextEl.textContent = getSpeechErrorMessage(event.error);

    if (shouldOfferVoiceFallback(event.error)) {
      openVoiceFallbackModal("Ditado indisponivel agora. Escreve aqui para inserir manualmente.");
    }
  };

  speechRecognizer.onend = () => {
    isRecording = false;
    toolbarVoiceBtnEl.classList.remove("is-recording");
  };
}

function startDictation() {
  if (location.protocol === "file:") {
    statusTextEl.textContent = "Ditado por voz precisa de localhost ou HTTPS (nao funciona bem em file://)";
    openVoiceFallbackModal("Abre em localhost/HTTPS ou usa esta entrada manual.");
    return;
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    statusTextEl.textContent = "Ditado por voz precisa de HTTPS ou localhost";
    openVoiceFallbackModal("Sem HTTPS o ditado pode falhar. Usa a entrada manual por agora.");
    return;
  }

  if (!navigator.onLine) {
    statusTextEl.textContent = "Sem internet. O ditado por voz precisa de rede";
    openVoiceFallbackModal("Sem internet para ditado. Escreve aqui para inserir manualmente.");
    return;
  }

  setupDictation();
  if (!speechRecognizer) return;

  try {
    isRecording = true;
    speechRetryCount = 0;
    speechLanguageIndex = 0;
    toolbarVoiceBtnEl.classList.add("is-recording");
    const currentLang = speechLanguageCandidates[speechLanguageIndex] || "pt-PT";
    statusTextEl.textContent = `A ouvir... (${currentLang})`;
    speechRecognizer.start();
  } catch {
    isRecording = false;
    toolbarVoiceBtnEl.classList.remove("is-recording");
    statusTextEl.textContent = "Nao foi possivel iniciar o microfone";
    openVoiceFallbackModal("Falha ao iniciar microfone. Usa a entrada manual.");
  }
}

function stopDictation() {
  isRecording = false;
  toolbarVoiceBtnEl.classList.remove("is-recording");

  if (speechRecognizer) {
    try {
      speechRecognizer.stop();
    } catch {
      // Ignore stop errors.
    }
  }
}

function getSpeechErrorMessage(errorCode) {
  const messages = {
    "not-allowed": "Permissao do microfone negada",
    "service-not-allowed": "Servico de voz bloqueado no navegador",
    "audio-capture": "Microfone nao encontrado",
    network: "Servico de voz indisponivel no momento. Tenta novamente ou usa Chrome/Edge.",
    "no-speech": "Nao foi detetada voz",
    aborted: "Ditado interrompido",
    "language-not-supported": "Idioma nao suportado no ditado",
  };

  return messages[errorCode] || "Erro no ditado por voz";
}

function getPreferredSpeechLanguage() {
  const lang = (navigator.language || "").toLowerCase();

  if (lang.startsWith("pt")) {
    return "pt-PT";
  }

  return "en-US";
}

function buildSpeechLanguageCandidates() {
  const preferred = getPreferredSpeechLanguage();
  const fallbacks = [preferred, "pt-PT", "pt-BR", "en-US"];

  return [...new Set(fallbacks.filter(Boolean))];
}

function shouldRetrySpeech(errorCode) {
  if (speechRetryCount >= 2) return false;

  return errorCode === "network" || errorCode === "language-not-supported" || errorCode === "service-not-allowed";
}

function shouldOfferVoiceFallback(errorCode) {
  if (errorCode === "aborted" || errorCode === "no-speech") return false;
  return true;
}

function retryDictationWithNextLanguage() {
  speechRetryCount += 1;
  speechLanguageIndex = (speechLanguageIndex + 1) % speechLanguageCandidates.length;

  const nextLang = speechLanguageCandidates[speechLanguageIndex] || "pt-PT";
  statusTextEl.textContent = `A tentar novamente com ${nextLang}...`;

  window.setTimeout(() => {
    startDictation();
  }, 180);
}

function openVoiceFallbackModal(hintText = "") {
  if (!voiceFallbackModalEl) return;

  if (typeof hintText === "string" && hintText.trim()) {
    voiceFallbackHintEl.textContent = hintText;
  } else {
    voiceFallbackHintEl.textContent = "Se o ditado nao funcionar, escreve aqui e insere no editor.";
  }

  voiceFallbackModalEl.classList.remove("hidden");
  voiceFallbackModalEl.setAttribute("aria-hidden", "false");
  voiceFallbackInputEl.focus();
}

function closeVoiceFallbackModal() {
  if (!voiceFallbackModalEl) return;

  voiceFallbackModalEl.classList.add("hidden");
  voiceFallbackModalEl.setAttribute("aria-hidden", "true");
}

function submitVoiceFallbackText() {
  const text = String(voiceFallbackInputEl.value || "").trim();
  if (!text) {
    statusTextEl.textContent = "Escreve algum texto para inserir";
    voiceFallbackInputEl.focus();
    return;
  }

  if (text.includes("\n")) {
    insertMultilineTextAtCursor(text);
  } else {
    insertTextAtCursor(`${text} `);
  }

  saveDraftFromInputs();
  voiceFallbackInputEl.value = "";
  closeVoiceFallbackModal();
  statusTextEl.textContent = "Texto inserido manualmente";
}

function handlePinKey(key) {
  if (!pinModalMode) return;

  if (/^\d$/.test(key)) {
    if (pinBuffer.length < 9) {
      pinBuffer += key;
    }
    updatePinPreview();
    return;
  }

  if (key === "clear") {
    pinBuffer = "";
    updatePinPreview();
    return;
  }

  if (key === "ok") {
    submitPin();
  }
}

function submitPin() {
  const note = notes.find((item) => item.id === pinTargetId);
  if (!note) {
    closePinModal();
    return;
  }

  if (pinModalMode === "set") {
    if (pinBuffer.length < 4) {
      pinHintEl.textContent = "PIN curto. Usa pelo menos 4 digitos.";
      return;
    }

    note.pin = pinBuffer;
    note.locked = true;
    note.updatedAt = Date.now();
    sortNotes();
    persist();
    renderList();
    renderEditor();
    statusTextEl.textContent = "Nota bloqueada com PIN";
    closePinModal();
    return;
  }

  if (pinModalMode === "unlock") {
    if (pinBuffer === note.pin) {
      const callback = pinSuccessCallback;
      closePinModal();
      if (typeof callback === "function") {
        callback();
      }
      return;
    }

    pinHintEl.textContent = "PIN incorreto. Tenta novamente.";
    pinBuffer = "";
    updatePinPreview();
  }
}

function updatePinPreview() {
  if (pinBuffer.length === 0) {
    pinPreviewEl.textContent = "○ ○ ○ ○";
    return;
  }

  pinPreviewEl.textContent = Array.from({ length: pinBuffer.length }, () => "●").join(" ");
}

function makeNote() {
  const now = Date.now();
  return {
    id: now + Math.floor(Math.random() * 1000),
    title: "Nova nota",
    content: "",
    contentHtml: "",
    images: [],
    priority: 0,
    locked: false,
    pin: "",
    ownerId: currentUser?.uid ?? "",
    updatedAt: now,
    isLocalOnly: true,
  };
}

function sortNotes() {
  notes.sort((a, b) => {
    const aPriority = Number(a.priority || 0);
    const bPriority = Number(b.priority || 0);
    if (aPriority !== bPriority) return bPriority - aPriority;
    return b.updatedAt - a.updatedAt;
  });
}

function persist() {
  if (!firestore || !currentUser) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // Storage may be unavailable.
    }
    return;
  }

  const uid = currentUser.uid;

  notes.forEach((note) => {
    const isEmptyLocal =
      note.isLocalOnly &&
      note.title === "Nova nota" &&
      !note.content &&
      !note.contentHtml;
    if (isEmptyLocal) return;

    const data = {
      id: note.id,
      ownerId: uid,
      title: note.title,
      content: note.content,
      contentHtml: note.contentHtml,
      images: note.images,
      priority: note.priority,
      locked: note.locked,
      pin: note.pin,
      updatedAt: note.updatedAt,
    };

    firestore
      .collection("notes")
      .doc(String(note.id))
      .set(data)
      .then(() => {
        note.isLocalOnly = false;
      })
      .catch(() => {
        setAuthStatus("Falha ao guardar notas no Firestore. Verifica as regras.");
      });
  });
}

function formatDate(ts) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPriorityLabel(priority) {
  if (priority === 3) return "alta";
  if (priority === 2) return "media";
  if (priority === 1) return "baixa";
  return "normal";
}

function getPriorityChip(priority) {
  if (priority === 3) {
    return '<span class="pin-chip p-high">Alta</span>';
  }

  if (priority === 2) {
    return '<span class="pin-chip p-mid">Media</span>';
  }

  if (priority === 1) {
    return '<span class="pin-chip p-low">Baixa</span>';
  }

  return "";
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
}

function renderImageGallery(note) {
  const images = Array.isArray(note.images) ? note.images : [];

  if (images.length === 0) {
    imageGalleryEl.innerHTML = "";
    imageGalleryEl.classList.add("image-gallery-empty");
    return;
  }

  imageGalleryEl.classList.remove("image-gallery-empty");

  imageGalleryEl.innerHTML = images
    .map(
      (image) => `
        <div class="image-card">
          <img src="${image.src}" alt="${escapeHtml(image.name)}">
          <button class="image-remove" data-image-id="${image.id}" type="button" aria-label="Remover imagem">✕</button>
        </div>
      `
    )
    .join("");
}

function getEditorHtml() {
  if (contentInputEl.isContentEditable) {
    return sanitizeEditorHtml(contentInputEl.innerHTML);
  }

  return textToHtml(contentInputEl.value || "");
}

function setEditorContent(html) {
  if (contentInputEl.isContentEditable) {
    contentInputEl.innerHTML = html || "";
    return;
  }

  contentInputEl.value = htmlToPlainText(html || "");
}

function textToHtml(text) {
  return escapeHtml(text).replaceAll("\n", "<br>");
}

function htmlToPlainText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html || "";
  return (temp.textContent || "").replace(/\s+/g, " ").trim();
}

function sanitizeEditorHtml(html) {
  if (!html) return "";

  const temp = document.createElement("div");
  temp.innerHTML = html;

  temp.querySelectorAll("script,style,iframe,object,embed").forEach((el) => el.remove());

  temp.querySelectorAll("pre,code").forEach((node) => {
    const pre = document.createElement("pre");
    pre.className = "editor-code-block";
    pre.textContent = node.textContent || "";
    node.replaceWith(pre);
  });

  temp.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName;

    el.removeAttribute("style");
    el.removeAttribute("class");

    if (tag === "PRE") {
      el.className = "editor-code-block";
    }

    if (tag === "IMG") {
      el.className = "inline-editor-image";
    }
  });

  temp.querySelectorAll("img").forEach((img) => {
    img.classList.add("inline-editor-image");
    img.removeAttribute("width");
    img.removeAttribute("height");
  });

  return temp.innerHTML;
}

function captureEditorSelection() {
  if (!contentInputEl.isContentEditable) return;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  if (!contentInputEl.contains(range.commonAncestorContainer)) return;
  editorSelectionRange = range.cloneRange();
}

function restoreEditorSelection() {
  if (!contentInputEl.isContentEditable || !editorSelectionRange) return;

  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(editorSelectionRange);
}

function insertTextAtCursor(text) {
  if (!contentInputEl.isContentEditable) {
    const cursor = contentInputEl.selectionStart ?? contentInputEl.value.length;
    contentInputEl.setRangeText(text, cursor, cursor, "end");
    return;
  }

  contentInputEl.focus();
  restoreEditorSelection();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  captureEditorSelection();
}

function handleEditorPaste(event) {
  if (!contentInputEl.isContentEditable) return;

  const text = event.clipboardData?.getData("text/plain") || "";
  if (!text) return;

  event.preventDefault();

  const normalized = text.replaceAll("\r\n", "\n");
  if (looksLikeCodeSnippet(normalized)) {
    insertCodeBlockAtCursor(normalized);
  } else {
    insertMultilineTextAtCursor(normalized);
  }

  saveDraftFromInputs();
}

function looksLikeCodeSnippet(text) {
  const lines = text.split("\n");
  const hasManyLines = lines.length >= 2;
  const hasIndentation = lines.some((line) => /^\s{2,}\S/.test(line));
  const hasTabs = text.includes("\t");
  const hasCodeChars = /[{}();=<>"]/.test(text);
  const hasOperators = /=>|==|===|!=|!==|\+=|-=|\*=|\/=/.test(text);
  const hasFence = /```/.test(text);
  const hasKeywords = /\b(function|const|let|var|class|return|if|else|for|while|import|export)\b/.test(text);

  return hasFence || (hasManyLines && (hasCodeChars || hasOperators || hasTabs || hasKeywords)) || (hasIndentation && hasKeywords);
}

function insertMultilineTextAtCursor(text) {
  if (!contentInputEl.isContentEditable) {
    insertTextAtCursor(text);
    return;
  }

  contentInputEl.focus();
  restoreEditorSelection();

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const fragment = document.createDocumentFragment();
  const parts = text.split("\n");

  parts.forEach((part, index) => {
    fragment.append(document.createTextNode(part));
    if (index < parts.length - 1) {
      fragment.append(document.createElement("br"));
    }
  });

  range.insertNode(fragment);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  captureEditorSelection();
}

function insertCodeBlockAtCursor(codeText) {
  if (!contentInputEl.isContentEditable) {
    insertTextAtCursor(codeText);
    return;
  }

  contentInputEl.focus();
  restoreEditorSelection();

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const pre = document.createElement("pre");
  pre.className = "editor-code-block";
  pre.textContent = codeText;

  range.insertNode(pre);

  const spacer = document.createElement("br");
  range.setStartAfter(pre);
  range.collapse(true);
  range.insertNode(spacer);
  range.setStartAfter(spacer);
  range.collapse(true);

  sel.removeAllRanges();
  sel.addRange(range);
  captureEditorSelection();
}

function insertImageAtCursor(src, altText) {
  if (!contentInputEl.isContentEditable) return;

  contentInputEl.focus();
  restoreEditorSelection();

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const image = document.createElement("img");
  image.src = src;
  image.alt = altText || "Imagem";
  image.className = "inline-editor-image";

  range.insertNode(image);

  const spacer = document.createTextNode(" ");
  range.setStartAfter(image);
  range.collapse(true);
  range.insertNode(spacer);
  range.setStartAfter(spacer);
  range.collapse(true);

  sel.removeAllRanges();
  sel.addRange(range);
  captureEditorSelection();
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = new Intl.DateTimeFormat("pt-PT", {
    month: "long",
    year: "numeric",
  }).format(now);

  calendarTitleEl.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const weekdays = ["S", "T", "Q", "Q", "S", "S", "D"];
  calendarWeekdaysEl.innerHTML = weekdays
    .map((day) => `<span class="weekday">${day}</span>`)
    .join("");

  const firstDay = new Date(year, month, 1).getDay();
  const adjustedOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const notesByDay = getNoteCountByDay(year, month);

  const cells = [];
  for (let i = 0; i < adjustedOffset; i += 1) {
    cells.push('<div class="day-cell is-empty" aria-hidden="true"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const count = notesByDay.get(day) ?? 0;
    const marker = count > 0 ? `<span class="day-marker">${count}</span>` : "";
    const hasNotes = count > 0 ? "has-notes" : "";
    cells.push(`
      <div class="day-cell ${hasNotes}">
        <span class="day-number">${day}</span>
        ${marker}
      </div>
    `);
  }

  calendarGridEl.innerHTML = cells.join("");
}

function initTheme() {
  applyTheme("dark");
}

function applyTheme(theme) {
  const dark = theme === "dark" || !theme;
  document.body.classList.add("dark-theme");
  localStorage.setItem(THEME_KEY, "dark");
}

function generateNoteTitle(content) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (!text) return "Nova nota";

  const words = text.split(" ");
  let title = words[0] || "";
  if (words[1]) title += " " + words[1];
  return title;
}

function placeCaretAtEnd() {
  const el = contentInputEl;
  if (!el.isContentEditable) return;

  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    el.focus();
  } catch {
    el.focus();
  }
}

function getNoteCountByDay(year, month) {
  const map = new Map();

  notes.forEach((note) => {
    const date = new Date(note.updatedAt);
    if (date.getFullYear() !== year || date.getMonth() !== month) {
      return;
    }

    const day = date.getDate();
    map.set(day, (map.get(day) ?? 0) + 1);
  });

  return map;
}

function registerPwaServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Silent fail.
    });
  });
}

bindEvents();
