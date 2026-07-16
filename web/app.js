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

const state = {
  round: 1,
  phase: "morning",
  players: [],
  log: [],
  dice: [1, 1],
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
  for (let index = 0; index < seed.length; index += 1) {
    value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  }
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
    identity: identities[index],
    role: roles[index],
    points: 2,
    suspicion: 0,
    weakened: false,
    protected: false,
  }));
  state.round = 1;
  state.phase = "morning";
  state.log = ["ゲーム開始。端末を回して各自の正体を確認してください。"];
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
  addLog(`ダイスは ${state.dice[0] + state.dice[1]}。該当する地形から資源を配ります。`);
}

function changePhase(phase) {
  state.phase = phase;
  render();
}

function adjustPlayer(playerId, key, amount) {
  const player = state.players.find((item) => item.id === playerId);
  player[key] = Math.max(0, player[key] + amount);
  render();
}

function toggleWeakened(playerId) {
  const player = state.players.find((item) => item.id === playerId);
  player.weakened = !player.weakened;
  addLog(`${player.name}は${player.weakened ? "弱体化した" : "弱体化から戻った"}。`);
}

function nextRound() {
  state.round += 1;
  state.phase = "morning";
  state.players.forEach((player) => {
    player.protected = false;
  });
  addLog("次のラウンドへ。");
}

function renderPhase() {
  const phaseMap = {
    morning: {
      title: "朝: 生産",
      body: "ダイスを振り、該当地形に接する開拓地・街から資源を得ます。封鎖された地形は資源を出しません。",
      content: `<div class="dice"><div class="die">${state.dice[0]}</div><div class="die">${state.dice[1]}</div><strong>合計 ${state.dice[0] + state.dice[1]}</strong></div>`,
      buttons: `<button class="primary" data-action="roll">ダイスを振る</button><button data-phase-next="day">昼へ</button>`,
    },
    day: {
      title: "昼: 交易と建設",
      body: "各プレイヤーは交易、建設、疑惑トークン配置を行います。弱体化中の人は自由交易と発展カード購入ができません。",
      content: renderPlayerControls("points", "勝利点"),
      buttons: `<button data-phase-next="vote">投票へ</button>`,
    },
    vote: {
      title: "投票: 追放と弱体化",
      body: "最多票のプレイヤーを弱体化します。疑惑トークン3個につき追加票1として数えます。同数なら追放なしです。",
      content: renderPlayerControls("suspicion", "疑惑"),
      buttons: `<button data-phase-next="night">夜へ</button>`,
    },
    night: {
      title: "夜: 役職と妨害",
      body: "全員目を閉じます。月喰み、占星術師、番人、商人の順で処理します。結果だけ公開します。",
      content: `<div class="controls">${state.players.map((player) => `<button data-protect="${player.id}">${player.name}を守る</button>`).join("")}</div>`,
      buttons: `<button class="primary" data-action="nextRound">夜明け、次ラウンドへ</button>`,
    },
    status: {
      title: "状況: 勝利条件確認",
      body: "村側は合計点到達かつ月喰み追放済みで勝利。月喰みは本人点、誤追放、未発見逃げ切りを狙います。",
      content: renderLog(),
      buttons: `<button data-phase-next="morning">朝へ戻る</button>`,
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
  playersPanel.innerHTML = `
    <h2>プレイヤー</h2>
    <div class="player-list">
      ${state.players.map((player) => `
        <article class="player-card">
          <div class="player-head">
            <strong>${player.name}</strong>
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
  if (target.dataset.phase) changePhase(target.dataset.phase);
  if (target.dataset.phaseNext) changePhase(target.dataset.phaseNext);
  if (target.dataset.identity) showIdentity(target.dataset.identity);
  if (target.dataset.weaken) toggleWeakened(target.dataset.weaken);
  if (target.dataset.adjust) {
    const [playerId, key, amount] = target.dataset.adjust.split(":");
    adjustPlayer(playerId, key, Number(amount));
  }
  if (target.dataset.protect) {
    const player = state.players.find((item) => item.id === target.dataset.protect);
    player.protected = !player.protected;
    render();
  }
  if (target.dataset.action === "roll") rollDice();
  if (target.dataset.action === "nextRound") nextRound();
});

document.querySelector("#startGame").addEventListener("click", startGame);
document.querySelector("#closeIdentity").addEventListener("click", () => identityDialog.close());
playerCount.addEventListener("change", renderNameFields);
renderNameFields();
