const SUPABASE_CONFIG_STORAGE_KEY = "mysteryDungeonMaker.hosting.supabaseConfig.v1";
const SUPABASE_TABLE = "hosted_dungeons";

const shareCodeInput = document.querySelector("#shareCodeInput");
const packageInput = document.querySelector("#packageInput");
const publishShareCodeButton = document.querySelector("#publishShareCodeButton");
const publishPackageButton = document.querySelector("#publishPackageButton");
const hostedCount = document.querySelector("#hostedCount");
const hostedList = document.querySelector("#hostedList");
const hostingStatus = document.querySelector("#hostingStatus");
const supabaseUrlInput = document.querySelector("#supabaseUrlInput");
const supabaseAnonKeyInput = document.querySelector("#supabaseAnonKeyInput");
const adminPassphraseInput = document.querySelector("#adminPassphraseInput");
const saveSupabaseConfigButton = document.querySelector("#saveSupabaseConfigButton");
const clearSupabaseConfigButton = document.querySelector("#clearSupabaseConfigButton");

let supabaseClient = null;
let supabaseClientSignature = "";

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

function getDefaultSupabaseConfig() {
  const config = window.SHARING_SITE_CONFIG ?? {};
  return {
    supabaseUrl: typeof config.supabaseUrl === "string" ? config.supabaseUrl.trim() : "",
    supabaseAnonKey: typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey.trim() : "",
    adminDeletePassphrase: typeof config.adminDeletePassphrase === "string" ? config.adminDeletePassphrase : "",
  };
}

function loadSupabaseConfig() {
  const defaults = getDefaultSupabaseConfig();
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw);
    return {
      supabaseUrl: typeof parsed?.supabaseUrl === "string" && parsed.supabaseUrl.trim() ? parsed.supabaseUrl.trim() : defaults.supabaseUrl,
      supabaseAnonKey: typeof parsed?.supabaseAnonKey === "string" && parsed.supabaseAnonKey.trim() ? parsed.supabaseAnonKey.trim() : defaults.supabaseAnonKey,
      adminDeletePassphrase: typeof parsed?.adminDeletePassphrase === "string" ? parsed.adminDeletePassphrase : defaults.adminDeletePassphrase,
    };
  } catch {
    return defaults;
  }
}

function saveSupabaseConfig(config) {
  localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify({
    supabaseUrl: config.supabaseUrl || "",
    supabaseAnonKey: config.supabaseAnonKey || "",
    adminDeletePassphrase: config.adminDeletePassphrase || "",
  }));
}

function fillConfigInputs() {
  const config = loadSupabaseConfig();
  if (supabaseUrlInput) {
    supabaseUrlInput.value = config.supabaseUrl;
  }
  if (supabaseAnonKeyInput) {
    supabaseAnonKeyInput.value = config.supabaseAnonKey;
  }
  if (adminPassphraseInput) {
    adminPassphraseInput.value = config.adminDeletePassphrase;
  }
}

function readConfigInputs() {
  return {
    supabaseUrl: supabaseUrlInput?.value.trim() || "",
    supabaseAnonKey: supabaseAnonKeyInput?.value.trim() || "",
    adminDeletePassphrase: adminPassphraseInput?.value || "",
  };
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

function getSupabaseClient() {
  const config = loadSupabaseConfig();
  const signature = `${config.supabaseUrl}::${config.supabaseAnonKey}`;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }
  if (!window.supabase?.createClient) {
    return null;
  }
  if (!supabaseClient || supabaseClientSignature !== signature) {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    supabaseClientSignature = signature;
  }
  return supabaseClient;
}

function normalizeHostedDungeonRow(row = {}) {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Unnamed Dungeon"),
    description: String(row.description ?? ""),
    goalText: String(row.goal_text ?? ""),
    floors: clampNumber(row.floors, 1, 99, 1),
    difficulty: String(row.difficulty ?? "Normal"),
    shareCode: typeof row.share_code === "string" ? row.share_code : "",
    includesCustomAssets: Boolean(row.includes_custom_assets),
    packageFileName: typeof row.package_file_name === "string" ? row.package_file_name : "",
    packageText: typeof row.package_text === "string" ? row.package_text : "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function buildHostedInsertPayload({ recipe, shareCode, packageText = "", packageFileName = "" }) {
  const config = loadSupabaseConfig();
  return {
    name: recipe.name,
    description: recipe.description,
    goal_text: getGoalTargetLabel(recipe.customGoal),
    floors: recipe.floors,
    difficulty: getDifficultyLabel(recipe),
    share_code: shareCode,
    includes_custom_assets: Boolean(packageText) || hasCustomAssets(recipe),
    package_text: packageText || null,
    package_file_name: packageText ? (packageFileName || `${recipe.name || "dungeon"}.mdmpkg`) : null,
    admin_key_hash: config.adminDeletePassphrase ? String(hashString(config.adminDeletePassphrase)) : null,
  };
}

function renderHostedDungeons(dungeons = []) {
  hostedCount.textContent = `${dungeons.length} hosted`;
  hostedList.innerHTML = "";
  if (dungeons.length === 0) {
    hostedList.innerHTML = `<p class="empty-state">No hosted dungeons yet. Publish a share code or full package to populate the listing.</p>`;
    return;
  }
  dungeons.forEach((dungeon) => {
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
    card.innerHTML = `
      <strong>${escapeHtml(dungeon.name)}</strong>
      <p class="dungeon-card-meta">${dungeon.floors} floor${dungeon.floors === 1 ? "" : "s"} | ${escapeHtml(dungeon.difficulty)} | Published ${escapeHtml(formatPublishedDate(dungeon.createdAt))}</p>
      ${badges}
      ${description}
      ${goal}
      <div class="item-actions">
        ${primaryButton}
        <button type="button" data-action="remove-hosted" data-id="${escapeHtml(dungeon.id)}">Admin Delete</button>
      </div>
    `;
    hostedList.append(card);
  });
}

async function fetchHostedDungeons() {
  const client = getSupabaseClient();
  if (!client) {
    renderHostedDungeons([]);
    setStatus("Add your Supabase URL and anon key, then save the connection.", "error");
    return;
  }
  setStatus("Loading hosted dungeons...");
  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select("id, name, description, goal_text, floors, difficulty, share_code, includes_custom_assets, package_file_name, package_text, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    renderHostedDungeons([]);
    setStatus(`Could not load hosted dungeons: ${error.message}`, "error");
    return;
  }
  renderHostedDungeons((data ?? []).map((row) => normalizeHostedDungeonRow(row)));
  setStatus(`Loaded ${data?.length ?? 0} hosted dungeon${(data?.length ?? 0) === 1 ? "" : "s"}.`);
}

async function publishShareCode() {
  const client = getSupabaseClient();
  if (!client) {
    setStatus("Save your Supabase connection first.", "error");
    return;
  }
  const code = shareCodeInput.value.trim();
  if (!code) {
    setStatus("Paste a share code first.", "error");
    return;
  }
  try {
    const recipe = decodeRecipe(code);
    const payload = buildHostedInsertPayload({ recipe, shareCode: code });
    const { error } = await client.from(SUPABASE_TABLE).insert(payload);
    if (error) {
      throw error;
    }
    shareCodeInput.value = "";
    await fetchHostedDungeons();
    setStatus(`Hosted "${recipe.name}" from share code.`);
  } catch (error) {
    setStatus(`That share code could not be published: ${error?.message || "Unknown error."}`, "error");
  }
}

async function publishFullPackage() {
  const client = getSupabaseClient();
  if (!client) {
    setStatus("Save your Supabase connection first.", "error");
    return;
  }
  const file = packageInput.files?.[0];
  if (!file) {
    setStatus("Choose a full package file first.", "error");
    return;
  }
  try {
    const packageText = await file.text();
    const payload = JSON.parse(packageText);
    const recipe = normalizeRecipeData(payload?.recipe ?? {});
    const shareCode = encodeRecipe(recipe);
    const insertPayload = buildHostedInsertPayload({
      recipe,
      shareCode,
      packageText,
      packageFileName: file.name || `${recipe.name || "dungeon"}.mdmpkg`,
    });
    const { error } = await client.from(SUPABASE_TABLE).insert(insertPayload);
    if (error) {
      throw error;
    }
    packageInput.value = "";
    await fetchHostedDungeons();
    setStatus(`Hosted "${recipe.name}" from full package.`);
  } catch (error) {
    setStatus(`That full package could not be published: ${error?.message || "Unknown error."}`, "error");
  }
}

async function copyShareCodeById(id) {
  const client = getSupabaseClient();
  if (!client) {
    setStatus("Save your Supabase connection first.", "error");
    return;
  }
  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select("name, share_code")
    .eq("id", id)
    .maybeSingle();
  if (error || !data?.share_code) {
    setStatus("That hosted dungeon could not be found.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(data.share_code);
    setStatus(`Copied the share code for "${data.name}".`);
  } catch {
    setStatus("The share code could not be copied automatically.", "error");
  }
}

async function downloadPackageById(id) {
  const client = getSupabaseClient();
  if (!client) {
    setStatus("Save your Supabase connection first.", "error");
    return;
  }
  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select("name, package_text, package_file_name")
    .eq("id", id)
    .maybeSingle();
  if (error || !data?.package_text) {
    setStatus("That full package is not available for download.", "error");
    return;
  }
  const blob = new Blob([data.package_text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = data.package_file_name || `${data.name || "dungeon"}.mdmpkg`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded the full package for "${data.name}".`);
}

async function removeHostedDungeon(id) {
  const client = getSupabaseClient();
  if (!client) {
    setStatus("Save your Supabase connection first.", "error");
    return;
  }
  const config = loadSupabaseConfig();
  if (!config.adminDeletePassphrase) {
    setStatus("Set an admin delete passphrase first.", "error");
    return;
  }
  const enteredPassphrase = window.prompt("Enter the admin delete passphrase to remove this dungeon:");
  if (enteredPassphrase === null) {
    return;
  }
  if (enteredPassphrase !== config.adminDeletePassphrase) {
    setStatus("That admin delete passphrase was incorrect.", "error");
    return;
  }
  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select("id, admin_key_hash")
    .eq("id", id)
    .maybeSingle();
  if (error || !data?.id) {
    setStatus("That hosted dungeon could not be found.", "error");
    return;
  }
  const expectedHash = String(hashString(config.adminDeletePassphrase));
  if (data.admin_key_hash && data.admin_key_hash !== expectedHash) {
    setStatus("This listing was published under a different admin passphrase.", "error");
    return;
  }
  const { error: deleteError } = await client
    .from(SUPABASE_TABLE)
    .delete()
    .eq("id", id);
  if (deleteError) {
    setStatus(`Could not remove the hosted dungeon: ${deleteError.message}`, "error");
    return;
  }
  await fetchHostedDungeons();
  setStatus("Removed the hosted dungeon listing.");
}

function saveConnectionFromInputs() {
  const config = readConfigInputs();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    setStatus("Both the Supabase URL and anon key are required.", "error");
    return;
  }
  saveSupabaseConfig(config);
  supabaseClient = null;
  supabaseClientSignature = "";
  setStatus("Saved the Supabase connection for this browser.");
  void fetchHostedDungeons();
}

function clearSavedConnection() {
  localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY);
  supabaseClient = null;
  supabaseClientSignature = "";
  fillConfigInputs();
  renderHostedDungeons([]);
  setStatus("Cleared the saved Supabase connection.");
}

publishShareCodeButton?.addEventListener("click", () => {
  void publishShareCode();
});

publishPackageButton?.addEventListener("click", () => {
  void publishFullPackage();
});

saveSupabaseConfigButton?.addEventListener("click", () => {
  saveConnectionFromInputs();
});

clearSupabaseConfigButton?.addEventListener("click", () => {
  clearSavedConnection();
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
    void downloadPackageById(id);
    return;
  }
  if (button.dataset.action === "remove-hosted") {
    void removeHostedDungeon(id);
  }
});

fillConfigInputs();
void fetchHostedDungeons();
