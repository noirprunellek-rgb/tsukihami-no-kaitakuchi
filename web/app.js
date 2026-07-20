const firebaseSdkVersion = "10.12.5";

const rolesByCount = {
  4: ["航海士", "医師", "大工", "探索者"],
  5: ["航海士", "医師", "大工", "探索者", "記録係"],
};

const tileInfo = {
  beach: { label: "海岸", action: "交換", icon: "浜", color: "#4b8ca8" },
  forest: { label: "森", action: "木材", icon: "木", color: "#2f7d5a" },
  rock: { label: "岩場", action: "石材", icon: "石", color: "#737985" },
  swamp: { label: "湿地", action: "薬草", icon: "薬", color: "#5b7d62" },
  river: { label: "川", action: "橋", icon: "川", color: "#2c78a0" },
  hill: { label: "丘", action: "信号", icon: "火", color: "#c28a21" },
  cave: { label: "洞窟", action: "部品", icon: "洞", color: "#4f4b5d" },
  ruin: { label: "遺跡", action: "手がかり", icon: "跡", color: "#8a6a45" },
  wreck: { label: "難破船", action: "修理", icon: "船", color: "#9a4f3f" },
  jungle: { label: "密林", action: "食料", icon: "実", color: "#386b3f" },
  marsh: { label: "沼", action: "危険", icon: "沼", color: "#536b62" },
  cliff: { label: "崖", action: "見張り", icon: "崖", color: "#805f4a" },
};

const layoutRows = [5, 6, 7, 8, 9, 8, 7, 6, 5];
const terrainBag = [
  "forest", "forest", "forest", "forest", "forest", "forest",
  "rock", "rock", "rock", "rock", "swamp", "swamp", "swamp",
  "river", "river", "river", "river", "river", "hill", "hill",
  "hill", "cave", "cave", "cave", "ruin", "ruin", "ruin",
  "wreck", "wreck", "jungle", "jungle", "jungle", "jungle",
  "marsh", "marsh", "cliff", "cliff",
];

const targetByCount = {
  4: { turn: 14, bridges: 3, repair: 4, signal: 3, route: 3 },
  5: { turn: 13, bridges: 3, repair: 4, signal: 4, route: 3 },
};

const state = {
  turn: 1,
  phase: "map",
  players: [],
  map: [],
  selectedPlayerId: "",
  supplies: { wood: 0, stone: 0, food: 0, herb: 0, parts: 0, clue: 0 },
  progress: { bridges: 0, repair: 0, signal: 0, route: 0, danger: 0 },
  night: { event: "none", visibleRange: 99, note: "" },
  solo: { enabled: false, humanPlayerId: "" },
  online: { roomId: "", connected: false, status: "未接続" },
  log: [],
};

let firebaseApi = null;
let roomRef = null;
let unsubscribeRoom = null;
let applyingRemote = false;
let syncTimer = null;

const playerCount = document.querySelector("#playerCount");
const seedInput = document.querySelector("#seedInput");
const soloMode = document.querySelector("#soloMode");
const nameFields = document.querySelector("#nameFields");
const setupPanel = document.querySelector("#setupPanel");
const gamePanel = document.querySelector("#gamePanel");
const phasePanel = document.querySelector("#phasePanel");
const playersPanel = document.querySelector("#playersPanel");
const roundLabel = document.querySelector("#roundLabel");

function seededRandom(seed) {
  let value = 0;
  for (let i = 0; i < seed.length; i += 1) value = (value * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildTerrainDeck() {
  const total = layoutRows.reduce((sum, row) => sum + row, 0);
  const deck = [];
  while (deck.length < total) deck.push(...terrainBag);
  return deck.slice(0, total);
}

function createMap(random) {
  const terrains = shuffle(buildTerrainDeck(), random);
  let index = 0;
  return layoutRows.flatMap((length, row) => Array.from({ length }, (_, col) => {
    let terrain = terrains[index++];
    if (row === 0 && col === Math.floor(length / 2)) terrain = "beach";
    if (row === 8 && col === Math.floor(length / 2)) terrain = "wreck";
    return {
      id: `t${row}-${col}`,
      row,
      col,
      terrain,
      bridge: false,
      damaged: false,
      explored: terrain === "beach",
    };
  }));
}

function renderNameFields() {
  nameFields.innerHTML = "";
  for (let i = 0; i < Number(playerCount.value); i += 1) {
    const label = document.createElement("label");
    label.textContent = `プレイヤー${i + 1}`;
    const input = document.createElement("input");
    input.value = `P${i + 1}`;
    input.dataset.nameInput = "true";
    label.append(input);
    nameFields.append(label);
  }
}

function startGame() {
  const count = Number(playerCount.value);
  const soloEnabled = Boolean(soloMode?.checked);
  const random = seededRandom(`${seedInput.value}-${Date.now()}`);
  const roles = shuffle(rolesByCount[count], random);
  const names = [...document.querySelectorAll("[data-name-input]")].map((input, i) => input.value.trim() || `P${i + 1}`);

  state.map = createMap(random);
  const startTile = state.map.find((tile) => tile.terrain === "beach").id;
  state.players = names.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    color: ["#2f7d5a", "#b84f43", "#2e68a6", "#7b5bbb", "#c28a21"][i],
    role: roles[i],
    tileId: startTile,
    acted: false,
    bot: soloEnabled && i > 0,
  }));
  Object.assign(state, {
    turn: 1,
    phase: "map",
    selectedPlayerId: state.players[0].id,
    supplies: { wood: 0, stone: 0, food: 0, herb: 0, parts: 0, clue: 0 },
    progress: { bridges: 0, repair: 0, signal: 0, route: 0, danger: 0 },
    night: { event: "none", visibleRange: 99, note: "" },
    solo: { enabled: soloEnabled, humanPlayerId: state.players[0].id },
    log: ["全員が漂着海岸に流れ着いた。広い島を探索し、目標ターンまでに脱出しよう。"],
  });
  setupPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  saveAndRender();
}

function addLog(text) {
  state.log.unshift(`T${state.turn}: ${text}`);
  state.log = state.log.slice(0, 60);
  saveAndRender();
}

function pushLog(text) {
  state.log.unshift(`T${state.turn}: ${text}`);
  state.log = state.log.slice(0, 60);
}

function humanPlayer() {
  return state.players.find((player) => player.id === state.solo?.humanPlayerId) || state.players[0];
}

function isSoloHuman(player) {
  return Boolean(state.solo?.enabled && player?.id === state.solo.humanPlayerId);
}

function findTile(id) {
  return state.map.find((tile) => tile.id === id);
}

function rowStart(row) {
  return -Math.floor(layoutRows[row] / 2);
}

function axial(tile) {
  return { q: rowStart(tile.row) + tile.col, r: tile.row };
}

function distance(a, b) {
  const aa = axial(a);
  const bb = axial(b);
  const dq = aa.q - bb.q;
  const dr = aa.r - bb.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function neighbors(tile) {
  return state.map.filter((other) => other.id !== tile.id && distance(tile, other) <= 1);
}

function canSee(tile) {
  if (state.night.visibleRange >= 99) return true;
  return state.players.some((player) => distance(findTile(player.tileId), tile) <= state.night.visibleRange);
}

function moveSelected(tileId) {
  const player = state.players.find((p) => p.id === state.selectedPlayerId);
  if (!player || player.acted) return;
  if (state.solo?.enabled && !isSoloHuman(player)) return;
  const from = findTile(player.tileId);
  const to = findTile(tileId);
  if (!from || !to) return;
  if (from.id !== to.id && !neighbors(from).some((tile) => tile.id === to.id)) return;
  if (to.terrain === "river" && !to.bridge) {
    player.tileId = to.id;
    player.acted = true;
    to.explored = true;
    addLog(`${player.name}は川で足止めされた。橋がないと渡り切れない。`);
    return;
  }
  player.tileId = to.id;
  player.acted = true;
  to.explored = true;
  addLog(`${player.name}は${tileInfo[to.terrain].label}へ移動した。`);
}

function doTileAction(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  if (state.solo?.enabled && !isSoloHuman(player) && !player.bot) return;
  const tile = findTile(player.tileId);
  if (!tile) return;
  const beforeDanger = state.progress.danger;
  if (tile.terrain === "forest") state.supplies.wood += 1;
  if (tile.terrain === "rock") state.supplies.stone += 1;
  if (tile.terrain === "jungle") state.supplies.food += 1;
  if (tile.terrain === "swamp") state.supplies.herb += 1;
  if (tile.terrain === "marsh") state.progress.danger += 1;
  if (tile.terrain === "cave") {
    state.supplies.parts += 1;
    state.progress.danger += 1;
  }
  if (tile.terrain === "cliff") state.night.visibleRange = 2;
  if (tile.terrain === "hill") state.progress.signal = Math.min(targets().signal, state.progress.signal + 1);
  if (tile.terrain === "ruin") {
    state.supplies.clue += 1;
    if (state.supplies.clue >= 2 && state.progress.route < targets().route) {
      state.supplies.clue -= 2;
      state.progress.route += 1;
    }
  }
  if (tile.terrain === "river" && !tile.bridge && state.supplies.wood >= 2 && state.supplies.stone >= 1) {
    state.supplies.wood -= 2;
    state.supplies.stone -= 1;
    tile.bridge = true;
    tile.damaged = false;
    state.progress.bridges += 1;
  }
  if (tile.terrain === "river" && tile.damaged && state.supplies.wood >= 1) {
    state.supplies.wood -= 1;
    tile.damaged = false;
  }
  if (tile.terrain === "wreck" && state.supplies.wood >= 1 && state.supplies.parts >= 1) {
    state.supplies.wood -= 1;
    state.supplies.parts -= 1;
    state.progress.repair = Math.min(targets().repair, state.progress.repair + 1);
  }
  const dangerNote = state.progress.danger > beforeDanger ? " 危険が増えた。" : "";
  if (isSoloHuman(player)) player.acted = true;
  if (player.bot) {
    pushLog(`${player.name} Bot: ${tileInfo[tile.terrain].label}の行動を実行した。${dangerNote}`);
    return;
  }
  pushLog(`${player.name}が${tileInfo[tile.terrain].label}の行動を実行した。${dangerNote}`);
  if (isSoloHuman(player)) {
    runBotTurns();
    return;
  }
  saveAndRender();
}

function botTileScore(player, tile) {
  const s = state.supplies;
  const p = state.progress;
  const t = targets();
  let score = tile.id === player.tileId ? 0.1 : 1;
  if (tile.terrain === "wreck") score += p.repair < t.repair && s.wood >= 1 && s.parts >= 1 ? 9 : 1;
  if (tile.terrain === "river") score += p.bridges < t.bridges && s.wood >= 2 && s.stone >= 1 ? 8 : -1;
  if (tile.terrain === "hill") score += p.signal < t.signal ? 6 : 0;
  if (tile.terrain === "ruin") score += p.route < t.route ? 5 : 0;
  if (tile.terrain === "forest") score += s.wood < 4 ? 4 : 1;
  if (tile.terrain === "rock") score += s.stone < 3 ? 3 : 1;
  if (tile.terrain === "cave") score += s.parts < 3 ? 3 : 0;
  if (tile.terrain === "jungle") score += s.food < state.players.length ? 2 : 0;
  if (tile.terrain === "swamp") score += s.herb < 2 ? 2 : 0;
  if (tile.terrain === "marsh") score -= p.danger >= 4 ? 5 : 1;
  if (tile.terrain === "river" && !tile.bridge && s.wood < 2) score -= 2;
  if (tile.terrain === "cliff") score += state.night.visibleRange < 99 ? 2 : 0;
  return score + Math.random() * 0.75;
}

function chooseBotTile(player) {
  const current = findTile(player.tileId);
  if (!current) return null;
  return [current, ...neighbors(current)]
    .sort((a, b) => botTileScore(player, b) - botTileScore(player, a))[0];
}

function autoBotTurn(player) {
  if (!player || player.acted) return;
  const tile = chooseBotTile(player);
  if (!tile) return;
  player.tileId = tile.id;
  player.acted = true;
  tile.explored = true;
  pushLog(`${player.name} Bot: ${tileInfo[tile.terrain].label}へ移動した。`);
  doTileAction(player.id);
}

function runBotTurns() {
  if (!state.solo?.enabled) {
    saveAndRender();
    return;
  }
  state.players.filter((player) => player.bot && !player.acted).forEach(autoBotTurn);
  if (state.players.every((player) => player.acted)) {
    state.turn += 1;
    state.players.forEach((player) => { player.acted = false; });
    applyRandomNight();
    state.phase = "map";
    state.selectedPlayerId = humanPlayer().id;
    pushLog("Botの行動が完了。夜のアクシデントを処理して次のターンへ。");
  } else {
    state.phase = "map";
    state.selectedPlayerId = humanPlayer().id;
  }
  saveAndRender();
}

function targets() {
  return targetByCount[state.players.length] || targetByCount[4];
}

function nextTurn() {
  state.turn += 1;
  state.players.forEach((p) => { p.acted = false; });
  applyRandomNight();
  state.phase = "map";
  if (state.solo?.enabled) state.selectedPlayerId = humanPlayer().id;
  addLog("夜のアクシデントを処理して次のターンへ。");
}

function nightEvents() {
  return {
    fog: { event: "fog", visibleRange: 1, note: "濃霧。各自の周囲1マスしか見えない。" },
    darkness: { event: "darkness", visibleRange: 0, note: "月隠れ。自分がいるマスしか見えない。" },
    storm: { event: "storm", visibleRange: 1, note: "嵐。視界1、危険+1。" },
    lost: { event: "lost", visibleRange: 1, note: "道迷い。選択中の漂流者を隣接マスへずらす。" },
    calm: { event: "calm", visibleRange: 99, note: "静かな夜。何も起きなかった。" },
  };
}

function applyNight(eventType) {
  const events = nightEvents();
  state.night = events[eventType] || events.calm;
  if (eventType === "storm") state.progress.danger += 1;
  if (eventType === "lost") {
    const player = state.players.find((p) => p.id === state.selectedPlayerId) || state.players[0];
    const current = findTile(player?.tileId);
    const options = current ? neighbors(current) : [];
    const target = options[Math.floor(Math.random() * options.length)];
    if (player && target) {
      player.tileId = target.id;
      target.explored = true;
      state.night.note += ` ${player.name}が流されて${tileInfo[target.terrain].label}へ移動した。`;
    }
  }
}

function applyRandomNight() {
  const deck = ["calm", "fog", "fog", "darkness", "storm", "lost"];
  applyNight(deck[Math.floor(Math.random() * deck.length)]);
  pushLog(`夜: ${state.night.note}`);
}

function triggerNight(eventType) {
  applyNight(eventType);
  addLog(`夜: ${state.night.note}`);
}

function damageBridge(tileId) {
  const tile = findTile(tileId);
  if (!tile || tile.terrain !== "river" || !tile.bridge) return;
  tile.damaged = true;
  addLog("夜の嵐で橋が損傷した。");
}

function adjust(path, amount) {
  const [group, key] = path.split(".");
  state[group][key] = Math.max(0, state[group][key] + amount);
  saveAndRender();
}

function exportState() {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(plainState()))));
  navigator.clipboard?.writeText(payload);
  addLog("盤面コードをコピーしました。");
}

function importState(value) {
  try {
    applyState(JSON.parse(decodeURIComponent(escape(atob(value.trim())))));
    setupPanel.classList.add("hidden");
    gamePanel.classList.remove("hidden");
    saveAndRender(false);
  } catch {
    addLog("盤面コードを読み込めませんでした。");
  }
}

function plainState() {
  return {
    turn: state.turn,
    phase: state.phase,
    players: state.players,
    map: state.map,
    selectedPlayerId: state.selectedPlayerId,
    supplies: state.supplies,
    progress: state.progress,
    night: state.night,
    solo: state.solo,
    online: state.online,
    log: state.log,
  };
}

function applyState(data) {
  Object.assign(state, data);
  state.solo = { enabled: false, humanPlayerId: "", ...(data.solo || {}) };
  state.players.forEach((player, index) => {
    if (player.bot === undefined) player.bot = state.solo.enabled && index > 0;
  });
  state.online = { ...state.online, ...(data.online || {}) };
}

function saveAndRender(shouldSync = true) {
  localStorage.setItem("tsukihami-island-state", JSON.stringify(plainState()));
  render();
  if (shouldSync) scheduleSync();
}

async function loadFirebase() {
  if (firebaseApi) return firebaseApi;
  const configModule = await loadFirebaseConfig();
  const appModule = await import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-app.js`);
  const dbModule = await import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-database.js`);
  const app = appModule.initializeApp(configModule);
  const db = dbModule.getDatabase(app);
  firebaseApi = { db, ref: dbModule.ref, set: dbModule.set, onValue: dbModule.onValue };
  return firebaseApi;
}

async function loadFirebaseConfig() {
  const saved = localStorage.getItem("tsukihami-firebase-config");
  if (saved) return JSON.parse(saved);
  try {
    const module = await import("./firebase-config.js");
    return module.firebaseConfig;
  } catch {
    throw new Error("Firebase config is missing");
  }
}

function saveFirebaseConfig(value) {
  try {
    const trimmed = value.trim();
    const objectText = trimmed
      .replace(/^(export\s+)?const\s+firebaseConfig\s*=\s*/, "")
      .replace(/;\s*$/, "");
    const config = Function(`"use strict"; return (${objectText});`)();
    if (!config.apiKey || !config.databaseURL || !config.projectId) throw new Error("Invalid config");
    localStorage.setItem("tsukihami-firebase-config", JSON.stringify(config));
    state.online.status = "Firebase設定を保存済み";
    addLog("Firebase設定を保存しました。部屋を作れるようになりました。");
  } catch {
    state.online.status = "Firebase設定を読み取れませんでした";
    render();
  }
}

async function connectRoom(roomId, createIfEmpty) {
  try {
    const api = await loadFirebase();
    const cleanRoomId = roomId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32);
    if (!cleanRoomId) throw new Error("Room id is required");
    if (unsubscribeRoom) unsubscribeRoom();
    roomRef = api.ref(api.db, `rooms/${cleanRoomId}`);
    state.online = { roomId: cleanRoomId, connected: true, status: "接続中" };
    if (createIfEmpty) await api.set(roomRef, { state: plainState(), updatedAt: Date.now() });
    unsubscribeRoom = api.onValue(roomRef, (snapshot) => {
      const value = snapshot.val();
      if (!value?.state) return;
      applyingRemote = true;
      applyState(value.state);
      state.online = { roomId: cleanRoomId, connected: true, status: "同期中" };
      setupPanel.classList.add("hidden");
      gamePanel.classList.remove("hidden");
      render();
      applyingRemote = false;
    });
    addLog(`部屋 ${cleanRoomId} に接続した。`);
  } catch (error) {
    state.online.status = "未接続: Firebase設定またはDBルールを確認";
    render();
  }
}

function scheduleSync() {
  if (applyingRemote || !state.online.connected || !roomRef || !firebaseApi) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    firebaseApi.set(roomRef, { state: plainState(), updatedAt: Date.now() });
  }, 250);
}

function renderPhase() {
  phasePanel.innerHTML = `<div class="dashboard">
    <section class="tool-panel map-panel">
      <div class="panel-head">
        <div><h2>島マップ</h2><p>選択中の漂流者を1マス移動し、着いた場所の行動を実行します。</p></div>
        <button data-action="nextTurn">次ターン</button>
      </div>
      ${renderMap()}
    </section>
    <section class="tool-panel">
      <div class="panel-head"><div><h2>パネルアクション</h2><p>今いるマスの効果を実行します。ソロではP1の行動後にBotが自動で動きます。</p></div></div>
      ${renderActionList()}
    </section>
    <section class="tool-panel">
      <div class="panel-head"><div><h2>夜のアクシデント</h2><p>次ターン開始時にランダム発生します。下のボタンはテスト用です。</p></div></div>
      ${renderNightControls()}
    </section>
    <section class="tool-panel">
      <div class="panel-head">
        <div><h2>オンライン同期</h2><p>Firebaseの部屋同期と盤面コード共有。</p></div>
        <div class="actions"><button data-action="saveFirebase">Firebase設定を保存</button><button class="primary" data-action="createRoom">部屋を作る</button><button data-action="joinRoom">部屋に参加</button><button data-action="export">盤面コードをコピー</button><button data-action="import">コード読込</button></div>
      </div>
      ${renderOnlineControls()}
    </section>
  </div>`;
}

function renderMap() {
  let index = 0;
  const selectablePlayers = state.solo?.enabled ? [humanPlayer()] : state.players;
  return `<label class="select-player">動かす人<select id="selectedPlayer">${selectablePlayers.map((p) => `<option value="${p.id}" ${p.id === state.selectedPlayerId ? "selected" : ""}>${p.name}${p.bot ? " Bot" : ""}</option>`).join("")}</select></label>
  <div class="map-wrap large-map">${layoutRows.map((length) => {
    const tiles = state.map.slice(index, index + length);
    index += length;
    return `<div class="hex-row row-${length}">${tiles.map(renderTile).join("")}</div>`;
  }).join("")}</div>`;
}

function renderTile(tile) {
  const visible = canSee(tile);
  const info = tileInfo[tile.terrain];
  const occupants = state.players.filter((p) => p.tileId === tile.id);
  const label = visible ? info.label : "不明";
  const icon = visible ? info.icon : "?";
  return `<div class="hex ${tile.terrain} ${tile.damaged ? "blocked" : ""} ${visible ? "" : "obscured"}" data-tile="${tile.id}" style="background:${visible ? info.color : "#323844"}">
    <strong>${icon}</strong><small>${label}</small>${tile.bridge && visible ? "<span class=\"hex-num\">橋</span>" : ""}
    <div class="meeples">${occupants.map((p) => `<b style="background:${p.color}">${p.name.slice(0, 1)}</b>`).join("")}</div>
  </div>`;
}

function renderActionList() {
  const actionPlayers = state.solo?.enabled ? [humanPlayer()] : state.players;
  return `<div class="controls">${actionPlayers.map((p) => `<button data-action-player="${p.id}">${p.name}: 今いるマスの行動</button>`).join("")}</div>${renderSupplies()}`;
}

function renderNightControls() {
  const bridgeButtons = state.map.filter((tile) => tile.terrain === "river" && tile.bridge).map((tile) => `<button data-damage-bridge="${tile.id}">橋を損傷 ${tile.id}</button>`).join("");
  return `<div class="controls">
    <button data-night="fog">濃霧: 周囲1マス</button>
    <button data-night="darkness">月隠れ: 自分のマスだけ</button>
    <button data-night="storm">嵐: 視界1 + 危険</button>
    <button data-night="lost">道迷い</button>
    <button data-night="none">何もなし</button>
    ${bridgeButtons || "<button disabled>損傷できる橋なし</button>"}
  </div><p class="scoreline">${state.night.note || "夜の事故を選んでください。"}</p>${renderProgressControls()}`;
}

function renderProgressControls() {
  const items = [["bridges", "橋"], ["repair", "船修理"], ["signal", "救難信号"], ["route", "航路"], ["danger", "危険"]];
  return `<div class="controls">${items.map(([key, label]) => `<div class="player-card"><div class="player-head"><strong>${label}</strong><span>${state.progress[key]}</span></div><div class="actions"><button data-adjust="progress.${key}:-1">-</button><button data-adjust="progress.${key}:1">+</button></div></div>`).join("")}</div>`;
}

function renderOnlineControls() {
  return `<label>部屋ID<input id="roomIdInput" value="${state.online.roomId || ""}" placeholder="例: island-test"></label>
  <p class="scoreline">状態: ${state.online.status}</p>
  <textarea id="firebaseConfigInput" class="share-code" placeholder="Firebase Consoleの firebaseConfig を貼り付け"></textarea>
  <textarea id="shareCode" class="share-code" placeholder="盤面コードを貼り付け"></textarea>`;
}

function renderSupplies() {
  const s = state.supplies;
  return `<div class="chips"><span class="chip">木材 ${s.wood}</span><span class="chip">石材 ${s.stone}</span><span class="chip">食料 ${s.food}</span><span class="chip">薬草 ${s.herb}</span><span class="chip">部品 ${s.parts}</span><span class="chip">手がかり ${s.clue}</span></div>`;
}

function renderPlayers() {
  const p = state.progress;
  const t = targets();
  playersPanel.innerHTML = `<h2>脱出状況</h2><p class="scoreline">目標: ${t.turn}ターン以内</p>
    <div class="chips"><span class="chip">橋 ${p.bridges}/${t.bridges}</span><span class="chip">修理 ${p.repair}/${t.repair}</span><span class="chip">信号 ${p.signal}/${t.signal}</span><span class="chip">航路 ${p.route}/${t.route}</span><span class="chip danger">危険 ${p.danger}/6</span></div>
    ${renderSupplies()}
    <h2>漂流者</h2><div class="player-list">${state.players.map((player) => `<article class="player-card" style="--owner:${player.color}"><div class="player-head"><strong><span class="swatch"></span>${player.name}</strong><span class="chip">${player.role}</span></div><div class="chips"><span class="chip ${player.bot ? "" : "gold"}">${player.bot ? "Bot" : "あなた"}</span><span class="chip ${player.acted ? "gold" : ""}">${player.acted ? "移動済" : "未移動"}</span><span class="chip">協力中</span></div></article>`).join("")}</div>${renderLog()}`;
}

function renderLog() {
  return `<div class="log">${state.log.map((entry) => `<p>${entry}</p>`).join("")}</div>`;
}

function render() {
  roundLabel.textContent = state.turn;
  renderPhase();
  renderPlayers();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tile = target.closest("[data-tile]");
  if (tile instanceof HTMLElement) moveSelected(tile.dataset.tile);
  if (target.dataset.actionPlayer) doTileAction(target.dataset.actionPlayer);
  if (target.dataset.adjust) {
    const [path, amount] = target.dataset.adjust.split(":");
    adjust(path, Number(amount));
  }
  if (target.dataset.night) triggerNight(target.dataset.night);
  if (target.dataset.damageBridge) damageBridge(target.dataset.damageBridge);
  if (target.dataset.action === "nextTurn") nextTurn();
  if (target.dataset.action === "export") exportState();
  if (target.dataset.action === "import") importState(document.querySelector("#shareCode").value);
  if (target.dataset.action === "saveFirebase") saveFirebaseConfig(document.querySelector("#firebaseConfigInput").value);
  if (target.dataset.action === "createRoom") connectRoom(document.querySelector("#roomIdInput").value, true);
  if (target.dataset.action === "joinRoom") connectRoom(document.querySelector("#roomIdInput").value, false);
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === "selectedPlayer") {
    state.selectedPlayerId = target.value;
    saveAndRender();
  }
});

document.querySelector("#startGame").addEventListener("click", startGame);
playerCount.addEventListener("change", renderNameFields);
renderNameFields();
