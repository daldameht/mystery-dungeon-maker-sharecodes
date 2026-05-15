const OWNER_MODE_STORAGE_KEY = "mysteryDungeonMaker.shareSite.ownerMode.v1";
const OWNER_DRAFT_STORAGE_KEY = "mysteryDungeonMaker.shareSite.ownerDrafts.v1";

const shareCodeInput = document.querySelector("#shareCodeInput");
const packageInput = document.querySelector("#packageInput");
const publishShareCodeButton = document.querySelector("#publishShareCodeButton");
const publishPackageButton = document.querySelector("#publishPackageButton");
const hostedCount = document.querySelector("#hostedCount");
const hostedList = document.querySelector("#hostedList");
const hostingStatus = document.querySelector("#hostingStatus");
const ownerLockButton = document.querySelector("#ownerLockButton");
const publishPanel = document.querySelector("#publishPanel");
const ownerTools = document.querySelector("#ownerTools");
const sharingLayout = document.querySelector("#sharingLayout");
const copyHostedDataButton = document.querySelector("#copyHostedDataButton");
const downloadHostedDataButton = document.querySelector("#downloadHostedDataButton");
const clearDraftsButton = document.querySelector("#clearDraftsButton");

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function hashString(value) {
  let hash = 0;
  const source = String(value ?? "");
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeCustomEnvironment(entry = {}) {
  return {
    id: String(entry?.id ?? `custom_${hashString(JSON.stringify(entry)).toString(36)}`),
    name: String(entry?.name ?? "Custom Environment").trim().slice(0, 40) || "Custom Environment",
    floorImage: typeof entry?.floorImage === "string" ? entry.floorImage : "",
    backgroundImage: typeof entry?.backgroundImage === "string" ? entry.backgroundImage : "",
  };
}

function normalizeCustomEnvironmentLibrary(library = undefined, legacyCustomEnvironment = undefined) {
  const incoming = Array.isArray(library) ? library : [];
  const normalized = incoming
    .map((entry) => normalizeCustomEnvironment(entry))
    .filter((entry, index, array) => array.findIndex((other) => other.id === entry.id) === index);
  if (normalized.length === 0 && legacyCustomEnvironment && (legacyCustomEnvironment.name || legacyCustomEnvironment.floorImage || legacyCustomEnvironment.backgroundImage)) {
    normalized.push(normalizeCustomEnvironment({
      id: "legacy_custom_environment",
      ...legacyCustomEnvironment,
    }));
  }
  return normalized;
}

function normalizeStartingStats(recipe = {}) {
  const stats = recipe?.startingStats ?? recipe ?? {};
  return {
    hp: clampNumber(stats.hp, 1, 999, 20),
    attack: clampNumber(stats.attack, -99, 999, 2),
    defense: clampNumber(stats.defense, -99, 999, 1),
    accuracy: clampNumber(stats.accuracy, 0, 100, 100),
    gold: clampNumber(stats.gold, -99999, 99999, 0),
  };
}

function normalizeStartingEntry(entry, fallbackItemId = null) {
  if (typeof entry === "string") {
    return { itemId: entry || fallbackItemId, rarity: "common", cursed: false };
  }
  return {
    itemId: entry?.itemId ?? fallbackItemId ?? null,
    rarity: typeof entry?.rarity === "string" ? entry.rarity : "common",
    cursed: Boolean(entry?.cursed),
  };
}

function normalizeStartingEquipment(recipe = {}) {
  const startingEquipment = recipe?.startingEquipment ?? {};
  return {
    leftHand: normalizeStartingEntry(startingEquipment.leftHand, recipe?.startingItem ?? null),
    rightHand: normalizeStartingEntry(startingEquipment.rightHand),
    bracelet1: normalizeStartingEntry(startingEquipment.bracelet1),
    bracelet2: normalizeStartingEntry(startingEquipment.bracelet2),
  };
}

function normalizeStartingInventory(recipe = {}) {
  return Array.isArray(recipe?.startingInventory)
    ? recipe.startingInventory.map((entry) => normalizeStartingEntry(entry)).filter((entry) => entry.itemId)
    : [];
}

function normalizeCustomGoal(goal = {}) {
  const type = ["escape", "kill", "obtain", "gold"].includes(goal?.type) ? goal.type : "obtain";
  return {
    type,
    count: clampNumber(goal?.count, 1, 9999, type === "gold" ? 500 : 1),
    target: String(goal?.target ?? (type === "kill" ? "any_monster" : "")),
    needExit: goal?.needExit === true,
  };
}

function normalizeRecipeData(recipe = {}) {
  const customEnvironmentLibrary = normalizeCustomEnvironmentLibrary(recipe?.customEnvironmentLibrary, recipe?.customEnvironment);
  return {
    name: String(recipe?.name ?? "Unnamed Dungeon").trim() || "Unnamed Dungeon",
    description: String(recipe?.description ?? "").trim().slice(0, 240),
    floors: clampNumber(recipe?.floors, 1, 99, 8),
    roomCount: clampNumber(recipe?.roomCount, 1, 20, 7),
    monsterRate: clampNumber(recipe?.monsterRate, 0, 18, 8),
    monsterRespawnRate: clampNumber(recipe?.monsterRespawnRate, 0, 10, 3),
    trapRate: clampNumber(recipe?.trapRate, 0, 12, 4),
    blessedRate: clampNumber(recipe?.blessedRate, 0, 100, 12),
    startingStats: normalizeStartingStats(recipe),
    startingEquipment: normalizeStartingEquipment(recipe),
    startingInventory: normalizeStartingInventory(recipe),
    customEnvironmentLibrary,
    customEnvironment: customEnvironmentLibrary[0] ?? normalizeCustomEnvironment(recipe?.customEnvironment),
    soundPackMode: String(recipe?.soundPackMode ?? "default").toLowerCase() === "custom" ? "custom" : "default",
    soundEffectRules: Array.isArray(recipe?.soundEffectRules) ? recipe.soundEffectRules : [],
    customGoal: normalizeCustomGoal(recipe?.customGoal ?? {}),
  };
}

function getGoalTargetLabel(goal) {
  const normalized = normalizeCustomGoal(goal);
  if (normalized.type === "escape") {
    return "Escape the dungeon through the final exit.";
  }
  if (normalized.type === "gold") {
    return `Earn ${normalized.count} gold${normalized.needExit ? ", then reach the final exit." : "."}`;
  }
  if (normalized.type === "kill") {
    const targetLabel = normalized.target === "any_monster"
      ? `${normalized.count} monster${normalized.count === 1 ? "" : "s"}`
      : `${normalized.count} ${normalized.target}`;
    return `Goal: Defeat ${targetLabel}${normalized.needExit ? ", then reach the final exit." : "."}`;
  }
  const targetLabel = normalized.target || "item";
  return `Goal: Obtain ${normalized.count} ${targetLabel}${normalized.count === 1 ? "" : "s"}${normalized.needExit ? ", then reach the final exit." : "."}`;
}

function sanitizeRecipeForShare(recipe) {
  const clone = JSON.parse(JSON.stringify(normalizeRecipeData(recipe)));
  if (Array.isArray(clone.customEnvironmentLibrary)) {
    clone.customEnvironmentLibrary = clone.customEnvironmentLibrary.map((entry) => ({
      ...entry,
      floorImage: "",
      backgroundImage: "",
    }));
  }
  if (clone.customEnvironment) {
    clone.customEnvironment.floorImage = "";
    clone.customEnvironment.backgroundImage = "";
  }
  if (Array.isArray(clone.soundEffectRules)) {
    clone.soundEffectRules = clone.soundEffectRules.map((rule) => ({
      ...rule,
      fileName: "",
      audioData: "",
    }));
  }
  return clone;
}

function encodeRecipe(recipe) {
  return btoa(JSON.stringify(sanitizeRecipeForShare(recipe)));
}

function decodeRecipe(code) {
  return normalizeRecipeData(JSON.parse(atob(String(code).trim())));
}

function getDifficultyLabel(recipe) {
  const normalized = normalizeRecipeData(recipe);
  const startingStats = normalized.startingStats;
  const startingEquipment = normalized.startingEquipment;
  const startingInventory = normalized.startingInventory;
  const startingGearCount = Object.values(startingEquipment).filter((entry) => entry?.itemId).length + startingInventory.filter((entry) => entry?.itemId).length;
  const positiveAttack = Math.max(0, Number(startingStats.attack) || 0);
  const positiveDefense = Math.max(0, Number(startingStats.defense) || 0);
  const positiveGold = Math.max(0, Number(startingStats.gold) || 0);
  const extraHp = Math.max(0, (Number(startingStats.hp) || 0) - 20);
  const extraAccuracy = Math.max(0, (Number(startingStats.accuracy) || 0) - 100);
  const dangerScore =
    normalized.monsterRate * 1.6
    + normalized.monsterRespawnRate * 1.15
    + normalized.trapRate * 1.35
    + normalized.floors * 0.8
    + normalized.roomCount * 0.45;
  const supportScore =
    startingGearCount * 1.5
    + normalized.blessedRate * 0.08
    + extraHp * 0.25
    + positiveAttack * 1.6
    + positiveDefense * 1.5
    + extraAccuracy * 0.04
    + positiveGold * 0.015;
  const ratingScore = dangerScore - supportScore;
  if (ratingScore >= 36) {
    return "Brutal";
  }
  if (ratingScore >= 25) {
    return "Hard";
  }
  if (ratingScore >= 14) {
    return "Normal";
  }
  return "Cozy";
}

function hasCustomAssets(recipe = {}, packageMetadata = null) {
  if (packageMetadata?.includesCustomEnvironmentArt || packageMetadata?.includesCustomSounds) {
    return true;
  }
  const normalized = normalizeRecipeData(recipe);
  const hasCustomEnvironmentArt = normalized.customEnvironmentLibrary.some((entry) => entry.floorImage || entry.backgroundImage);
  const hasCustomSounds = normalized.soundPackMode === "custom"
    && normalized.soundEffectRules.some((rule) => rule?.audioData);
  return hasCustomEnvironmentArt || hasCustomSounds;
}

function normalizeHostedDungeon(entry = {}) {
  const recipe = normalizeRecipeData(entry.recipe ?? {});
  const createdAt = entry.createdAt || new Date().toISOString();
  const packageMetadata = entry.packageMetadata ?? null;
  const includesCustomAssets = hasCustomAssets(recipe, packageMetadata) || Boolean(entry.packageText);
  return {
    id: String(entry.id ?? `hosted_${hashString(`${recipe.name}-${createdAt}`).toString(36)}`),
    recipe,
    name: recipe.name,
    description: recipe.description,
    floors: recipe.floors,
    difficulty: getDifficultyLabel(recipe),
    createdAt,
    shareCode: typeof entry.shareCode === "string" && entry.shareCode ? entry.shareCode : encodeRecipe(recipe),
    includesCustomAssets,
    packageFileName: typeof entry.packageFileName === "string" ? entry.packageFileName : `${recipe.name || "dungeon"}.mdmpkg`,
    packageText: includesCustomAssets && typeof entry.packageText === "string" ? entry.packageText : "",
    packageMetadata,
    goalText: getGoalTargetLabel(recipe.customGoal),
  };
}

function getBuiltInHostedDungeons() {
  return Array.isArray(window.HOSTED_DUNGEONS)
    ? window.HOSTED_DUNGEONS.map((entry) => normalizeHostedDungeon(entry))
    : [];
}

function loadOwnerDrafts() {
  try {
    const raw = localStorage.getItem(OWNER_DRAFT_STORAGE_KEY);
    const payload = raw ? JSON.parse(raw) : [];
    return Array.isArray(payload) ? payload.map((entry) => normalizeHostedDungeon(entry)) : [];
  } catch {
    return [];
  }
}

function saveOwnerDrafts(dungeons) {
  localStorage.setItem(OWNER_DRAFT_STORAGE_KEY, JSON.stringify(dungeons.map((entry) => normalizeHostedDungeon(entry))));
}

function isOwnerMode() {
  return localStorage.getItem(OWNER_MODE_STORAGE_KEY) === "true";
}

function loadAllHostedDungeons() {
  const base = getBuiltInHostedDungeons();
  if (!isOwnerMode()) {
    return base;
  }
  const drafts = loadOwnerDrafts();
  const merged = [...drafts, ...base];
  return merged.filter((entry, index, array) => array.findIndex((other) => other.id === entry.id) === index);
}

function setOwnerMode(enabled) {
  if (enabled) {
    localStorage.setItem(OWNER_MODE_STORAGE_KEY, "true");
  } else {
    localStorage.removeItem(OWNER_MODE_STORAGE_KEY);
  }
}

function applyOwnerModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("owner") === "1") {
    setOwnerMode(true);
  }
  if (params.get("owner") === "0") {
    setOwnerMode(false);
  }
}

function updateOwnerModeUi() {
  const owner = isOwnerMode();
  if (publishPanel) {
    publishPanel.hidden = !owner;
  }
  if (ownerTools) {
    ownerTools.hidden = !owner;
  }
  if (ownerLockButton) {
    ownerLockButton.hidden = !owner;
  }
  if (sharingLayout) {
    sharingLayout.classList.toggle("sharing-layout-public", !owner);
  }
  renderHostedDungeons(loadAllHostedDungeons());
}

function setStatus(message = "", type = "") {
  hostingStatus.textContent = message;
  hostingStatus.className = `status-line${type ? ` ${type}` : ""}`;
}

function formatPublishedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleDateString();
}

function renderHostedDungeons(dungeons = []) {
  if (hostedCount) {
    hostedCount.textContent = `${dungeons.length} hosted`;
  }
  hostedList.innerHTML = "";
  if (dungeons.length === 0) {
    hostedList.innerHTML = `<p class="empty-state">No hosted dungeons yet.</p>`;
    return;
  }
  dungeons
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .forEach((dungeon) => {
      const card = document.createElement("article");
      card.className = "dungeon-card";
      const badges = dungeon.includesCustomAssets
        ? `<div class="dungeon-card-badges"><span class="dungeon-card-badge">Full Package</span></div>`
        : "";
      const description = dungeon.description
        ? `<p>${escapeHtml(dungeon.description)}</p>`
        : "";
      const goal = dungeon.goalText
        ? `<p>${escapeHtml(dungeon.goalText)}</p>`
        : "";
      const primaryButton = dungeon.includesCustomAssets
        ? `<button type="button" data-action="download-package" data-id="${escapeHtml(dungeon.id)}">Download Full Package</button>`
        : `<button type="button" data-action="copy-share-code" data-id="${escapeHtml(dungeon.id)}">Copy Share Code</button>`;
      const ownerButton = isOwnerMode()
        ? `<button type="button" data-action="remove-hosted" data-id="${escapeHtml(dungeon.id)}">Remove Listing</button>`
        : "";
      card.innerHTML = `
        <strong>${escapeHtml(dungeon.name)}</strong>
        <p class="dungeon-card-meta">${dungeon.floors} floor${dungeon.floors === 1 ? "" : "s"} | ${escapeHtml(dungeon.difficulty)} | Published ${escapeHtml(formatPublishedDate(dungeon.createdAt))}</p>
        ${badges}
        ${description}
        ${goal}
        <div class="item-actions">
          ${primaryButton}
          ${ownerButton}
        </div>
      `;
      hostedList.append(card);
    });
}

async function publishShareCode() {
  const code = shareCodeInput?.value.trim();
  if (!code) {
    setStatus("Paste a share code first.", "error");
    return;
  }
  try {
    const recipe = decodeRecipe(code);
    const drafts = loadOwnerDrafts();
    drafts.unshift(normalizeHostedDungeon({
      id: `hosted_${Date.now().toString(36)}`,
      recipe,
      shareCode: code,
      createdAt: new Date().toISOString(),
    }));
    saveOwnerDrafts(drafts);
    shareCodeInput.value = "";
    renderHostedDungeons(loadAllHostedDungeons());
    setStatus(`Added "${recipe.name}" to your local owner drafts. Export the listing file when you're ready.`);
  } catch {
    setStatus("That share code could not be added.", "error");
  }
}

async function publishFullPackage() {
  const file = packageInput?.files?.[0];
  if (!file) {
    setStatus("Choose a full package file first.", "error");
    return;
  }
  try {
    const packageText = await file.text();
    const payload = JSON.parse(packageText);
    const recipe = normalizeRecipeData(payload?.recipe ?? {});
    const drafts = loadOwnerDrafts();
    drafts.unshift(normalizeHostedDungeon({
      id: `hosted_${Date.now().toString(36)}`,
      recipe,
      shareCode: encodeRecipe(recipe),
      packageText,
      packageFileName: file.name || `${recipe.name || "dungeon"}.mdmpkg`,
      packageMetadata: payload?.metadata ?? null,
      createdAt: new Date().toISOString(),
    }));
    saveOwnerDrafts(drafts);
    packageInput.value = "";
    renderHostedDungeons(loadAllHostedDungeons());
    setStatus(`Added "${recipe.name}" to your local owner drafts. Export the listing file when you're ready.`);
  } catch {
    setStatus("That full package could not be added.", "error");
  }
}

async function copyShareCodeById(id) {
  const dungeon = loadAllHostedDungeons().find((entry) => entry.id === id);
  if (!dungeon) {
    setStatus("That hosted dungeon could not be found.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(dungeon.shareCode);
    setStatus(`Copied the share code for "${dungeon.name}".`);
  } catch {
    setStatus("The share code could not be copied automatically.", "error");
  }
}

function downloadPackageById(id) {
  const dungeon = loadAllHostedDungeons().find((entry) => entry.id === id);
  if (!dungeon || !dungeon.packageText) {
    setStatus("That full package is not available for download.", "error");
    return;
  }
  const blob = new Blob([dungeon.packageText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = dungeon.packageFileName || `${dungeon.name || "dungeon"}.mdmpkg`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded the full package for "${dungeon.name}".`);
}

function removeHostedDungeon(id) {
  if (!isOwnerMode()) {
    return;
  }
  const drafts = loadOwnerDrafts();
  const remainingDrafts = drafts.filter((entry) => entry.id !== id);
  if (remainingDrafts.length !== drafts.length) {
    saveOwnerDrafts(remainingDrafts);
    renderHostedDungeons(loadAllHostedDungeons());
    setStatus("Removed the drafted listing.");
    return;
  }
  setStatus("Checked-in public listings are removed by exporting new data and updating hosted-dungeons.js in the repo.", "error");
}

function exportHostedListingSource() {
  const all = loadAllHostedDungeons().map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    recipe: entry.recipe,
    shareCode: entry.shareCode,
    includesCustomAssets: entry.includesCustomAssets,
    packageFileName: entry.packageFileName,
    packageText: entry.packageText,
    packageMetadata: entry.packageMetadata ?? null,
  }));
  return `window.HOSTED_DUNGEONS = ${JSON.stringify(all, null, 2)};\n`;
}

async function copyHostedListingSource() {
  try {
    await navigator.clipboard.writeText(exportHostedListingSource());
    setStatus("Copied the new hosted-dungeons.js contents.");
  } catch {
    setStatus("The listing file could not be copied automatically.", "error");
  }
}

function downloadHostedListingSource() {
  const blob = new Blob([exportHostedListingSource()], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "hosted-dungeons.js";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Downloaded hosted-dungeons.js.");
}

function clearDrafts() {
  localStorage.removeItem(OWNER_DRAFT_STORAGE_KEY);
  renderHostedDungeons(loadAllHostedDungeons());
  setStatus("Cleared the local owner drafts.");
}

publishShareCodeButton?.addEventListener("click", () => {
  void publishShareCode();
});

publishPackageButton?.addEventListener("click", () => {
  void publishFullPackage();
});

copyHostedDataButton?.addEventListener("click", () => {
  void copyHostedListingSource();
});

downloadHostedDataButton?.addEventListener("click", () => {
  downloadHostedListingSource();
});

clearDraftsButton?.addEventListener("click", () => {
  clearDrafts();
});

ownerLockButton?.addEventListener("click", () => {
  setOwnerMode(false);
  updateOwnerModeUi();
  setStatus("Owner mode hidden in this browser.");
});

hostedList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const id = button.dataset.id;
  if (!id) {
    return;
  }
  if (button.dataset.action === "copy-share-code") {
    void copyShareCodeById(id);
    return;
  }
  if (button.dataset.action === "download-package") {
    downloadPackageById(id);
    return;
  }
  if (button.dataset.action === "remove-hosted") {
    removeHostedDungeon(id);
  }
});

applyOwnerModeFromUrl();
updateOwnerModeUi();
