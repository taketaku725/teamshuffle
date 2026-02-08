const app = document.getElementById("app");
const toTopBtn = document.getElementById("toTop");
const STORAGE_KEY = "member-shuffler-state";

const state = {
  screen: "members", // members | teams | result
  members: [],
  teams: [],
  fixedAssignments: [],
  result: null, // ← 初期は null（未シャッフル）
  error: "",
  isShuffling: false,
  shuffleTimer: null,
  stopCountdown: 0,
};

// ---------- save ----------
function saveState() {
  const data = {
    members: state.members
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    state.members = data.members || [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ---------- util ----------
function uid(p) {
  return p + "_" + Math.random().toString(36).slice(2, 8);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function teamName(team, i) {
  return team.name?.trim() || `チーム${i + 1}`;
}

// ---------- render ----------
function render() {
  app.innerHTML = "";
  if (state.error) {
    app.innerHTML += `<div class="error">${state.error}</div>`;
  }

  ({
    members: renderMembers,
    teams: renderTeams,
    result: renderResult
  })[state.screen]();
}

// ---------- screens ----------
function renderMembers() {
  app.innerHTML += `
    <div class="section">
      <input id="nameInput" placeholder="名前を入力" onkeydown="onEnter(event)" />
      <button onclick="addMember()">追加</button>
      <button onclick="go('teams')">次へ</button>
    </div>
    ${state.members.map(m => `
      <div class="card">
        ${m.name}
        <button onclick="removeMember('${m.id}')">×</button>
      </div>
    `).join("")}
  `;
}

function renderTeams() {
  app.innerHTML += `
    <div class="section">
      <button onclick="removeTeam()">−</button>
      <button onclick="addTeam()">＋</button>
      <div>メンバー数：${state.members.length} 人</div>
    </div>

    ${state.teams.map((t, i) => `
      <div class="card">
        <input placeholder="チーム名"
          value="${t.name}"
          onchange="setTeamName('${t.id}', this.value)" />
        <div>
          <button onclick="changeCap('${t.id}', -1)">−</button>
          ${t.capacity}
          <button onclick="changeCap('${t.id}', 1)">＋</button>
        </div>
      </div>
    `).join("")}

    <button onclick="goResult()">シャッフル画面へ</button>
  `;
}

function renderResult() {
  app.innerHTML += `
    <div class="section">
      ${state.isShuffling
        ? `<button onclick="stopShuffle()">ストップ</button>`
        : `<button onclick="startShuffle()">シャッフル</button>`
      }
      <button onclick="resetResult()">リセット</button>
    </div>
  `;


  state.teams.forEach((t, i) => {
    const fixed = state.fixedAssignments
      .filter(f => f.teamId === t.id)
      .map(f => f.memberId);

    const available = state.members.filter(m =>
      !state.fixedAssignments.some(f => f.memberId === m.id)
    );

    app.innerHTML += `
      <div class="team">
        <h3>${teamName(t, i)}</h3>

        ${state.result === null && fixed.length ? `
          <div class="card fixed">
            <strong>固定メンバー</strong>
            ${fixed.map(mid => {
              const m = state.members.find(x => x.id === mid);
              return `
                <div class="fixed-item">
                  ${m.name}
                  <button class="secondary"
                    onclick="unfix('${mid}')">解除</button>
                </div>
              `;
            }).join("")}
          </div>
        ` : ""}

        ${state.result === null && !state.isShuffling ? `
          <select onchange="fixToTeam('${t.id}', this.value)">
            <option value="">固定メンバーを選択</option>
            ${available.map(m =>
              `<option value="${m.id}">${m.name}</option>`
            ).join("")}
          </select>
        ` : ""}

        ${(state.result?.[t.id] || []).map(mid =>
          `<div>${state.members.find(m => m.id === mid).name}</div>`
        ).join("")}
      </div>
    `;
  });
}

// ---------- navigation ----------
function go(screen) {
  state.screen = screen;
  state.error = "";
  if (screen === "result") state.result = null;
  render();
}

toTopBtn.onclick = () => go("members");

// ---------- members ----------
function onEnter(e) {
  if (e.key === "Enter") addMember();
}

function addMember() {
  const input = document.getElementById("nameInput");
  const name = input.value.trim();
  if (!name) return;

  if (state.members.some(m => m.name === name)) {
    state.error = "その名前はすでに使われています。";
    render();
    return;
  }

  state.members.push({ id: uid("m"), name });
  input.value = "";
  saveState();
  render();
}

function removeMember(id) {
  state.members = state.members.filter(m => m.id !== id);
  state.fixedAssignments = state.fixedAssignments.filter(f => f.memberId !== id);
  saveState();
  render();
}

// ---------- teams ----------
function addTeam() {
  if (state.teams.length >= state.members.length) {
    state.error = "チーム数はメンバー数を超えられません";
    render();
    return;
  }

  state.teams.push({
    id: uid("t"),
    name: "",
    capacity: 1   // ← 初期1人
  });
  render();
}

function removeTeam() {
  if (!state.teams.length) return;
  const t = state.teams.pop();
  state.fixedAssignments = state.fixedAssignments.filter(f => f.teamId !== t.id);
  render();
}

function setTeamName(id, name) {
  state.teams.find(t => t.id === id).name = name;
}

function changeCap(id, diff) {
  const t = state.teams.find(t => t.id === id);
  t.capacity = Math.max(1, t.capacity + diff); // ← 最低1
  render();
}

// ---------- fixed ----------
function fixToTeam(teamId, memberId) {
  if (!memberId) return;

  // 先に既存固定を除去
  state.fixedAssignments =
    state.fixedAssignments.filter(f => f.memberId !== memberId);

  // その上で追加
  state.fixedAssignments.push({ teamId, memberId });

  const team = state.teams.find(t => t.id === teamId);
  const fixedCount = state.fixedAssignments.filter(f => f.teamId === teamId).length;

  if (fixedCount > team.capacity) {
    // ロールバック
    state.fixedAssignments.pop();
    state.error = "このチームはこれ以上固定できません";
    render();
    return;
  }

  state.error = "";
  render();
}


function unfix(memberId) {
  state.fixedAssignments = state.fixedAssignments.filter(f => f.memberId !== memberId);
  render();
}

// ---------- shuffle ----------
function createShuffledResult() {
  const res = {};
  state.teams.forEach(t => res[t.id] = []);

  state.fixedAssignments.forEach(f => res[f.teamId].push(f.memberId));

  const fixedIds = new Set(state.fixedAssignments.map(f => f.memberId));
  const free = shuffle(
    state.members.filter(m => !fixedIds.has(m.id)).map(m => m.id)
  );

  state.teams.forEach(t => {
    while (res[t.id].length < t.capacity) {
      res[t.id].push(free.shift());
    }
  });

  return res;
}

function resetResult() {
  if (state.isShuffling) {
    clearInterval(state.shuffleTimer);
    state.shuffleTimer = null;
  }
  state.isShuffling = false;
  state.stopCountdown = 0;
  state.result = null;
  state.error = "";
  render();
}

// ---------- シャッフル画面移動 ----------
function goResult() {
  const totalCap = state.teams.reduce((s, t) => s + t.capacity, 0);

  if (totalCap !== state.members.length) {
    state.error = "メンバー数とチーム人数の合計が一致していません";
    render();
    return;
  }

  state.screen = "result";
  state.error = "";
  state.result = null; // 初回は未シャッフル
  render();
}

function startShuffle() {
  if (state.isShuffling) return;

  state.error = "";
  state.isShuffling = true;
  state.stopCountdown = 0;

  runShuffleLoop();
}

function stopShuffle() {
  if (!state.isShuffling) return;

  state.stopCountdown = 3;
}

function runShuffleLoop() {
  if (!state.isShuffling) return;

  // シャッフル実行
  state.result = createShuffledResult();
  render();

  // 次の待ち時間を決める
  let delay = 200; // 通常速度

  if (state.stopCountdown > 0) {
    if (state.stopCountdown === 3) delay = 200;
    if (state.stopCountdown === 2) delay = 350;
    if (state.stopCountdown === 1) delay = 600;

    state.stopCountdown--;

    // カウント終了 → 完全停止
    if (state.stopCountdown === 0) {
      state.isShuffling = false;
      return;
    }
  }

  state.shuffleTimer = setTimeout(runShuffleLoop, delay);
}

// 初期描画
loadState();
render();

