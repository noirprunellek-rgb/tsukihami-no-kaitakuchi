const rolesByCount = {
  4: ["占星術師", "番人", "商人", "測量士"],
  5: ["占星術師", "番人", "商人", "測量士", "長老"],
};

const roleText = {
  占星術師: "夜に1人を調査し、月喰みかどうかを確認します。",
  番人: "夜に1人または地形1つを守り、妨害を無効化します。",
  商人: "昼に交易が成立したとき、銀行から任意資源1枚を得ます。",
  測量士: "自分の手番に1回、道の建設コストを1資源軽減します。",
  長老: "投票時、自分の票を2票として扱えます。",
};

const terrainInfo = {
  forest: { label: "森", resource: "木材", icon: "木", color: "#2f7d5a" },
  hill: { label: "丘陵", resource: "レンガ", icon: "煉", color: "#b55a3c" },
  field: { label: "麦畑", resource: "麦", icon: "麦", color: "#d0a13d" },
  pasture: { label: "牧草地", resource: "羊", icon: "羊", color: "#6f9e5f" },
  mountain: { label: "山地", resource: "鉱石", icon: "鉱", color: "#737985" },
  desert: { label: "荒野", resource: "なし", icon: "月", color: "#b99a69" },
};

const layoutRows = [3, 4, 5, 4, 3];
const terrainDeck = [
  "forest", "forest", "forest", "forest",
  "hill", "hill", "hill",
  "field", "field", "field", "field",
  "pasture", "pasture", "pasture", "pasture",
  "mountain", "mountain", "mountain",
  "desert",
];
const numberDeck = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const state = {
  round: 1,
  phase: "map",
  players: [],
  log: [],
  dice: [1, 1],
  map: [],
  selectedPlayerId: "",
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
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function createMap(random) {
  const terrains = shuffle(terrainDeck, random);
  const numbers = shuffle(numberDeck, random);
  let terrainIndex = 0;
  let numberIndex = 0;
  return layoutRows.flatMap((length, row) => Array.from({ length }, (_, col) => {
    const terrain = terrains[terrainIndex++];
    return {
      id: `t${row}-${col}`,
      row,
      col,
      terrain,
      number: terrain === "desert" ? null : numbers[numberIndex++],
      blocked: false,
      ownerId: "",
      building: "",
    };
  }));
}

function renderNameFields() {
  const count = Number(playerCount.value);
  nameFields.innerHTML = "";
  for (let index = 0; index < count; index += 1) {
    const label = document.createElement("label");
    label.textContent = `プレイヤー${index + 1}`;
    const input = document.createElement("input");
    input.value = `P${index + 1}`;
    input.dataset.nameInput = "true";
    label.append(input);
    nameFields.append(label);
  }
}

function addLog(text) {
  state.log.unshift(`R${state.round}: ${text}`);
  render();
}

function startGame() {
  const count = Number(playerCount.value);
  const random = seededRandom(`${seedInput.value}-${Date.now()}`);
  const identities = shuffle(["月喰み", ...Array(count - 1).fill("村側")], random);
  const roles = shuffle(rolesByCount[count], random);
  const names = [...document.querySelectorAll("[data-name-input]")].map((input, index) => input.value.trim() || `P${index + 1}`);

  state.players = names.map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    color: ["#2f7d5a", "#b84f43", "#2e68a6", "#7b5bbb", "#c28a21"][index],
    identity: identities[index],
    role: roles[index],
    points: 2,
    suspicion: 0,
    weakened: false,
    protected: false,
  }));
  state.selectedPlayerId = state.players[0].id;
  state.map = createMap(random);
  state.round = 1;
  state.phase = "map";
  state.log = ["ゲーム開始。マップ上の地形をクリックすると建設、封鎖、解除ができます。"];
  setupPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  render();
}

function showIdentity(playerId) {
  const player = state.players.find((item) => item.id === playerId);
  document.querySelector("#identityOwner").textContent = player.name;
  document.querySelector("#identityTitle").textContent = `${player.identity} / ${player.role}`;
  document.querySelector("#identityText").textContent = player.identity === "月喰み"
    ? "あなたは月喰みです。正体を隠し、妨害と誘導で村の開拓力を削ってください。"
    : `あなたは村側です。${roleText[player.role]}`;
  identityDialog.showModal();
}

function rollDice() {
  state.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  const total = state.dice[0] + state.dice[1];
  const producing = state.map.filter((tile) => tile.number === total && !tile.blocked && tile.terrain !== "desert");
  const summary = producing.length ? producing.map((tile) => terrainInfo[tile.terrain].resource).join("、") : "資源なし";
  addLog(`ダイスは ${total}。生産候補: ${summary}`);
}

function changePhase(phase) {
  state.phase = phase;
  render();
}

function adjustPlayer(playerId, key, amount) {
  const player = state.players.find((item) => item.id === playerId);
  player[key] = Math.max(0, player[key] + amount);
  saveLocal();
  render();
}

function toggleWeakened(playerId) {
  const player = state.players.find((item) => item.id === playerId);
  player.weakened = !player.weakened;
  saveLocal();
  addLog(`${player.name}は${player.weakened ? "弱体化した" : "弱体化から戻った"}。`);
}

function nextRound() {
  state.round += 1;
  state.phase = "morning";
  state.players.forEach((player) => { player.protected = false; });
  state.map.forEach((tile) => { tile.blocked = false; });
  saveLocal();
  addLog("次のラウンドへ。封鎖と保護を解除しました。");
}

function cycleTile(tileId) {
  const tile = state.map.find((item) => item.id === tileId);
  if (!tile) return;
  if (!tile.ownerId) {
    tile.ownerId = state.selectedPlayerId;
    tile.building = "開拓地";
  } else if (tile.building === "開拓地") {
    tile.building = "街";
  } else {
    tile.ownerId = "";
    tile.building = "";
  }
  saveLocal();
  render();
}

function toggleTileBlocked(tileId) {
  const tile = state.map.find((item) => item.id === tileId);
  tile.blocked = !tile.blocked;
  saveLocal();
  render();
}

function exportState() {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
    round: state.round,
    players: state.players,
    map: state.map,
    dice: state.dice,
    log: state.log.slice(0, 20),
  }))));
  navigator.clipboard?.writeText(payload);
  addLog("盤面コードをコピーしました。別端末の共有タブに貼ると同じ状態を読み込めます。");
}

function importState(value) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(value.trim()))));
    state.round = data.round || 1;
    state.players = data.players || [];
    state.map = data.map || [];
    state.dice = data.dice || [1, 1];
    state.log = data.log || ["盤面コードを読み込みました。"];
    state.selectedPlayerId = state.players[0]?.id || "";
    state.phase = "map";
    setupPanel.classList.add("hidden");
    gamePanel.classList.remove("hidden");
    saveLocal();
    render();
  } catch {
    addLog("盤面コードを読み込めませんでした。");
  }
}

function saveLocal() {
  localStorage.setItem("tsukihami-state", JSON.stringify(state));
}

function renderPhase() {
  const phaseMap = {
    map: {
      title: "マップ: 資源島",
      body: "地形をクリックすると選択中プレイヤーの開拓地、街、空き地の順で切り替わります。封鎖は右側のボタンで管理します。",
      content: renderMap(),
      buttons: renderMapTools(),
    },
    morning: {
      title: "朝: 生産",
      body: "ダイスを振り、該当地形に接する開拓地・街から資源を得ます。封鎖された地形は資源を出しません。",
      content: `<div class="dice"><div class="die">${state.dice[0]}</div><div class="die">${state.dice[1]}</div><strong>合計 ${state.dice[0] + state.dice[1]}</strong></div>`,
      buttons: `<button class="primary" data-action="roll">ダイスを振る</button><button data-phase-next="day">昼へ</button>`,
    },
    day: {
      title: "昼: 交易と建設",
      body: "交易、建設、疑惑トークン配置を行います。マップタブで建設状況を反映できます。",
      content: renderPlayerControls("points", "勝利点"),
      buttons: `<button data-phase-next="vote">投票へ</button>`,
    },
    vote: {
      title: "投票: 追放と弱体化",
      body: "最多票のプレイヤーを弱体化します。疑惑トークン3個につき追加票1として数えます。",
      content: renderPlayerControls("suspicion", "疑惑"),
      buttons: `<button data-phase-next="night">夜へ</button>`,
    },
    night: {
      title: "夜: 役職と妨害",
      body: "月喰みの妨害、占星術師の調査、番人の保護を処理します。地形封鎖はマップタブで指定できます。",
      content: `<div class="controls">${state.players.map((player) => `<button data-protect="${player.id}">${player.name}を守る</button>`).join("")}</div>`,
      buttons: `<button class="primary" data-action="nextRound">夜明け、次ラウンドへ</button>`,
    },
    online: {
      title: "共有: オンライン化の入口",
      body: "今はGitHub Pages上で動く共有コード方式です。リアルタイム同期を入れる場合は、この状態データを部屋サーバーに保存します。",
      content: `<textarea id="shareCode" class="share-code" placeholder="盤面コードを貼り付け"></textarea>`,
      buttons: `<button class="primary" data-action="export">盤面コードをコピー</button><button data-action="import">盤面コードを読み込む</button>`,
    },
    status: {
      title: "状況: 勝利条件確認",
      body: "村側は合計点到達かつ月喰み追放済みで勝利。月喰みは本人点、誤追放、未発見逃げ切りを狙います。",
      content: renderLog(),
      buttons: `<button data-phase-next="map">マップへ戻る</button>`,
    },
  };

  const current = phaseMap[state.phase];
  phasePanel.innerHTML = `
    <div class="phase-card">
      <div>
        <h2>${current.title}</h2>
        <p>${current.body}</p>
      </div>
      ${current.content}
      <div class="actions">${current.buttons}</div>
    </div>
  `;
}

function renderMap() {
  let tileIndex = 0;
  return `<div class="map-wrap">${layoutRows.map((length, row) => {
    const tiles = state.map.slice(tileIndex, tileIndex + length);
    tileIndex += length;
    return `<div class="hex-row row-${length}">${tiles.map(renderTile).join("")}</div>`;
  }).join("")}</div>`;
}

function renderTile(tile) {
  const info = terrainInfo[tile.terrain];
  const owner = state.players.find((player) => player.id === tile.ownerId);
  const ownerStyle = owner ? `style="--owner:${owner.color}"` : "";
  return `
    <div class="hex ${tile.terrain} ${tile.blocked ? "blocked" : ""}" data-tile="${tile.id}" ${ownerStyle}>
      <span class="hex-num">${tile.number || "-"}</span>
      <strong>${info.icon}</strong>
      <small>${info.resource}</small>
      ${owner ? `<em>${owner.name} ${tile.building}</em>` : ""}
    </div>
  `;
}

function renderMapTools() {
  return `
    <label class="select-player">建設する人
      <select id="selectedPlayer">
        ${state.players.map((player) => `<option value="${player.id}" ${player.id === state.selectedPlayerId ? "selected" : ""}>${player.name}</option>`).join("")}
      </select>
    </label>
    <div class="controls">
      ${state.map.map((tile) => `<button data-block="${tile.id}">${tile.number || "-"} ${terrainInfo[tile.terrain].label} ${tile.blocked ? "封鎖解除" : "封鎖"}</button>`).join("")}
    </div>
  `;
}

function renderPlayerControls(key, label) {
  return `
    <div class="controls">
      ${state.players.map((player) => `
        <div class="player-card">
          <div class="player-head"><strong>${player.name}</strong><span>${label}: ${player[key]}</span></div>
          <div class="actions">
            <button data-adjust="${player.id}:${key}:-1">-</button>
            <button data-adjust="${player.id}:${key}:1">+</button>
            <button data-weaken="${player.id}">${player.weakened ? "弱体化解除" : "弱体化"}</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLog() {
  return `<div class="log">${state.log.map((entry) => `<p>${entry}</p>`).join("")}</div>`;
}

function renderPlayers() {
  const villagePoints = state.players.reduce((sum, player) => sum + player.points, 0);
  playersPanel.innerHTML = `
    <h2>プレイヤー</h2>
    <p class="scoreline">合計 ${villagePoints}点 / 目標 ${state.players.length === 5 ? 27 : 22}点</p>
    <div class="player-list">
      ${state.players.map((player) => `
        <article class="player-card" style="--owner:${player.color}">
          <div class="player-head">
            <strong><span class="swatch"></span>${player.name}</strong>
            <button data-identity="${player.id}">正体確認</button>
          </div>
          <div class="chips">
            <span class="chip gold">${player.points}点</span>
            <span class="chip ${player.suspicion >= 3 ? "danger" : ""}">疑惑${player.suspicion}</span>
            <span class="chip">${player.role}</span>
            ${player.weakened ? `<span class="chip danger">弱体化</span>` : ""}
            ${player.protected ? `<span class="chip">保護</span>` : ""}
          </div>
        </article>
      `).join("")}
    </div>
    ${renderLog()}
  `;
}

function render() {
  roundLabel.textContent = state.round;
  document.querySelectorAll("[data-phase]").forEach((button) => {
    button.classList.toggle("active", button.dataset.phase === state.phase);
  });
  renderPhase();
  renderPlayers();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tileTarget = target.closest("[data-tile]");
  if (target.dataset.phase) changePhase(target.dataset.phase);
  if (target.dataset.phaseNext) changePhase(target.dataset.phaseNext);
  if (target.dataset.identity) showIdentity(target.dataset.identity);
  if (target.dataset.weaken) toggleWeakened(target.dataset.weaken);
  if (tileTarget instanceof HTMLElement) cycleTile(tileTarget.dataset.tile);
  if (target.dataset.block) toggleTileBlocked(target.dataset.block);
  if (target.dataset.adjust) {
    const [playerId, key, amount] = target.dataset.adjust.split(":");
    adjustPlayer(playerId, key, Number(amount));
  }
  if (target.dataset.protect) {
    const player = state.players.find((item) => item.id === target.dataset.protect);
    player.protected = !player.protected;
    saveLocal();
    render();
  }
  if (target.dataset.action === "roll") rollDice();
  if (target.dataset.action === "nextRound") nextRound();
  if (target.dataset.action === "export") exportState();
  if (target.dataset.action === "import") importState(document.querySelector("#shareCode").value);
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.id === "selectedPlayer") {
    state.selectedPlayerId = target.value;
    saveLocal();
  }
});

document.querySelector("#startGame").addEventListener("click", startGame);
document.querySelector("#closeIdentity").addEventListener("click", () => identityDialog.close());
playerCount.addEventListener("change", renderNameFields);
renderNameFields();
