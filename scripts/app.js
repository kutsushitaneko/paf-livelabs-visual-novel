const STORAGE_KEY = "agent-factory-studio-state";
const CONTENT_URL = "content/lab2-task1.json";
const ASSET_URL = "assets/manifest.json";

const typeLabels = {
  dialogue: "ガイド",
  checkpoint: "開始条件",
  action: "操作",
  quiz: "確認問題",
  choice: "関心選択",
  recap: "Task完了"
};

const elements = {
  app: document.querySelector("#app"),
  background: document.querySelector("#background-image"),
  character: document.querySelector("#character-image"),
  progress: document.querySelector("#progress"),
  progressLabel: document.querySelector("#progress-label"),
  sceneType: document.querySelector("#scene-type"),
  scenePosition: document.querySelector("#scene-position"),
  speakerName: document.querySelector("#speaker-name"),
  speakerRole: document.querySelector("#speaker-role"),
  title: document.querySelector("#scene-title"),
  copy: document.querySelector("#scene-copy"),
  instructionCard: document.querySelector("#instruction-card"),
  instructionLabel: document.querySelector("#instruction-label"),
  instructionText: document.querySelector("#instruction-text"),
  screenshotCard: document.querySelector("#screenshot-card"),
  screenshotButton: document.querySelector("#screenshot-button"),
  screenshot: document.querySelector("#screenshot-image"),
  screenshotCaption: document.querySelector("#screenshot-caption"),
  legacyNote: document.querySelector("#legacy-note"),
  responseArea: document.querySelector("#response-area"),
  feedback: document.querySelector("#feedback"),
  hint: document.querySelector("#hint"),
  hintText: document.querySelector("#hint-text"),
  back: document.querySelector("#back-button"),
  hintButton: document.querySelector("#hint-button"),
  next: document.querySelector("#next-button"),
  settingsButton: document.querySelector("#settings-button"),
  settingsDialog: document.querySelector("#settings-dialog"),
  contrastToggle: document.querySelector("#contrast-toggle"),
  motionToggle: document.querySelector("#motion-toggle"),
  imageDialog: document.querySelector("#image-dialog"),
  dialogImage: document.querySelector("#dialog-image"),
  dialogCaption: document.querySelector("#dialog-caption"),
  restart: document.querySelector("#restart-button"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmRestart: document.querySelector("#confirm-restart")
};

let content;
let assets;
let state;
let currentSceneIndex = 0;

function defaultState(contentVersion) {
  return {
    schemaVersion: 1,
    contentVersion,
    currentSceneId: null,
    furthestIndex: 0,
    answers: {},
    interestPoints: {
      data: 0,
      knowledge: 0,
      builder: 0
    },
    settings: {
      highContrast: false,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
    },
    completed: false
  };
}

function loadState(contentVersion) {
  const fallback = defaultState(contentVersion);

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.schemaVersion !== 1) {
      return fallback;
    }

    if (saved.contentVersion !== contentVersion) {
      return {
        ...fallback,
        settings: {
          ...fallback.settings,
          ...saved.settings
        }
      };
    }

    return {
      ...fallback,
      ...saved,
      answers: saved.answers ?? {},
      settings: {
        ...fallback.settings,
        ...saved.settings
      }
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in strict privacy modes. The session still works.
  }
}

function getAsset(assetId) {
  const asset = assets.assets[assetId];
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }
  return asset;
}

function setImage(element, assetId) {
  const asset = getAsset(assetId);
  element.src = asset.src;
  element.alt = asset.alt ?? "";
  return asset;
}

function createParagraphs(lines) {
  return lines.map((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    return paragraph;
  });
}

function selectedOption(scene) {
  const answerId = state.answers[scene.id];
  return scene.interaction?.options.find((option) => option.id === answerId);
}

function recalculateInterestPoints() {
  const points = { data: 0, knowledge: 0, builder: 0 };

  for (const scene of content.scenes) {
    const option = selectedOption(scene);
    if (option?.interest && Object.hasOwn(points, option.interest)) {
      points[option.interest] += 1;
    }
  }

  state.interestPoints = points;
}

function renderInteraction(scene) {
  elements.responseArea.replaceChildren();
  elements.feedback.hidden = true;
  elements.feedback.removeAttribute("data-tone");

  if (!scene.interaction) {
    return;
  }

  const selected = selectedOption(scene);

  for (const option of scene.interaction.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "response-button";
    button.textContent = option.label;
    button.dataset.optionId = option.id;
    button.setAttribute("aria-pressed", String(selected?.id === option.id));
    button.addEventListener("click", () => chooseOption(scene, option));
    elements.responseArea.append(button);
  }

  if (selected) {
    renderFeedback(selected);
  }
}

function renderFeedback(option) {
  elements.feedback.textContent = option.feedback;
  elements.feedback.hidden = false;
  if (option.correct === false) {
    elements.feedback.dataset.tone = "try-again";
  }
}

function chooseOption(scene, option) {
  state.answers[scene.id] = option.id;
  recalculateInterestPoints();
  saveState();

  for (const button of elements.responseArea.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.optionId === option.id));
  }

  renderFeedback(option);
  elements.next.disabled = false;
  elements.next.focus();
}

function renderScene({ focusTitle = false } = {}) {
  const scene = content.scenes[currentSceneIndex];
  if (!scene) {
    showFatalError("シーンを読み込めませんでした。最初からやり直してください。");
    return;
  }

  state.currentSceneId = scene.id;
  state.furthestIndex = Math.max(state.furthestIndex, currentSceneIndex);
  state.completed = !scene.next;
  saveState();

  document.title = `${scene.title}｜Agent Factory Studio`;
  elements.sceneType.textContent = typeLabels[scene.type] ?? "ガイド";
  elements.scenePosition.textContent = `${currentSceneIndex + 1} / ${content.scenes.length}`;
  elements.progress.max = content.scenes.length;
  elements.progress.value = currentSceneIndex + 1;
  elements.progressLabel.textContent = `${content.lab} · ${content.task} · ${currentSceneIndex + 1}/${content.scenes.length}`;
  elements.speakerName.textContent = scene.speaker;
  elements.speakerRole.textContent = scene.speakerRole;
  elements.title.textContent = scene.title;
  elements.copy.replaceChildren(...createParagraphs(scene.body));

  setImage(elements.background, scene.backgroundAssetId);
  setImage(elements.character, scene.characterAssetId);

  elements.instructionCard.hidden = !scene.instruction;
  if (scene.instruction) {
    elements.instructionLabel.textContent = scene.instruction.label;
    elements.instructionText.textContent = scene.instruction.text;
  }

  elements.screenshotCard.hidden = !scene.screenshotAssetId;
  if (scene.screenshotAssetId) {
    const screenshot = setImage(elements.screenshot, scene.screenshotAssetId);
    elements.screenshotCaption.textContent = screenshot.caption ?? screenshot.alt;
    elements.legacyNote.hidden = screenshot.status !== "legacy-verify";
  } else {
    elements.screenshot.removeAttribute("src");
    elements.screenshot.alt = "";
  }

  elements.hint.hidden = true;
  elements.hintButton.setAttribute("aria-expanded", "false");
  elements.hintText.textContent = scene.hint ?? "このシーンには追加のヒントはありません。";
  renderInteraction(scene);

  elements.back.disabled = currentSceneIndex === 0;
  elements.next.hidden = !scene.next;
  elements.next.textContent = scene.type === "recap" ? "完了" : "次へ";
  elements.next.disabled = Boolean(scene.interaction && !selectedOption(scene));
  elements.app.dataset.loading = "false";

  if (focusTitle) {
    elements.title.focus({ preventScroll: true });
    elements.title.scrollIntoView({ behavior: state.settings.reducedMotion ? "auto" : "smooth", block: "start" });
  }
}

function showFatalError(message) {
  elements.app.dataset.loading = "false";
  elements.title.textContent = "ガイドを開始できませんでした";
  elements.copy.replaceChildren(...createParagraphs([message, "ページを再読み込みしても直らない場合は、公開元へ連絡してください。"]));
  elements.responseArea.replaceChildren();
  elements.instructionCard.hidden = true;
  elements.screenshotCard.hidden = true;
  elements.back.disabled = true;
  elements.next.disabled = true;
}

function goToScene(sceneId) {
  const index = content.scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) {
    showFatalError(`移動先のシーンが見つかりません: ${sceneId}`);
    return;
  }
  currentSceneIndex = index;
  renderScene({ focusTitle: true });
}

function applySettings() {
  document.body.classList.toggle("high-contrast", state.settings.highContrast);
  document.body.classList.toggle("reduced-motion", state.settings.reducedMotion);
  elements.contrastToggle.checked = state.settings.highContrast;
  elements.motionToggle.checked = state.settings.reducedMotion;
}

function setupEvents() {
  elements.next.addEventListener("click", () => {
    const scene = content.scenes[currentSceneIndex];
    if (scene.next) {
      goToScene(scene.next);
    }
  });

  elements.back.addEventListener("click", () => {
    if (currentSceneIndex > 0) {
      currentSceneIndex -= 1;
      renderScene({ focusTitle: true });
    }
  });

  elements.hintButton.addEventListener("click", () => {
    const willOpen = elements.hint.hidden;
    elements.hint.hidden = !willOpen;
    elements.hintButton.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      elements.hint.focus?.();
    }
  });

  elements.settingsButton.addEventListener("click", () => {
    elements.settingsDialog.showModal();
  });

  elements.contrastToggle.addEventListener("change", () => {
    state.settings.highContrast = elements.contrastToggle.checked;
    applySettings();
    saveState();
  });

  elements.motionToggle.addEventListener("change", () => {
    state.settings.reducedMotion = elements.motionToggle.checked;
    applySettings();
    saveState();
  });

  elements.screenshotButton.addEventListener("click", () => {
    elements.dialogImage.src = elements.screenshot.src;
    elements.dialogImage.alt = elements.screenshot.alt;
    elements.dialogCaption.textContent = elements.screenshotCaption.textContent;
    elements.imageDialog.showModal();
  });

  elements.restart.addEventListener("click", () => {
    elements.confirmDialog.showModal();
  });

  elements.confirmRestart.addEventListener("click", () => {
    const settings = { ...state.settings };
    state = defaultState(content.contentVersion);
    state.settings = settings;
    state.currentSceneId = content.startSceneId;
    localStorage.removeItem(STORAGE_KEY);
    applySettings();
    goToScene(content.startSceneId);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" && !elements.back.disabled && !document.querySelector("dialog[open]")) {
      elements.back.click();
    }
    if (event.key === "ArrowRight" && !elements.next.disabled && !elements.next.hidden && !document.querySelector("dialog[open]")) {
      elements.next.click();
    }
  });
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  return response.json();
}

async function start() {
  try {
    [content, assets] = await Promise.all([loadJson(CONTENT_URL), loadJson(ASSET_URL)]);
    state = loadState(content.contentVersion);
    applySettings();
    setupEvents();

    const resumeId = content.scenes.some((scene) => scene.id === state.currentSceneId)
      ? state.currentSceneId
      : content.startSceneId;
    currentSceneIndex = content.scenes.findIndex((scene) => scene.id === resumeId);
    renderScene();
  } catch (error) {
    console.error(error);
    showFatalError("シナリオまたは画像情報を読み込めませんでした。");
  }
}

start();
