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
};

const layoutRows = [4, 5, 6, 5, 4];
const terrainDeck = [
  "beach", "forest", "forest", "forest", "rock", "rock",
  "swamp", "river", "river", "hill", "hill", "cave",
  "cave", "ruin", "ruin", "wreck", "forest", "rock",
  "swamp", "river", "hill", "cave", "ruin", "wreck",
];

const state = {
  turn: 1,
  phase: "map",
  players: [],
  map: [],
  selectedPlayerId: "",
  supplies: { wood: 0, stone: 0, food: 0, herb: 0, parts: 0, clue: 0 },
  progress: { bridges: 0, repair: 0, signal: 0, route: 0, danger: 0 },
  log: [],
};

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
  for (let index = 0; index < seed.length; index += 1) value = (value * 31 + seed.charCodeAt(index)) >>> 0;
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

function createMap(random) {
  const terrains = shuffle(terrainDeck, random);
  let index = 0;
  return layoutRows.flatMap((length, row) => Array.from({ length }, (_, col) => {
    const terrain = row === 0 && col === 1 ? "beach" : terrains[index++];
    return { id: `t${row}-${col}`, row, col, terrain, bridge: false, damaged: false };
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

function addLog(text) {
  state.log.unshift(`T${state.turn}: ${text}`);
  saveLocal();
  render();
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
  state.turn = 1;
  state.phase = "map";
  state.selectedPlayerId = state.players[0].id;
  state.supplies = { wood: 0, stone: 0, food: 0, herb: 0, parts: 0, clue: 0 };
  state.progress = { bridges: 0, repair: 0, signal: 0, route: 0, danger: 0 };
  state.log = ["全員が漂着海岸に流れ着いた。島を探索して脱出条件を満たそう。"];
  setupPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  saveLocal();
  render();
}

function neighbors(tile) {
  return state.map.filter((other) => Math.abs(other.row - tile.row) <= 1 && Math.abs(other.col - tile.col) <= 1 && other.id !== tile.id);
}

function moveSelected(tileId) {
  const player = state.players.find((p) => p.id === state.selectedPlayerId);
  if (!player || player.acted) return;
  const from = state.map.find((tile) => tile.id === player.tileId);
  const to = state.map.find((tile) => tile.id === tileId);
  if (from.id !== to.id && !neighbors(from).some((tile) => tile.id === to.id)) return;
  if (to.terrain === "river" && !to.bridge) {
    player.tileId = to.id;
    player.acted = true;
    addLog(`${player.name}は川で足止めされた。橋が必要だ。`);
    return;
  }
  player.tileId = to.id;
  player.acted = true;
  addLog(`${player.name}は${tileInfo[to.terrain].label}へ移動した。`);
}

function doTileAction(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  const tile = state.map.find((t) => t.id === player.tileId);
  const terrain = tile.terrain;
  if (terrain === "forest") state.supplies.wood += 1;
  if (terrain === "rock") state.supplies.stone += 1;
  if (terrain === "swamp") state.supplies.herb += 1;
  if (terrain === "cave") { state.supplies.parts += 1; state.progress.danger += 1; }
  if (terrain === "ruin") state.supplies.clue += 1;
  if (terrain === "hill") state.progress.signal = Math.min(3, state.progress.signal + 1);
  if (terrain === "river" && !tile.bridge && state.supplies.wood >= 2 && state.supplies.stone >= 1) {
    state.supplies.wood -= 2; state.supplies.stone -= 1; tile.bridge = true; state.progress.bridges += 1;
  }
  if (terrain === "wreck" && state.supplies.wood >= 1 && state.supplies.parts >= 1) {
    state.supplies.wood -= 1; state.supplies.parts -= 1; state.progress.repair = Math.min(3, state.progress.repair + 1);
  }
  if (terrain === "ruin" && state.supplies.clue >= 2) {
    state.supplies.clue -= 2; state.progress.route = Math.min(2, state.progress.route + 1);
  }
  addLog(`${player.name}が${tileInfo[terrain].label}のアクションを実行した。`);
}

function nextTurn() {
  state.turn += 1;
  state.players.forEach((p) => { p.acted = false; });
  state.phase = "map";
  addLog("次のターンへ。全員がまた1マス移動できる。");
}

function showIdentity(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  document.querySelector("#identityOwner").textContent = player.name;
  document.querySelector("#identityTitle").textContent = `${player.identity} / ${player.role}`;
  document.querySelector("#identityText").textContent = player.identity === "月喰み"
    ? "あなたは月喰みです。橋、修理、信号、集合を遅らせて脱出を失敗させてください。"
    : `あなたは村側です。${roleText[player.role]}`;
  identityDialog.showModal();
}

function adjust(path, amount) {
  const [group, key] = path.split(".");
  state[group][key] = Math.max(0, state[group][key] + amount);
  saveLocal();
  render();
}

function exportState() {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  navigator.clipboard?.writeText(payload);
  addLog("盤面コードをコピーしました。");
}

function importState(value) {
  try {
    Object.assign(state, JSON.parse(decodeURIComponent(escape(atob(value.trim())))));
    setupPanel.classList.add("hidden");
    gamePanel.classList.remove("hidden");
    saveLocal();
    render();
  } catch {
    addLog("盤面コードを読み込めませんでした。");
  }
}

function saveLocal() {
  localStorage.setItem("tsukihami-island-state", JSON.stringify(state));
}

function renderPhase() {
  const panels = {
    map: ["島マップ", "選択中の漂流者は1ターンに1マス移動できます。川は橋がないと足止めされます。", renderMap(), `<button class="primary" data-phase-next="action">行動へ</button><button data-action="nextTurn">次ターン</button>`],
    action: ["パネルアクション", "到着したパネルに応じたアクションを実行します。同じマスにいれば物資交換した扱いにできます。", renderActionList(), `<button data-phase-next="night">夜へ</button>`],
    night: ["夜の妨害", "月喰みは物資隠し、橋の損傷、道迷い、偽の合図、噂のどれかで妨害します。ここでは数値を手動で反映します。", renderProgressControls(), `<button data-phase-next="vote">投票へ</button>`],
    vote: ["投票と孤立", "疑惑が高い相手を孤立させられます。誤孤立が増えると村側の運搬力が落ちます。", renderVoteControls(), `<button data-phase-next="map">島へ</button>`],
    online: ["共有", "現在は無料で使える共有コード方式です。リアルタイム化するなら次にFirebase無料枠を接続します。", `<textarea id="shareCode" class="share-code" placeholder="盤面コードを貼り付け"></textarea>`, `<button class="primary" data-action="export">盤面コードをコピー</button><button data-action="import">読み込む</button>`],
  };
  const [title, body, content, buttons] = panels[state.phase];
  phasePanel.innerHTML = `<div class="phase-card"><div><h2>${title}</h2><p>${body}</p></div>${content}<div class="actions">${buttons}</div></div>`;
}

function renderMap() {
  let index = 0;
  return `<label class="select-player">動かす人<select id="selectedPlayer">${state.players.map((p) => `<option value="${p.id}" ${p.id === state.selectedPlayerId ? "selected" : ""}>${p.name}</option>`).join("")}</select></label>
  <div class="map-wrap">${layoutRows.map((length) => {
    const tiles = state.map.slice(index, index + length);
    index += length;
    return `<div class="hex-row row-${length}">${tiles.map(renderTile).join("")}</div>`;
  }).join("")}</div>`;
}

function renderTile(tile) {
  const info = tileInfo[tile.terrain];
  const occupants = state.players.filter((p) => p.tileId === tile.id);
  return `<div class="hex ${tile.terrain} ${tile.damaged ? "blocked" : ""}" data-tile="${tile.id}" style="background:${info.color}">
    <strong>${info.icon}</strong><small>${info.label}</small>${tile.bridge ? "<span class=\"hex-num\">橋</span>" : ""}
    <div class="meeples">${occupants.map((p) => `<b style="background:${p.color}">${p.name.slice(0, 1)}</b>`).join("")}</div>
  </div>`;
}

function renderActionList() {
  return `<div class="controls">${state.players.map((p) => `<button data-action-player="${p.id}">${p.name}: 今いるマスの行動</button>`).join("")}</div>`;
}

function renderProgressControls() {
  const items = [["bridges", "橋"], ["repair", "船修理"], ["signal", "救難信号"], ["route", "脱出ルート"], ["danger", "危険"]];
  return `<div class="controls">${items.map(([key, label]) => `<div class="player-card"><div class="player-head"><strong>${label}</strong><span>${state.progress[key]}</span></div><div class="actions"><button data-adjust="progress.${key}:-1">-</button><button data-adjust="progress.${key}:1">+</button></div></div>`).join("")}</div>`;
}

function renderVoteControls() {
  return `<div class="controls">${state.players.map((p) => `<div class="player-card"><div class="player-head"><strong>${p.name}</strong><span>疑惑${p.suspicion}</span></div><div class="actions"><button data-suspicion="${p.id}">疑惑+1</button><button data-isolate="${p.id}">${p.isolated ? "孤立解除" : "孤立"}</button></div></div>`).join("")}</div>`;
}

function renderPlayers() {
  const p = state.progress;
  playersPanel.innerHTML = `<h2>脱出状況</h2><p class="scoreline">目標: ${state.players.length === 5 ? 9 : 10}ターン以内</p>
    <div class="chips"><span class="chip">橋 ${p.bridges}/2</span><span class="chip">修理 ${p.repair}/3</span><span class="chip">信号 ${p.signal}/3</span><span class="chip">航路 ${p.route}/2</span><span class="chip danger">危険 ${p.danger}/6</span></div>
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
    player.suspicion += 1; saveLocal(); render();
  }
  if (target.dataset.isolate) {
    const player = state.players.find((p) => p.id === target.dataset.isolate);
    player.isolated = !player.isolated; saveLocal(); render();
  }
  if (target.dataset.action === "nextTurn") nextTurn();
  if (target.dataset.action === "export") exportState();
  if (target.dataset.action === "import") importState(document.querySelector("#shareCode").value);
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === "selectedPlayer") state.selectedPlayerId = target.value;
});

function changePhase(phase) {
  state.phase = phase;
  render();
}

document.querySelector("#startGame").addEventListener("click", startGame);
document.querySelector("#closeIdentity").addEventListener("click", () => identityDialog.close());
playerCount.addEventListener("change", renderNameFields);
renderNameFields();
