const terrainInfo = {
  forest: { label: "森", resource: "wood", resourceLabel: "木材", icon: "木", color: "#2f7d5a" },
  hill: { label: "丘陵", resource: "brick", resourceLabel: "レンガ", icon: "土", color: "#a95b3c" },
  field: { label: "麦畑", resource: "grain", resourceLabel: "麦", icon: "麦", color: "#c99a35" },
  pasture: { label: "牧草地", resource: "wool", resourceLabel: "羊毛", icon: "羊", color: "#6f9e5f" },
  mountain: { label: "山地", resource: "ore", resourceLabel: "鉱石", icon: "鉱", color: "#737985" },
  desert: { label: "砂漠", resource: "", resourceLabel: "なし", icon: "砂", color: "#b99a69" },
};

const resourceLabels = {
  wood: "木材",
  brick: "レンガ",
  grain: "麦",
  wool: "羊毛",
  ore: "鉱石",
};

const layoutRows = [3, 4, 5, 4, 3];
const terrains = [
  "forest", "forest", "forest", "forest",
  "hill", "hill", "hill",
  "field", "field", "field", "field",
  "pasture", "pasture", "pasture", "pasture",
  "mountain", "mountain", "mountain",
  "desert",
];
const numberTokens = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];
const colors = ["#2f7d5a", "#b84f43", "#2e68a6", "#7b5bbb"];

const state = {
  turn: 1,
  currentPlayer: 0,
  lastRoll: null,
  players: [],
  map: [],
  robberTileId: "",
  selectedTileId: "",
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

function createMap(random) {
  const terrainDeck = shuffle(terrains, random);
  const numbers = shuffle(numberTokens, random);
  let tileIndex = 0;
  let numberIndex = 0;
  return layoutRows.flatMap((length, row) => Array.from({ length }, (_, col) => {
    const terrain = terrainDeck[tileIndex];
    const id = `t${row}-${col}`;
    tileIndex += 1;
    return {
      id,
      row,
      col,
      terrain,
      number: terrain === "desert" ? null : numbers[numberIndex++],
      building: null,
      roads: [],
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
  const names = [...document.querySelectorAll("[data-name-input]")].map((input, i) => input.value.trim() || `P${i + 1}`);
  state.map = createMap(random);
  state.robberTileId = state.map.find((tile) => tile.terrain === "desert")?.id || state.map[0].id;
  state.players = names.slice(0, count).map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    color: colors[i],
    resources: { wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 },
    roads: 0,
    settlements: 0,
    cities: 0,
    devCards: 0,
  }));
  state.turn = 1;
  state.currentPlayer = 0;
  state.lastRoll = null;
  state.selectedTileId = state.map[0].id;
  state.log = ["ゲーム開始。初期配置として各プレイヤーは開拓地2つ・道2本を自由に置いてください。"];
  setupPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  saveAndRender();
}

function currentPlayer() {
  return state.players[state.currentPlayer];
}

function selectedTile() {
  return state.map.find((tile) => tile.id === state.selectedTileId) || state.map[0];
}

function addLog(text) {
  state.log.unshift(`T${state.turn}: ${text}`);
  state.log = state.log.slice(0, 80);
  saveAndRender();
}

function resourceText(resources) {
  return Object.entries(resourceLabels).map(([key, label]) => `${label}${resources[key] || 0}`).join(" / ");
}

function canAfford(cost) {
  const player = currentPlayer();
  return Object.entries(cost).every(([key, amount]) => player.resources[key] >= amount);
}

function pay(cost) {
  const player = currentPlayer();
  Object.entries(cost).forEach(([key, amount]) => {
    player.resources[key] -= amount;
  });
}

function grant(player, resource, amount = 1) {
  if (!resource) return;
  player.resources[resource] += amount;
}

function rollDice() {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const total = d1 + d2;
  state.lastRoll = { d1, d2, total };
  if (total === 7) {
    addLog(`${currentPlayer().name} が ${d1}+${d2}=7 を出した。盗賊を好きなタイルへ移動してください。`);
    return;
  }
  const gains = [];
  state.map.filter((tile) => tile.number === total && tile.id !== state.robberTileId).forEach((tile) => {
    if (!tile.building) return;
    const owner = state.players[tile.building.owner];
    const amount = tile.building.type === "city" ? 2 : 1;
    grant(owner, terrainInfo[tile.terrain].resource, amount);
    gains.push(`${owner.name}+${terrainInfo[tile.terrain].resourceLabel}${amount}`);
  });
  addLog(`${currentPlayer().name} が ${d1}+${d2}=${total} を出した。${gains.length ? gains.join("、") : "産出なし。"}`);
}

function buildSettlement() {
  const tile = selectedTile();
  if (!tile || tile.building || tile.terrain === "desert") return;
  const player = currentPlayer();
  const freeInitial = player.settlements < 2;
  const cost = { wood: 1, brick: 1, grain: 1, wool: 1 };
  if (!freeInitial && !canAfford(cost)) return;
  if (!freeInitial) pay(cost);
  tile.building = { owner: state.currentPlayer, type: "settlement" };
  player.settlements += 1;
  addLog(`${player.name} が ${terrainInfo[tile.terrain].label} に開拓地を建てた。`);
}

function buildCity() {
  const tile = selectedTile();
  if (!tile?.building || tile.building.owner !== state.currentPlayer || tile.building.type !== "settlement") return;
  const cost = { grain: 2, ore: 3 };
  if (!canAfford(cost)) return;
  pay(cost);
  tile.building.type = "city";
  const player = currentPlayer();
  player.cities += 1;
  addLog(`${player.name} が開拓地を街に発展させた。`);
}

function buildRoad() {
  const tile = selectedTile();
  if (!tile) return;
  const player = currentPlayer();
  const freeInitial = player.roads < 2;
  const cost = { wood: 1, brick: 1 };
  if (!freeInitial && !canAfford(cost)) return;
  if (!freeInitial) pay(cost);
  if (!tile.roads.includes(state.currentPlayer)) tile.roads.push(state.currentPlayer);
  player.roads += 1;
  addLog(`${player.name} が ${terrainInfo[tile.terrain].label} 周辺に道を伸ばした。`);
}

function buyDevCard() {
  const cost = { grain: 1, wool: 1, ore: 1 };
  if (!canAfford(cost)) return;
  pay(cost);
  currentPlayer().devCards += 1;
  addLog(`${currentPlayer().name} が発展カードを購入した。`);
}

function moveRobber() {
  const tile = selectedTile();
  if (!tile) return;
  state.robberTileId = tile.id;
  addLog(`盗賊が ${terrainInfo[tile.terrain].label} に移動した。`);
}

function giveResource(resource) {
  grant(currentPlayer(), resource, 1);
  addLog(`${currentPlayer().name} に ${resourceLabels[resource]} を1つ追加した。`);
}

function nextTurn() {
  const winner = state.players.find((player) => victoryPoints(player) >= 10);
  if (winner) {
    addLog(`${winner.name} が10点に到達して勝利！`);
    return;
  }
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  if (state.currentPlayer === 0) state.turn += 1;
  state.lastRoll = null;
  saveAndRender();
}

function victoryPoints(player) {
  return player.settlements + player.cities + player.devCards;
}

function renderPhase() {
  phasePanel.innerHTML = `<div class="dashboard">
    <section class="tool-panel map-panel">
      <div class="panel-head">
        <div><h2>カタン島</h2><p>タイルを選んで建設します。数字が出ると、そのタイルに建物を持つプレイヤーが資源を得ます。</p></div>
        <button class="primary" data-action="roll">ダイスを振る</button>
      </div>
      ${renderMap()}
    </section>
    <section class="tool-panel">
      <div class="panel-head"><div><h2>建設</h2><p>初期配置の開拓地2つ・道2本は無料です。その後は通常コストを支払います。</p></div></div>
      ${renderBuildControls()}
    </section>
    <section class="tool-panel">
      <div class="panel-head"><div><h2>補助操作</h2><p>試作プレイ用に資源追加と盗賊移動を手動で行えます。</p></div></div>
      ${renderHelperControls()}
    </section>
  </div>`;
}

function renderMap() {
  let index = 0;
  return `<div class="map-wrap large-map">${layoutRows.map((length) => {
    const tiles = state.map.slice(index, index + length);
    index += length;
    return `<div class="hex-row row-${length}">${tiles.map(renderTile).join("")}</div>`;
  }).join("")}</div>`;
}

function renderTile(tile) {
  const info = terrainInfo[tile.terrain];
  const selected = tile.id === state.selectedTileId;
  const building = tile.building ? state.players[tile.building.owner] : null;
  return `<button class="hex ${tile.terrain} ${selected ? "selected" : ""}" data-tile="${tile.id}" style="background:${info.color}">
    <strong>${info.icon}</strong>
    <small>${info.label}</small>
    ${tile.number ? `<span class="hex-num ${tile.number === 6 || tile.number === 8 ? "hot" : ""}">${tile.number}</span>` : ""}
    ${state.robberTileId === tile.id ? `<span class="robber">盗</span>` : ""}
    ${building ? `<span class="building ${tile.building.type}" style="--owner:${building.color}">${tile.building.type === "city" ? "街" : "村"}</span>` : ""}
    ${tile.roads.length ? `<span class="road-mark">${tile.roads.map((owner) => state.players[owner].name.slice(0, 1)).join("")}</span>` : ""}
  </button>`;
}

function renderBuildControls() {
  const tile = selectedTile();
  return `<div class="selected-line">選択中: <strong>${terrainInfo[tile.terrain].label}</strong>${tile.number ? ` / 数字 ${tile.number}` : ""}</div>
  <div class="controls">
    <button data-action="buildSettlement">開拓地を建てる<br><small>木材+レンガ+麦+羊毛</small></button>
    <button data-action="buildRoad">道を伸ばす<br><small>木材+レンガ</small></button>
    <button data-action="buildCity">街にする<br><small>麦2+鉱石3</small></button>
    <button data-action="buyDev">発展カード<br><small>麦+羊毛+鉱石</small></button>
    <button class="primary" data-action="nextTurn">ターン終了</button>
  </div>`;
}

function renderHelperControls() {
  return `<div class="controls">
    ${Object.entries(resourceLabels).map(([key, label]) => `<button data-resource="${key}">${label}+1</button>`).join("")}
    <button data-action="moveRobber">盗賊を選択タイルへ</button>
  </div>`;
}

function renderPlayers() {
  const roll = state.lastRoll ? `${state.lastRoll.d1}+${state.lastRoll.d2}=${state.lastRoll.total}` : "未ロール";
  playersPanel.innerHTML = `<h2>状況</h2>
    <p class="scoreline">手番: <strong>${currentPlayer().name}</strong></p>
    <p class="scoreline">ダイス: ${roll}</p>
    <h2>プレイヤー</h2>
    <div class="player-list">${state.players.map((player, index) => `<article class="player-card ${index === state.currentPlayer ? "active-player" : ""}" style="--owner:${player.color}">
      <div class="player-head"><strong><span class="swatch"></span>${player.name}</strong><span class="chip gold">${victoryPoints(player)}点</span></div>
      <div class="chips"><span class="chip">開拓地${player.settlements}</span><span class="chip">街${player.cities}</span><span class="chip">道${player.roads}</span><span class="chip">発展${player.devCards}</span></div>
      <p class="resource-line">${resourceText(player.resources)}</p>
    </article>`).join("")}</div>
    ${renderLog()}`;
}

function renderLog() {
  return `<div class="log">${state.log.map((entry) => `<p>${entry}</p>`).join("")}</div>`;
}

function render() {
  roundLabel.textContent = state.turn;
  renderPhase();
  renderPlayers();
}

function plainState() {
  return {
    turn: state.turn,
    currentPlayer: state.currentPlayer,
    lastRoll: state.lastRoll,
    players: state.players,
    map: state.map,
    robberTileId: state.robberTileId,
    selectedTileId: state.selectedTileId,
    log: state.log,
  };
}

function applyState(data) {
  Object.assign(state, data);
}

function saveAndRender() {
  localStorage.setItem("simple-catan-state", JSON.stringify(plainState()));
  render();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tile = target.closest("[data-tile]");
  if (tile instanceof HTMLElement) {
    state.selectedTileId = tile.dataset.tile;
    saveAndRender();
  }
  if (target.dataset.action === "roll") rollDice();
  if (target.dataset.action === "buildSettlement") buildSettlement();
  if (target.dataset.action === "buildRoad") buildRoad();
  if (target.dataset.action === "buildCity") buildCity();
  if (target.dataset.action === "buyDev") buyDevCard();
  if (target.dataset.action === "moveRobber") moveRobber();
  if (target.dataset.action === "nextTurn") nextTurn();
  if (target.dataset.resource) giveResource(target.dataset.resource);
});

document.querySelector("#startGame").addEventListener("click", startGame);
playerCount.addEventListener("change", renderNameFields);
renderNameFields();
