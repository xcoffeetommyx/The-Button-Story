const FOUND_ENDING_WAIT_SECONDS = 60;

const STORY = window.BUTTON_STORY;
const STORAGE_KEY = "the-button-story:progress:v1";
const SETTINGS_KEY = "the-button-story:settings:v1";
const TYPE_SPEED_MS = 18;
const TRANSITION_MS = 180;
const REPLAY_HIGHLIGHT_PHRASES = [
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
  "the thing that made everyone too late"
];

const app = document.querySelector("#app");
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const flow = buildFlow(STORY);
let state = {
  screen: "title",
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
  settings: loadSettings()
};

let typeTimer = null;
let foundTimer = null;

hydrateProgress();
render();

window.addEventListener("beforeunload", saveProgress);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function buildFlow(source) {
  const entries = [];
  let currentChapter = null;

  source.pages.forEach((page) => {
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

function hydrateProgress() {
  const progress = readJson(STORAGE_KEY);

  if (!progress || typeof progress !== "object") {
    return;
  }

  const entryIndex = Number(progress.entryIndex);
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
    progress.endingId === "main" || progress.endingId === "found" ? progress.endingId : null;

  if (state.savedScreen === "ending" && !state.savedEndingId) {
    state.savedEndingId = state.mainEndingReached ? "main" : state.foundEndingReached ? "found" : null;
  }
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

function resetStory() {
  clearSavedProgress();

  state = {
    ...state,
    screen: "title",
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
    settingsOpen: false
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

  state.storyStarted = state.storyStarted || state.screen === "story" || state.endingId === "main";
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

function showEnding(endingId) {
  clearHiddenTimer();
  state.screen = "ending";
  state.endingId = endingId;
  state.savedScreen = "ending";
  state.savedEndingId = endingId;
  state.storyStarted = state.storyStarted || endingId === "main";
  state.mainEndingReached = state.mainEndingReached || endingId === "main";
  state.foundEndingReached = state.foundEndingReached || endingId === "found";
  state.visibleCount = 0;
  state.isTypingComplete = false;
  saveProgress();
  render();
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

  if (state.entryIndex >= flow.length - 1) {
    showEnding("main");
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
    return getEntryText(flow[state.entryIndex]);
  }

  return "";
}

function getEntryText(entry) {
  if (state.mainEndingReached && entry.replayText) {
    return entry.replayText;
  }

  return entry.text;
}

function shouldHighlightActiveText() {
  const entry = flow[state.entryIndex];
  return state.screen === "story" && state.mainEndingReached && Boolean(entry?.replayText);
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
  const showReplayBegin = state.mainEndingReached && (!hasProgress || state.savedScreen === "ending");
  app.className = "app-shell title-mode";
  app.innerHTML = `
    <main class="title-screen">
      <button class="settings-button" type="button" data-action="settings">Settings</button>
      <section class="title-lockup" aria-labelledby="title-heading">
        <p class="kicker">BY xCoffeeTommyx</p>
        <h1 id="title-heading">THE BUTTON</h1>
        ${
          showReplayBegin
            ? `<button class="begin-button" type="button" data-action="start-over">Begin +</button>`
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

  return `Chapter ${flow[state.entryIndex].chapter || 1}`;
}

function renderStory() {
  const entry = flow[state.entryIndex];
  const progress = Math.round(((state.entryIndex + 1) / flow.length) * 100);
  const chapterName = STORY.chapters[entry.chapter];
  const isChapter = entry.kind === "chapter";
  const title = isChapter ? entry.title : entry.title;
  const eyebrow = isChapter ? `Chapter ${entry.chapter}` : `Chapter ${entry.chapter} / ${chapterName}`;

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
      <article class="${isChapter ? "chapter-card" : "page-card"}" aria-labelledby="page-title">
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
        <p class="content-note">Content note: childhood loneliness and emotional distress.</p>
        <button class="reset-button" type="button" data-action="reset">Reset Story</button>
      </section>
    </div>
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
    render();
    return;
  }

  if (action === "close-settings") {
    state.settingsOpen = false;
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

  if (state.settingsOpen) {
    return;
  }

  if (action === "begin") {
    beginStory();
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
