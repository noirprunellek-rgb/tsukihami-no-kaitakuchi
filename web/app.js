const firebaseSdkVersion = "10.12.5";

const rolesByCount = {
  4: ["航海士", "医師", "大工", "探索者"],
  5: ["航海士", "医師", "大工", "探索者", "記録係"],
};

const roleText = {
  航海士: "手がかりを使って脱出ルートを進めます。",
  医師: "同じマスの仲間の負傷や孤立を軽減します。",
  大工: "橋や船修理の木材コストを1減らします。",
  探索者: "未踏パネルを見てから移動できます。",
  記録係: "投票前に、誰か1人の直前の行動を公開確認できます。",
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
const nameFields = document.querySelector("#nameFields");
const setupPanel = document.querySelector("#setupPanel");
const gamePanel = document.querySelector("#gamePanel");
const phasePanel = document.querySelector("#phasePanel");
const playersPanel = document.querySelector("#playersPanel");
const roundLabel = document.querySelector("#roundLabel");
const identityDialog = document.querySelector("#identityDialog");

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
  const random = seededRandom(`${seedInput.value}-${Date.now()}`);
  const identities = shuffle(["月喰み", ...Array(count - 1).fill("村側")], random);
  const roles = shuffle(rolesByCount[count], random);
  const names = [...document.querySelectorAll("[data-name-input]")].map((input, i) => input.value.trim() || `P${i + 1}`);

  state.map = createMap(random);
  const startTile = state.map.find((tile) => tile.terrain === "beach").id;
  state.players = names.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    color: ["#2f7d5a", "#b84f43", "#2e68a6", "#7b5bbb", "#c28a21"][i],
    identity: identities[i],
    role: roles[i],
    tileId: startTile,
    suspicion: 0,
    isolated: false,
    acted: false,
  }));
  Object.assign(state, {
    turn: 1,
    phase: "map",
    selectedPlayerId: state.players[0].id,
    supplies: { wood: 0, stone: 0, food: 0, herb: 0, parts: 0, clue: 0 },
    progress: { bridges: 0, repair: 0, signal: 0, route: 0, danger: 0 },
    night: { event: "none", visibleRange: 99, note: "" },
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
  if (!player || player.acted || player.isolated) return;
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
  if (!player || player.isolated) return;
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
  addLog(`${player.name}が${tileInfo[tile.terrain].label}の行動を実行した。${dangerNote}`);
}

function targets() {
  return targetByCount[state.players.length] || targetByCount[4];
}

function nextTurn() {
  state.turn += 1;
  state.players.forEach((p) => { p.acted = false; });
  state.night = { event: "none", visibleRange: 99, note: "" };
  state.phase = "map";
  addLog("次のターンへ。夜の視界不良は解除された。");
}

function triggerNight(eventType) {
  const events = {
    fog: { event: "fog", visibleRange: 1, note: "濃霧。各自の周囲1マスしか見えない。" },
    darkness: { event: "darkness", visibleRange: 0, note: "月隠れ。自分のいるマスしか見えない。" },
    storm: { event: "storm", visibleRange: 1, note: "嵐。視界1、危険+1。" },
    lost: { event: "lost", visibleRange: 1, note: "道迷い。選択中の漂流者を隣接マスへずらす。" },
    none: { event: "none", visibleRange: 99, note: "何も起きなかった。" },
  };
  state.night = events[eventType] || events.none;
  if (eventType === "storm") state.progress.danger += 1;
  addLog(`夜のアクシデント: ${state.night.note}`);
}

function damageBridge(tileId) {
  const tile = findTile(tileId);
  if (!tile || tile.terrain !== "river" || !tile.bridge) return;
  tile.damaged = true;
  addLog("月喰みが橋を損傷させた。");
}

function showIdentity(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  document.querySelector("#identityOwner").textContent = player.name;
  document.querySelector("#identityTitle").textContent = `${player.identity} / ${player.role}`;
  document.querySelector("#identityText").textContent = player.identity === "月喰み"
    ? "あなたは月喰みです。橋、修理、信号、集合を遅らせ、夜の混乱に紛れて脱出を失敗させてください。"
    : `あなたは村側です。${roleText[player.role]}`;
  identityDialog.showModal();
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
    online: state.online,
    log: state.log,
  };
}

function applyState(data) {
  Object.assign(state, data);
  state.online = { ...state.online, ...(data.online || {}) };
}

function saveAndRender(shouldSync = true) {
  localStorage.setItem("tsukihami-island-state", JSON.stringify(plainState()));
  render();
  if (shouldSync) scheduleSync();
}

async function loadFirebase() {
  if (firebaseApi) return firebaseApi;
  const configModule = await import("./firebase-config.js");
  const appModule = await import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-app.js`);
  const dbModule = await import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-database.js`);
  const app = appModule.initializeApp(configModule.firebaseConfig);
  const db = dbModule.getDatabase(app);
  firebaseApi = { db, ref: dbModule.ref, set: dbModule.set, onValue: dbModule.onValue };
  return firebaseApi;
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
    state.online.status = "未接続: firebase-config.jsを確認";
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
  const panels = {
    map: ["島マップ", "スコットランドヤード寄りの広めの島です。選択中の漂流者は1ターンに1マス移動できます。夜は見える範囲が狭まります。", renderMap(), `<button class="primary" data-phase-next="action">行動へ</button><button data-action="nextTurn">次ターン</button>`],
    action: ["パネルアクション", "到着したパネルに応じた行動を実行します。物資は試作段階では共有在庫です。", renderActionList(), `<button data-phase-next="night">夜へ</button>`],
    night: ["夜のアクシデント", "夜は周囲が見えなくなったり、嵐や道迷いが発生します。月喰みはこの混乱に紛れて妨害します。", renderNightControls(), `<button data-phase-next="vote">投票へ</button>`],
    vote: ["投票と孤立", "疑惑が高い相手を孤立させられます。孤立者は交換と協力に参加できません。", renderVoteControls(), `<button data-phase-next="map">島へ</button>`],
    online: ["オンライン同期", "Firebase Realtime Database無料枠で部屋同期します。設定ファイルがない場合は共有コードだけ使えます。", renderOnlineControls(), `<button class="primary" data-action="createRoom">部屋を作る</button><button data-action="joinRoom">部屋に参加</button><button data-action="export">盤面コードをコピー</button><button data-action="import">コード読込</button>`],
  };
  const [title, body, content, buttons] = panels[state.phase];
  phasePanel.innerHTML = `<div class="phase-card"><div><h2>${title}</h2><p>${body}</p></div>${content}<div class="actions">${buttons}</div></div>`;
}

function renderMap() {
  let index = 0;
  return `<label class="select-player">動かす人<select id="selectedPlayer">${state.players.map((p) => `<option value="${p.id}" ${p.id === state.selectedPlayerId ? "selected" : ""}>${p.name}</option>`).join("")}</select></label>
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
  return `<div class="controls">${state.players.map((p) => `<button data-action-player="${p.id}">${p.name}: 今いるマスの行動</button>`).join("")}</div>${renderSupplies()}`;
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

function renderVoteControls() {
  return `<div class="controls">${state.players.map((p) => `<div class="player-card"><div class="player-head"><strong>${p.name}</strong><span>疑惑${p.suspicion}</span></div><div class="actions"><button data-suspicion="${p.id}">疑惑+1</button><button data-isolate="${p.id}">${p.isolated ? "孤立解除" : "孤立"}</button></div></div>`).join("")}</div>`;
}

function renderOnlineControls() {
  return `<label>部屋ID<input id="roomIdInput" value="${state.online.roomId || ""}" placeholder="例: island-test"></label>
  <p class="scoreline">状態: ${state.online.status}</p>
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
    <h2>漂流者</h2><div class="player-list">${state.players.map((player) => `<article class="player-card" style="--owner:${player.color}"><div class="player-head"><strong><span class="swatch"></span>${player.name}</strong><button data-identity="${player.id}">正体確認</button></div><div class="chips"><span class="chip">${player.role}</span><span class="chip ${player.acted ? "gold" : ""}">${player.acted ? "移動済" : "未移動"}</span><span class="chip ${player.isolated ? "danger" : ""}">${player.isolated ? "孤立" : "協力可"}</span><span class="chip">疑惑${player.suspicion}</span></div></article>`).join("")}</div>${renderLog()}`;
}

function renderLog() {
  return `<div class="log">${state.log.map((entry) => `<p>${entry}</p>`).join("")}</div>`;
}

function render() {
  roundLabel.textContent = state.turn;
  document.querySelectorAll("[data-phase]").forEach((button) => button.classList.toggle("active", button.dataset.phase === state.phase));
  renderPhase();
  renderPlayers();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tile = target.closest("[data-tile]");
  if (target.dataset.phase) changePhase(target.dataset.phase);
  if (target.dataset.phaseNext) changePhase(target.dataset.phaseNext);
  if (tile instanceof HTMLElement) moveSelected(tile.dataset.tile);
  if (target.dataset.identity) showIdentity(target.dataset.identity);
  if (target.dataset.actionPlayer) doTileAction(target.dataset.actionPlayer);
  if (target.dataset.adjust) {
    const [path, amount] = target.dataset.adjust.split(":");
    adjust(path, Number(amount));
  }
  if (target.dataset.suspicion) {
    const player = state.players.find((p) => p.id === target.dataset.suspicion);
    player.suspicion += 1;
    saveAndRender();
  }
  if (target.dataset.isolate) {
    const player = state.players.find((p) => p.id === target.dataset.isolate);
    player.isolated = !player.isolated;
    saveAndRender();
  }
  if (target.dataset.night) triggerNight(target.dataset.night);
  if (target.dataset.damageBridge) damageBridge(target.dataset.damageBridge);
  if (target.dataset.action === "nextTurn") nextTurn();
  if (target.dataset.action === "export") exportState();
  if (target.dataset.action === "import") importState(document.querySelector("#shareCode").value);
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

function changePhase(phase) {
  state.phase = phase;
  render();
}

document.querySelector("#startGame").addEventListener("click", startGame);
document.querySelector("#closeIdentity").addEventListener("click", () => identityDialog.close());
playerCount.addEventListener("change", renderNameFields);
renderNameFields();
