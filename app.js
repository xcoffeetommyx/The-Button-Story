const FOUND_ENDING_WAIT_SECONDS = 60;

const STORY = window.BUTTON_STORY;
const STORAGE_KEY = "the-button-story:progress:v1";
const SETTINGS_KEY = "the-button-story:settings:v1";
const ACHIEVEMENTS_KEY = "the-button-story:achievements:v1";
const TYPE_SPEED_MS = 18;
const TRANSITION_MS = 180;
const REPLAY_HIGHLIGHT_PHRASES = [
  "The moth waited",
  "Being safe was not the same as being seen",
  "Need less",
  "It was easy to miss quiet things",
  "When June stopped and waited, its wings opened",
  "something had already been pressed",
  "the shape of a button clicking into place",
  "Every step felt like a page turning",
  "Every page left less of her behind",
  "something red waited without being named",
  "It shone like a choice",
  "someone asking what happened next",
  "since the first page",
  "before the first page",
  "The first press was not beside the lake",
  "before June stepped between the trees",
  "A button was not always red",
  "only a way to begin",
  "the thing that made everyone too late",
  "a small decision was made somewhere outside the yard",
  "something red waited to be touched",
  "There had always been another path",
  "only while nothing was asked of it",
  "The moth did not touch the red place",
  "For the first time, the story waited with it"
];
const ACHIEVEMENT_DEFINITIONS = [
  { id: "whatRemained", title: "What Remained", description: "Reached the first ending." },
  { id: "truth", title: "The Truth", description: "Found what came before." },
  { id: "theButton", title: "The Button", description: "Found the path that required nothing." }
];

const app = document.querySelector("#app");
const notifications = document.querySelector("#notifications");
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const firstFlow = buildFlow(STORY, "first");
const plusFlow = buildFlow(STORY, "plus");
const legacyFlow = plusFlow.filter((entry) => entry.kind !== "prelude");
let state = {
  screen: "title",
  runMode: "first",
  entryIndex: 0,
  buttonPressCount: 0,
  storyStarted: false,
  mainEndingReached: false,
  foundEndingReached: false,
  savedScreen: null,
  savedEndingId: null,
  endingId: null,
  visibleCount: 0,
  isTypingComplete: false,
  isTransitioning: false,
  settingsOpen: false,
  eraseConfirmOpen: false,
  settings: loadSettings(),
  achievements: loadAchievements()
};

let typeTimer = null;
let foundTimer = null;
let achievementToastTimer = null;

hydrateProgress();
render();

notifications.addEventListener("click", () => {
  clearAchievementToast();
  state.settingsOpen = true;
  state.eraseConfirmOpen = false;
  render();
});

window.addEventListener("beforeunload", saveProgress);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function buildFlow(source, runMode) {
  const entries = [];
  let currentChapter = null;

  source.pages.forEach((page) => {
    if (page.plusOnly && runMode !== "plus") {
      return;
    }

    if (page.kind === "prelude") {
      entries.push({ ...page, kind: "prelude" });
      return;
    }

    if (page.chapter !== currentChapter) {
      currentChapter = page.chapter;
      entries.push({
        kind: "chapter",
        id: `chapter_${page.chapter}`,
        chapter: page.chapter,
        title: source.chapters[page.chapter],
        text: `Chapter ${page.chapter}\n${source.chapters[page.chapter]}`
      });
    }

    entries.push({
      kind: "page",
      ...page
    });
  });

  return entries;
}

function getFlow() {
  return state.runMode === "plus" ? plusFlow : firstFlow;
}

function hydrateProgress() {
  const progress = readJson(STORAGE_KEY);

  if (!progress || typeof progress !== "object") {
    return;
  }

  const legacyMainReached = progress.mainEndingReached === true;
  const legacyStoryInProgress = progress.screen === "story" && progress.storyStarted === true;
  state.runMode =
    progress.runMode === "plus" || (!progress.runMode && legacyMainReached && legacyStoryInProgress)
      ? "plus"
      : "first";

  const flow = getFlow();

  const entryIndex = resolveSavedEntryIndex(progress, flow);
  if (Number.isInteger(entryIndex) && entryIndex >= 0 && entryIndex < flow.length) {
    state.entryIndex = entryIndex;
  }

  const buttonPressCount = Number(progress.buttonPressCount);
  if (Number.isInteger(buttonPressCount) && buttonPressCount >= 0) {
    state.buttonPressCount = buttonPressCount;
  }

  state.storyStarted =
    typeof progress.storyStarted === "boolean"
      ? progress.storyStarted
      : state.entryIndex > 0;
  state.mainEndingReached =
    typeof progress.mainEndingReached === "boolean" ? progress.mainEndingReached : false;
  state.foundEndingReached =
    typeof progress.foundEndingReached === "boolean" ? progress.foundEndingReached : false;
  state.savedScreen = progress.screen === "ending" ? "ending" : state.storyStarted ? "story" : null;
  state.savedEndingId =
    progress.endingId === "main" || progress.endingId === "found" || progress.endingId === "truth"
      ? progress.endingId
      : null;

  if (state.savedScreen === "ending" && !state.savedEndingId) {
    state.savedEndingId = state.mainEndingReached ? "main" : state.foundEndingReached ? "found" : null;
  }

  if (state.mainEndingReached && !state.achievements.whatRemained) {
    state.achievements.whatRemained = true;
  }

  if (state.foundEndingReached && !state.achievements.theButton) {
    state.achievements.theButton = true;
  }

  saveAchievements();
}

function resolveSavedEntryIndex(progress, flow) {
  const storedIndex = Number(progress.entryIndex);
  if (!Number.isInteger(storedIndex) || storedIndex < 0) {
    return 0;
  }

  if (progress.runMode === "first" || progress.runMode === "plus") {
    return Math.min(storedIndex, flow.length - 1);
  }

  for (let index = storedIndex; index < legacyFlow.length; index += 1) {
    const migratedIndex = flow.findIndex((entry) => entry.id === legacyFlow[index].id);
    if (migratedIndex >= 0) {
      return migratedIndex;
    }
  }

  return flow.length - 1;
}

function loadSettings() {
  const stored = readJson(SETTINGS_KEY);
  const prefersReducedMotion = reduceMotionQuery.matches;

  if (!stored || typeof stored !== "object") {
    return { reduceMotion: prefersReducedMotion };
  }

  return {
    reduceMotion:
      typeof stored.reduceMotion === "boolean" ? stored.reduceMotion : prefersReducedMotion
  };
}

function loadAchievements() {
  const stored = readJson(ACHIEVEMENTS_KEY);

  return {
    whatRemained: stored?.whatRemained === true,
    truth: stored?.truth === true,
    theButton: stored?.theButton === true
  };
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private modes; the current session still works.
  }
}

function saveProgress() {
  writeJson(STORAGE_KEY, {
    runMode: state.runMode,
    entryIndex: state.entryIndex,
    buttonPressCount: state.buttonPressCount,
    storyStarted: state.storyStarted,
    mainEndingReached: state.mainEndingReached,
    foundEndingReached: state.foundEndingReached,
    screen: state.savedScreen,
    endingId: state.savedEndingId
  });
}

function saveSettings() {
  writeJson(SETTINGS_KEY, state.settings);
}

function saveAchievements() {
  writeJson(ACHIEVEMENTS_KEY, state.achievements);
}

function unlockAchievement(id) {
  if (state.achievements[id]) {
    return false;
  }

  state.achievements[id] = true;
  saveAchievements();
  return true;
}

function resetStory() {
  clearAchievementToast();
  clearSavedProgress();

  state = {
    ...state,
    screen: "title",
    runMode: "first",
    entryIndex: 0,
    buttonPressCount: 0,
    storyStarted: false,
    mainEndingReached: false,
    foundEndingReached: false,
    savedScreen: null,
    savedEndingId: null,
    endingId: null,
    visibleCount: 0,
    isTypingComplete: false,
    isTransitioning: false,
    settingsOpen: false,
    eraseConfirmOpen: false
  };
  render();
}

function eraseAllData() {
  clearTypeTimer();
  clearHiddenTimer();
  clearAchievementToast();

  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(ACHIEVEMENTS_KEY);
  } catch {
    // Reset the current session even when persistent storage is unavailable.
  }

  state = {
    ...state,
    screen: "title",
    runMode: "first",
    entryIndex: 0,
    buttonPressCount: 0,
    storyStarted: false,
    mainEndingReached: false,
    foundEndingReached: false,
    savedScreen: null,
    savedEndingId: null,
    endingId: null,
    visibleCount: 0,
    isTypingComplete: false,
    isTransitioning: false,
    settingsOpen: false,
    eraseConfirmOpen: false,
    settings: { reduceMotion: reduceMotionQuery.matches },
    achievements: {
      whatRemained: false,
      truth: false,
      theButton: false
    }
  };
  render();
}

function clearSavedProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failure and reset in memory.
  }
}

function beginStory() {
  clearHiddenTimer();
  state.runMode = "first";
  state.entryIndex = 0;
  state.screen = "story";
  state.storyStarted = true;
  state.savedScreen = "story";
  state.savedEndingId = null;
  state.endingId = null;
  state.visibleCount = 0;
  state.isTypingComplete = false;
  saveProgress();
  render();
}

function continueStory() {
  clearHiddenTimer();

  if (state.savedScreen === "ending") {
    state.screen = "ending";
    state.endingId =
      state.savedEndingId || (state.mainEndingReached ? "main" : state.foundEndingReached ? "found" : null);

    if (!state.endingId) {
      state.screen = "story";
    }
  } else {
    state.screen = "story";
    state.endingId = null;
  }

  state.storyStarted =
    state.storyStarted || state.screen === "story" || state.endingId === "main" || state.endingId === "truth";
  state.visibleCount = 0;
  state.isTypingComplete = false;
  saveProgress();
  render();
}

function startOver() {
  clearHiddenTimer();
  clearSavedProgress();
  const hasReachedMainEnding = state.mainEndingReached;
  const hasReachedFoundEnding = state.foundEndingReached;

  state.screen = "story";
  state.entryIndex = 0;
  state.buttonPressCount = 0;
  state.storyStarted = true;
  state.mainEndingReached = hasReachedMainEnding;
  state.foundEndingReached = hasReachedFoundEnding;
  state.savedScreen = "story";
  state.savedEndingId = null;
  state.endingId = null;
  state.visibleCount = 0;
  state.isTypingComplete = false;
  state.isTransitioning = false;
  state.settingsOpen = false;
  saveProgress();
  render();
}

function beginPlusStory() {
  clearHiddenTimer();
  clearSavedProgress();
  state.screen = "story";
  state.runMode = "plus";
  state.entryIndex = 0;
  state.buttonPressCount = 0;
  state.storyStarted = true;
  state.mainEndingReached = true;
  state.foundEndingReached = false;
  state.savedScreen = "story";
  state.savedEndingId = null;
  state.endingId = null;
  state.visibleCount = 0;
  state.isTypingComplete = false;
  state.isTransitioning = false;
  state.settingsOpen = false;
  saveProgress();
  render();
}

function showEnding(endingId) {
  clearHiddenTimer();
  state.screen = "ending";
  state.endingId = endingId;
  state.savedScreen = "ending";
  state.savedEndingId = endingId;
  state.storyStarted = state.storyStarted || endingId === "main" || endingId === "truth";
  state.mainEndingReached = state.mainEndingReached || endingId === "main";
  state.foundEndingReached = state.foundEndingReached || endingId === "found";

  const achievementId =
    endingId === "main" ? "whatRemained" : endingId === "truth" ? "truth" : "theButton";
  const achievementUnlocked = unlockAchievement(achievementId);
  state.visibleCount = 0;
  state.isTypingComplete = false;
  saveProgress();
  render();

  if (achievementUnlocked) {
    showAchievementToast(achievementId);
  }
}

function completeCurrentText() {
  const text = getActiveText();
  state.visibleCount = text.length;
  state.isTypingComplete = true;
  clearTypeTimer();
  render();
}

function nextPage() {
  if (!state.isTypingComplete || state.isTransitioning) {
    return;
  }

  state.buttonPressCount += 1;
  const flow = getFlow();

  if (state.entryIndex >= flow.length - 1) {
    showEnding(state.runMode === "plus" ? "truth" : "main");
    return;
  }

  state.isTransitioning = true;
  render();

  window.setTimeout(() => {
    state.entryIndex += 1;
    state.savedScreen = "story";
    state.savedEndingId = null;
    state.visibleCount = 0;
    state.isTypingComplete = false;
    state.isTransitioning = false;
    saveProgress();
    render();
  }, state.settings.reduceMotion ? 0 : TRANSITION_MS);
}

function returnToTitle() {
  if (!state.isTypingComplete) {
    completeCurrentText();
    return;
  }

  if (state.endingId === "truth") {
    resetStory();
    return;
  }

  state.screen = "title";
  state.visibleCount = 0;
  state.isTypingComplete = false;
  saveProgress();
  render();
}

function getActiveText() {
  if (state.screen === "ending") {
    return STORY.endings[state.endingId].text;
  }

  if (state.screen === "story") {
    return getEntryText(getFlow()[state.entryIndex]);
  }

  return "";
}

function getEntryText(entry) {
  if (state.runMode === "plus" && entry.replayText) {
    return entry.replayText;
  }

  return entry.text;
}

function shouldHighlightActiveText() {
  return state.runMode === "plus" && (state.screen === "story" || state.endingId === "truth");
}

function clearTypeTimer() {
  if (typeTimer) {
    window.clearInterval(typeTimer);
    typeTimer = null;
  }
}

function clearHiddenTimer() {
  if (foundTimer) {
    window.clearTimeout(foundTimer);
    foundTimer = null;
  }
}

function clearAchievementToast() {
  if (achievementToastTimer) {
    window.clearTimeout(achievementToastTimer);
    achievementToastTimer = null;
  }

  notifications.innerHTML = "";
}

function showAchievementToast(id) {
  const achievement = ACHIEVEMENT_DEFINITIONS.find((item) => item.id === id);
  if (!achievement) {
    return;
  }

  clearAchievementToast();
  notifications.innerHTML = `
    <button class="achievement-toast" type="button" aria-label="Achievement unlocked: ${escapeHtml(achievement.title)}. Open Settings.">
      <span class="achievement-toast-mark" aria-hidden="true"></span>
      <span class="achievement-toast-copy">
        <small>Achievement unlocked</small>
        <strong>${escapeHtml(achievement.title)}</strong>
        <span>View in Settings</span>
      </span>
    </button>
  `;

  achievementToastTimer = window.setTimeout(clearAchievementToast, 4400);
}

function startTypewriter(text) {
  clearTypeTimer();

  if (state.settings.reduceMotion) {
    state.visibleCount = text.length;
    state.isTypingComplete = true;
    return;
  }

  if (state.visibleCount >= text.length) {
    state.isTypingComplete = true;
    return;
  }

  typeTimer = window.setInterval(() => {
    state.visibleCount += 1;
    if (state.visibleCount >= text.length) {
      state.visibleCount = text.length;
      state.isTypingComplete = true;
      clearTypeTimer();
    }
    paintTypewriterText();
    updateAdvanceState();
  }, TYPE_SPEED_MS);
}

function startHiddenTimer() {
  clearHiddenTimer();

  if (!canTriggerFoundEndingFromTitle()) {
    return;
  }

  foundTimer = window.setTimeout(() => {
    if (canTriggerFoundEndingFromTitle()) {
      showEnding("found");
    }
  }, FOUND_ENDING_WAIT_SECONDS * 1000);
}

function canTriggerFoundEndingFromTitle() {
  return (
    state.screen === "title" &&
    !state.storyStarted &&
    !state.mainEndingReached &&
    !state.foundEndingReached &&
    !state.savedScreen &&
    !state.savedEndingId &&
    state.entryIndex === 0
  );
}

function render() {
  clearTypeTimer();

  if (state.screen !== "title") {
    clearHiddenTimer();
  }

  if (state.screen === "title") {
    renderTitle();
    startHiddenTimer();
    return;
  }

  if (state.screen === "story") {
    const flow = getFlow();
    renderStory();
    startTypewriter(getEntryText(flow[state.entryIndex]));
    paintTypewriterText();
    updateAdvanceState();
    return;
  }

  renderEnding();
  startTypewriter(STORY.endings[state.endingId].text);
  paintTypewriterText();
  updateAdvanceState();
}

function renderTitle() {
  const hasProgress = hasSavedProgress();
  const showReplayBegin =
    state.achievements.whatRemained && state.savedScreen === "ending" && state.savedEndingId === "main";
  app.className = "app-shell title-mode";
  app.innerHTML = `
    <main class="title-screen">
      <button class="settings-button" type="button" data-action="settings">Settings</button>
      <section class="title-lockup" aria-labelledby="title-heading">
        <p class="kicker">BY xCoffeeTommyx</p>
        <h1 id="title-heading">THE BUTTON</h1>
        ${
          showReplayBegin
            ? `<button class="begin-button" type="button" data-action="begin-plus">Begin +</button>`
            : hasProgress
            ? `<div class="title-actions">
                <button class="begin-button" type="button" data-action="continue">Continue</button>
                <button class="start-over-button" type="button" data-action="start-over">Start Over</button>
              </div>`
            : `<button class="begin-button" type="button" data-action="begin">Begin</button>`
        }
        ${hasProgress && !showReplayBegin ? `<p class="resume-note">${getProgressLabel()}</p>` : ""}
      </section>
    </main>
    ${renderSettings()}
  `;
  bindCommonActions();
}

function hasSavedProgress() {
  return (
    state.storyStarted ||
    state.savedScreen === "ending" ||
    state.entryIndex > 0
  );
}

function getProgressLabel() {
  if (state.savedScreen === "ending") {
    const endingId = state.savedEndingId || (state.mainEndingReached ? "main" : "found");
    return STORY.endings[endingId]?.title || "Ending reached";
  }

  const entry = getFlow()[state.entryIndex];
  return entry?.kind === "prelude" ? "Before" : `Chapter ${entry?.chapter || 1}`;
}

function renderStory() {
  const flow = getFlow();
  const entry = flow[state.entryIndex];
  const progress = Math.round(((state.entryIndex + 1) / flow.length) * 100);
  const chapterName = STORY.chapters[entry.chapter];
  const title = entry.title;
  const cardClass =
    entry.kind === "prelude"
      ? "chapter-card prelude-card"
      : entry.kind === "chapter"
        ? "chapter-card"
        : "page-card";
  const eyebrow =
    entry.kind === "prelude"
      ? "Begin +"
      : entry.kind === "chapter"
        ? `Chapter ${entry.chapter}`
        : `Chapter ${entry.chapter} / ${chapterName}`;

  app.className = `app-shell reader-mode ${state.isTransitioning ? "turning" : ""}`;
  app.innerHTML = `
    <main class="reader-screen">
      <header class="reader-top">
        <button class="settings-button compact" type="button" data-action="settings">Settings</button>
        <div class="progress-wrap" aria-label="Reading progress">
          <span class="progress-bar"><span style="width: ${progress}%"></span></span>
          <span class="progress-count">${state.entryIndex + 1}/${flow.length}</span>
        </div>
      </header>
      <article class="${cardClass}" aria-labelledby="page-title">
        <p class="chapter-eyebrow">${eyebrow}</p>
        <h2 id="page-title">${escapeHtml(title)}</h2>
        <button class="text-surface" type="button" data-action="complete" aria-label="Complete current page">
          <p id="typewriter-text"></p>
        </button>
      </article>
      <footer class="reader-footer">
        <button class="next-button" type="button" data-action="next">Next Page</button>
      </footer>
    </main>
    ${renderSettings()}
  `;
  bindCommonActions();
}

function renderEnding() {
  const ending = STORY.endings[state.endingId];
  app.className = "app-shell ending-mode";
  app.innerHTML = `
    <main class="ending-screen">
      <section class="ending-copy" aria-labelledby="ending-title">
        <p class="kicker">Ending</p>
        <h1 id="ending-title">${escapeHtml(ending.title)}</h1>
        <button class="text-surface ending-text" type="button" data-action="complete" aria-label="Complete ending">
          <p id="typewriter-text"></p>
        </button>
      </section>
      <footer class="reader-footer">
        <button class="next-button" type="button" data-action="return">Return</button>
      </footer>
    </main>
    ${renderSettings()}
  `;
  bindCommonActions();
}

function renderSettings() {
  if (!state.settingsOpen) {
    return "";
  }

  return `
    <div class="modal-backdrop" role="presentation">
      <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button class="close-button" type="button" data-action="close-settings" aria-label="Close settings">Close</button>
        </header>
        <label class="toggle-row">
          <span>Reduced motion</span>
          <input type="checkbox" data-action="toggle-motion" ${state.settings.reduceMotion ? "checked" : ""} />
        </label>
        ${renderAchievements()}
        <p class="content-note">Content note: childhood loneliness and emotional distress.</p>
        <button class="reset-button" type="button" data-action="reset">Reset Story</button>
        ${
          state.eraseConfirmOpen
            ? `<section class="erase-confirm" aria-labelledby="erase-title">
                <h3 id="erase-title">Erase all data?</h3>
                <p>This removes saved progress, settings, and every achievement.</p>
                <div class="erase-actions">
                  <button class="cancel-erase-button" type="button" data-action="cancel-erase">Cancel</button>
                  <button class="confirm-erase-button" type="button" data-action="confirm-erase">Erase Everything</button>
                </div>
              </section>`
            : `<button class="erase-all-button" type="button" data-action="erase-all">Erase All Data</button>`
        }
      </section>
    </div>
  `;
}

function renderAchievements() {
  const unlockedCount = ACHIEVEMENT_DEFINITIONS.filter(
    (achievement) => state.achievements[achievement.id]
  ).length;

  return `
    <section class="achievements" aria-labelledby="achievements-title">
      <header class="achievements-header">
        <h3 id="achievements-title">Achievements</h3>
        <span>${unlockedCount}/${ACHIEVEMENT_DEFINITIONS.length}</span>
      </header>
      <ol class="achievement-list">
        ${ACHIEVEMENT_DEFINITIONS.map((achievement, index) => {
          const unlocked = state.achievements[achievement.id];
          return `
            <li class="achievement ${unlocked ? "unlocked" : "locked"}">
              <span class="achievement-mark" aria-hidden="true"></span>
              <span class="achievement-copy">
                <strong>${unlocked ? escapeHtml(achievement.title) : "???"}</strong>
                ${unlocked ? `<small>${escapeHtml(achievement.description)}</small>` : ""}
              </span>
              <span class="achievement-number">0${index + 1}</span>
            </li>
          `;
        }).join("")}
      </ol>
    </section>
  `;
}

function bindCommonActions() {
  app.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", handleAction);
  });
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;

  if (action === "settings") {
    state.settingsOpen = true;
    state.eraseConfirmOpen = false;
    render();
    return;
  }

  if (action === "close-settings") {
    state.settingsOpen = false;
    state.eraseConfirmOpen = false;
    render();
    return;
  }

  if (action === "toggle-motion") {
    state.settings.reduceMotion = event.currentTarget.checked;
    saveSettings();
    render();
    return;
  }

  if (action === "reset") {
    resetStory();
    return;
  }

  if (action === "erase-all") {
    state.eraseConfirmOpen = true;
    render();
    return;
  }

  if (action === "cancel-erase") {
    state.eraseConfirmOpen = false;
    render();
    return;
  }

  if (action === "confirm-erase") {
    eraseAllData();
    return;
  }

  if (state.settingsOpen) {
    return;
  }

  if (action === "begin") {
    beginStory();
    return;
  }

  if (action === "begin-plus") {
    beginPlusStory();
    return;
  }

  if (action === "continue") {
    continueStory();
    return;
  }

  if (action === "start-over") {
    startOver();
    return;
  }

  if (action === "complete") {
    completeCurrentText();
    return;
  }

  if (action === "next") {
    nextPage();
    return;
  }

  if (action === "return") {
    returnToTitle();
  }
}

function paintTypewriterText() {
  const target = app.querySelector("#typewriter-text");
  if (!target) {
    return;
  }

  const visibleText = getActiveText().slice(0, state.visibleCount);
  if (shouldHighlightActiveText()) {
    target.innerHTML = renderHighlightedReplayText(visibleText);
    return;
  }

  target.textContent = visibleText;
}

function renderHighlightedReplayText(text) {
  let cursor = 0;
  let html = "";

  REPLAY_HIGHLIGHT_PHRASES.forEach((phrase) => {
    const index = text.indexOf(phrase, cursor);
    if (index === -1) {
      return;
    }

    html += escapeHtml(text.slice(cursor, index));
    html += `<span class="story-hint">${escapeHtml(phrase)}</span>`;
    cursor = index + phrase.length;
  });

  html += escapeHtml(text.slice(cursor));
  return html;
}

function updateAdvanceState() {
  const nextButton = app.querySelector(".next-button");
  if (nextButton) {
    nextButton.disabled = !state.isTypingComplete;
    nextButton.setAttribute("aria-disabled", String(!state.isTypingComplete));
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
