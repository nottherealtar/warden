/* WARDEN — unofficial WARDOGS ops board */
(() => {
  const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const KIT = { light: 1200, hold: 2400, push: 4800, vehicle: 9000 };
  const PIN_TYPES = [
    { id: "squad", label: "SQUAD", color: "#E8B84A" },
    { id: "fob", label: "FOB", color: "#7AB0FF" },
    { id: "pallet", label: "PALLET", color: "#3DDC97" },
    { id: "aa", label: "AA", color: "#F07178" },
    { id: "push", label: "PUSH", color: "#F5A35C" },
    { id: "nofly", label: "NO-FLY", color: "#8B93A1" },
  ];
  const CALLS = [
    { id: "pull", label: "PULL HOT ZONE TO T{n}" },
    { id: "hold-brute", label: "HOLD T{n} — BRUTE LAST DIGIT" },
    { id: "need-huey", label: "NEED HUEY AT T{n}" },
    { id: "pallet-fob", label: "PALLET ON FOB" },
    { id: "aa-nofly", label: "AA UP — NO FLY NORTH" },
  ];

  const $ = (s) => document.querySelector(s);
  const clientId = localStorage.wardenId || (localStorage.wardenId = crypto.randomUUID());
  const myName = localStorage.wardenName || (localStorage.wardenName = "OP-" + Math.floor(10 + Math.random() * 89));

  let catalog = null;
  let mapDef = null;
  let mapImg = null;
  let room = null;
  let channel = null;
  let socket = null;
  let placingPin = null;
  let snapImg = null;
  let cam = { x: 80, y: 80, scale: 8 };
  let dragging = null;
  let pointer = { x: 80, y: 80 };
  let kit = { cash: 10000, life: "hold" };

  const canvas = $("#map");
  const ctx = canvas.getContext("2d");

  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.classList.add("on");
    setTimeout(() => el.classList.remove("on"), 1200);
  }
  function copy(text) {
    navigator.clipboard.writeText(text).then(() => toast("COPIED")).catch(() => toast("COPY FAILED"));
  }
  function newCode() {
    let s = "";
    for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    return s;
  }
  function emptyTowers(n, def) {
    const src = (def.towers || []).slice(0, n);
    while (src.length < n) src.push({ id: src.length + 1, x: 80, y: 80, label: "T" + (src.length + 1) });
    return src.map((t) => ({
      id: t.id, x: t.x, y: t.y, label: t.label,
      digit: null, alt: null, status: "empty",
    }));
  }
  function makeRoom(code, mapId) {
    mapDef = catalog.maps.find((m) => m.id === mapId) || catalog.maps[0];
    return {
      code,
      mapId: mapDef.id,
      towerCount: mapDef.towers.length,
      towers: emptyTowers(mapDef.towers.length, mapDef),
      pins: [],
      calls: [],
      zone: null,
      hot: null,
      members: [{ id: clientId, name: myName }],
    };
  }

  function loadMapImage() {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => { mapImg = img; fitCam(); draw(); res(); };
      img.onerror = () => { mapImg = null; draw(); res(); };
      img.src = mapDef.image;
    });
  }
  function worldToScreen(x, y) {
    const r = canvas.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    return { sx: cx + (x - cam.x) * cam.scale, sy: cy + (y - cam.y) * cam.scale };
  }
  function screenToWorld(sx, sy) {
    const r = canvas.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    return { x: cam.x + (sx - cx) / cam.scale, y: cam.y + (sy - cy) / cam.scale };
  }
  function fitCam() {
    const b = mapDef.bounds;
    const r = canvas.getBoundingClientRect();
    cam.x = (b.minX + b.maxX) / 2;
    cam.y = (b.minY + b.maxY) / 2;
    const sx = r.width / Math.max(b.maxX - b.minX, 8);
    const sy = r.height / Math.max(b.maxY - b.minY, 8);
    cam.scale = Math.min(sx, sy) * 0.92;
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, r.width * dpr);
    canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.fillStyle = "#08090b";
    ctx.fillRect(0, 0, r.width, r.height);
    if (!mapDef) return;
    const tb = mapDef.tileBounds;
    const a = worldToScreen(tb.minX, tb.minY);
    const b = worldToScreen(tb.maxX, tb.maxY);
    const w = b.sx - a.sx, h = b.sy - a.sy;
    if (mapImg) {
      ctx.imageSmoothingEnabled = cam.scale < 14;
      ctx.drawImage(mapImg, a.sx, a.sy, w, h);
      ctx.fillStyle = "rgba(8,9,11,0.28)";
      ctx.fillRect(a.sx, a.sy, w, h);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const minX = Math.floor((cam.x - r.width / cam.scale) / 10) * 10;
    const maxX = cam.x + r.width / cam.scale;
    const minY = Math.floor((cam.y - r.height / cam.scale) / 10) * 10;
    const maxY = cam.y + r.height / cam.scale;
    ctx.beginPath();
    for (let x = minX; x <= maxX; x += 10) {
      const s = worldToScreen(x, 0);
      ctx.moveTo(s.sx, 0); ctx.lineTo(s.sx, r.height);
    }
    for (let y = minY; y <= maxY; y += 10) {
      const s = worldToScreen(0, y);
      ctx.moveTo(0, s.sy); ctx.lineTo(r.width, s.sy);
    }
    ctx.stroke();
    if (snapImg) {
      ctx.globalAlpha = 0.4;
      ctx.drawImage(snapImg, a.sx, a.sy, w, h);
      ctx.globalAlpha = 1;
    }
    if (room && room.zone) {
      const z = worldToScreen(room.zone.x, room.zone.y);
      ctx.beginPath();
      ctx.arc(z.sx, z.sy, room.zone.r * cam.scale, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(232,184,74,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(232,184,74,0.08)";
      ctx.fill();
    }
    if (room && room.hot) {
      const z = worldToScreen(room.hot.x, room.hot.y);
      ctx.beginPath();
      ctx.arc(z.sx, z.sy, room.hot.r * cam.scale, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(240,113,120,0.9)";
      ctx.stroke();
    }
    (room && room.pins ? room.pins : []).forEach((p) => {
      const s = worldToScreen(p.x, p.y);
      const col = (PIN_TYPES.find((t) => t.id === p.type) || {}).color || "#7AB0FF";
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(s.sx, s.sy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#E8EAED";
      ctx.font = "9px IBM Plex Sans";
      ctx.textAlign = "center";
      ctx.fillText(p.type.toUpperCase(), s.sx, s.sy + 16);
    });
    (room && room.towers ? room.towers : []).forEach((t) => {
      const s = worldToScreen(t.x, t.y);
      const col = t.status === "confirmed" ? "#3DDC97" : t.status === "contested" ? "#F5A35C" : t.status === "enemy" ? "#F07178" : "#8B93A1";
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.strokeRect(s.sx - 7, s.sy - 7, 14, 14);
      ctx.fillStyle = col;
      ctx.font = "600 11px IBM Plex Sans";
      ctx.textAlign = "center";
      ctx.fillText(t.label, s.sx, s.sy - 12);
      if (t.digit != null) {
        ctx.font = "500 13px IBM Plex Mono";
        ctx.fillText(String(t.digit), s.sx, s.sy + 5);
      }
    });
  }

  function publish() {
    try { localStorage.setItem("warden:" + room.code, JSON.stringify(room)); } catch (e) {}
    if (channel) channel.postMessage({ type: "state", room: room });
    if (socket && socket.readyState === 1) socket.send(JSON.stringify({ op: "state", room: room }));
  }
  function applyState(next) {
    if (!next || next.code !== (room && room.code)) return;
    room = next;
    if (room.mapId !== (mapDef && mapDef.id)) {
      mapDef = catalog.maps.find((m) => m.id === room.mapId) || mapDef;
      loadMapImage();
    }
    renderStrip(); renderBrute(); renderDesk(); draw();
    $("#liveN").textContent = room.members.length;
  }
  function connectRoom() {
    if (channel) channel.close();
    channel = new BroadcastChannel("warden:" + room.code);
    channel.onmessage = (e) => { if (e.data && e.data.type === "state") applyState(e.data.room); };
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = proto + "://" + location.host + "/ws";
    try {
      socket = new WebSocket(url);
      socket.onopen = () => {
        socket.send(JSON.stringify({ op: "join", code: room.code, room: room, name: myName, clientId: clientId }));
        $("#liveDot").classList.remove("off");
      };
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.op === "state") applyState(m.room);
        if (m.op === "presence") { room.members = m.members; $("#liveN").textContent = m.members.length; }
      };
      socket.onclose = () => $("#liveDot").classList.add("off");
    } catch (e) { $("#liveDot").classList.add("off"); }
  }

  function renderStrip() {
    $("#strip").innerHTML = room.towers.map((t) => {
      const cls = t.status === "confirmed" ? "st-ok" : t.status === "contested" ? "st-warn" : t.status === "enemy" ? "st-bad" : "st-dim";
      const dg = t.status === "contested" && t.alt != null ? (t.digit + "/" + t.alt) : (t.digit == null ? "\u2014" : t.digit);
      return "<div class=\"cell\" data-id=\"" + t.id + "\"><div class=\"tn\">" + t.label + "</div><div class=\"dg " + cls + "\">" + dg + "</div><div class=\"st " + cls + "\">" + t.status.toUpperCase() + "</div></div>";
    }).join("");
    $("#strip").querySelectorAll(".cell").forEach((el) => {
      el.onclick = () => openDigit(+el.dataset.id);
      el.oncontextmenu = (e) => { e.preventDefault(); cycleStatus(+el.dataset.id); };
    });
  }
  function renderBrute() {
    const known = room.towers.filter((t) => t.digit != null && t.status === "confirmed").map((t) => t.digit);
    const empty = room.towers.filter((t) => t.status === "empty" || t.digit == null);
    const bar = $("#brute");
    if (empty.length !== 1 || known.length < room.towers.length - 1) { bar.classList.remove("on"); return; }
    bar.classList.add("on");
    const used = {};
    known.forEach((d) => { used[d] = true; });
    bar.innerHTML = "BRUTE LAST " + [0,1,2,3,4,5,6,7,8,9].map((d) =>
      "<button class=\"" + (used[d] ? "dim" : "") + "\" data-d=\"" + d + "\">" + d + "</button>").join("");
    bar.querySelectorAll("button").forEach((b) => b.onclick = () => {
      addCall("hold-brute", empty[0].id, "TRYING " + b.dataset.d + " ON " + empty[0].label);
      toast("TRYING " + b.dataset.d);
    });
  }
  function renderDesk() {
    const after = kit.cash - KIT[kit.life];
    $("#deskSide").innerHTML =
      "<div style=\"font-size:10px;letter-spacing:.1em;color:var(--faint);margin-bottom:10px\">CALLS</div>" +
      (room.calls.slice(-6).reverse().map((c) => "<div class=\"list-item\"><time>" + c.by + "</time>" + c.text + "</div>").join("") || "<div style=\"color:var(--faint);font-size:12px\">No calls yet.</div>") +
      "<div style=\"font-size:10px;letter-spacing:.1em;color:var(--faint);margin:18px 0 10px\">THIS LIFE</div>" +
      "<div class=\"kit-row\">CASH <b>" + kit.cash.toLocaleString() + "</b></div>" +
      "<div class=\"kit-row\">TEMPLATE <b>" + kit.life.toUpperCase() + "</b></div>" +
      "<div class=\"kit-row\">AFTER DEATH <b class=\"" + (after<3000?"rose":"") + "\">" + after.toLocaleString() + "</b></div>" +
      (after<3000?"<div class=\"warnline\">RECOVERY LIFE. DO NOT BUY A VEHICLE.</div>":"");
    if (room.calls.length) {
      const last = room.calls[room.calls.length - 1];
      $("#chip").classList.remove("hidden");
      $("#chip").innerHTML = "<em>CALL</em>" + last.text;
    }
  }

  function openSheet(html) {
    $("#sheet").innerHTML = "<div class=\"grab\"></div>" + html;
    $("#sheet").classList.add("on");
    $("#veil").classList.add("on");
  }
  function closeSheet() {
    $("#sheet").classList.remove("on");
    $("#veil").classList.remove("on");
    document.querySelectorAll(".dock button").forEach((b) => b.classList.remove("on"));
  }
  $("#veil").onclick = closeSheet;

  function openDigit(id) {
    const t = room.towers.find((x) => x.id === id);
    openSheet("<h2>" + t.label + "</h2><p class=\"sub\">SECOND FLOOR PANEL \u00b7 TAP A DIGIT</p>" +
      "<div class=\"pad\">" + [1,2,3,4,5,6,7,8,9,0].map((d) => "<button data-d=\"" + d + "\">" + d + "</button>").join("") + "</div>" +
      "<div class=\"seg\"><button data-s=\"empty\">EMPTY</button><button data-s=\"confirmed\" class=\"on\">CONFIRMED</button><button data-s=\"contested\">CONTESTED</button><button data-s=\"enemy\">ENEMY</button></div>" +
      "<button class=\"btn-ghost\" style=\"width:100%;margin-top:12px\" id=\"clr\">CLEAR</button>");
    let status = "confirmed";
    $("#sheet").querySelectorAll("[data-s]").forEach((b) => b.onclick = () => {
      status = b.dataset.s;
      $("#sheet").querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("on", x === b));
    });
    $("#sheet").querySelectorAll("[data-d]").forEach((b) => b.onclick = () => {
      setDigit(id, +b.dataset.d, status); closeSheet();
    });
    $("#clr").onclick = () => { setDigit(id, null, "empty"); closeSheet(); };
  }
  function setDigit(id, digit, status) {
    const t = room.towers.find((x) => x.id === id);
    if (t.digit != null && digit != null && t.digit !== digit && t.status === "confirmed") {
      t.alt = digit; t.status = "contested";
    } else {
      t.digit = digit; t.alt = null; t.status = status;
    }
    publish(); renderStrip(); renderBrute(); draw();
  }
  function cycleStatus(id) {
    const order = ["empty", "confirmed", "contested", "enemy"];
    const t = room.towers.find((x) => x.id === id);
    t.status = order[(order.indexOf(t.status) + 1) % order.length];
    publish(); renderStrip(); draw();
  }
  function addCall(preset, towerId, text) {
    const tpl = CALLS.find((c) => c.id === preset);
    const tw = room.towers.find((t) => t.id === towerId);
    const resolved = text || (tpl ? tpl.label.replace("{n}", tw ? tw.id : "") : preset);
    room.calls.push({ id: crypto.randomUUID(), preset: preset, towerId: towerId, text: resolved, by: myName, at: Date.now() });
    if (room.calls.length > 50) room.calls.shift();
    publish(); renderDesk();
  }

  function sheetPins() {
    openSheet("<h2>PIN</h2><p class=\"sub\">TAP A TYPE, THEN TAP THE MAP</p>" +
      "<div class=\"grid2\">" + PIN_TYPES.map((p) => "<button class=\"tile\" data-p=\"" + p.id + "\"><b style=\"color:" + p.color + "\">\u25cf</b>" + p.label + "</button>").join("") + "</div>" +
      "<p class=\"sub\" style=\"margin-top:16px\">Or paste a map screenshot to trace the zone.</p>" +
      "<input type=\"file\" accept=\"image/*\" id=\"snapFile\" style=\"margin-bottom:10px;width:100%;color:var(--dim)\"/>" +
      "<button class=\"btn-ghost\" style=\"width:100%\" id=\"dropZone\">DROP 2KM ZONE AT CENTRE</button>");
    $("#sheet").querySelectorAll("[data-p]").forEach((b) => b.onclick = () => { placingPin = b.dataset.p; closeSheet(); toast("TAP MAP"); });
    $("#snapFile").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => { snapImg = img; draw(); toast("TRACE ON"); };
      img.src = URL.createObjectURL(f);
    };
    $("#dropZone").onclick = () => {
      room.zone = { x: cam.x, y: cam.y, r: 10 };
      publish(); closeSheet(); draw();
    };
  }
  function sheetCall() {
    openSheet("<h2>CALL</h2><p class=\"sub\">ONE TAP. FASTER THAN VOICE.</p>" +
      CALLS.map((c) => "<button class=\"btn-ghost\" style=\"width:100%;margin-bottom:8px\" data-c=\"" + c.id + "\">" + c.label.replace("{n}","\u2026") + "</button>").join("") +
      "<div class=\"seg\" id=\"twpick\">" + room.towers.map((t) => "<button data-t=\"" + t.id + "\">" + t.label + "</button>").join("") + "</div>");
    let tid = room.towers[0] && room.towers[0].id;
    const first = $("#twpick").querySelectorAll("button")[0];
    if (first) first.classList.add("on");
    $("#twpick").querySelectorAll("button").forEach((b) => b.onclick = () => {
      tid = +b.dataset.t;
      $("#twpick").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    });
    $("#sheet").querySelectorAll("[data-c]").forEach((b) => b.onclick = () => { addCall(b.dataset.c, tid); closeSheet(); });
  }
  function sheetKit() {
    const after = kit.cash - KIT[kit.life];
    openSheet("<h2>KIT</h2><p class=\"sub\">BRAKE PEDAL. LOCAL ONLY.</p>" +
      "<div class=\"kit-row\">CASH <b id=\"cashV\">" + kit.cash.toLocaleString() + "</b></div>" +
      "<div style=\"display:flex;gap:8px;margin:8px 0\"><button class=\"btn-ghost\" id=\"cminus\">\u2212500</button><button class=\"btn-ghost\" id=\"cplus\">+500</button></div>" +
      "<div class=\"seg\" id=\"life\">" + ["light","hold","push","vehicle"].map((l) => "<button data-l=\"" + l + "\" class=\"" + (l===kit.life?"on":"") + "\">" + l.toUpperCase() + "</button>").join("") + "</div>" +
      "<div class=\"kit-row\">EST. KIT <b>" + KIT[kit.life].toLocaleString() + "</b></div>" +
      "<div class=\"kit-row\">AFTER DEATH <b class=\"" + (after<3000?"rose":"") + "\">" + after.toLocaleString() + "</b></div>" +
      (after<3000?"<div class=\"warnline\">RECOVERY LIFE. DO NOT BUY A VEHICLE.</div>":""));
    const rerender = () => { closeSheet(); sheetKit(); renderDesk(); };
    $("#cminus").onclick = () => { kit.cash = Math.max(0, kit.cash - 500); rerender(); };
    $("#cplus").onclick = () => { kit.cash += 500; rerender(); };
    $("#life").querySelectorAll("button").forEach((b) => b.onclick = () => { kit.life = b.dataset.l; rerender(); });
  }
  function sheetMore() {
    openSheet("<h2>MORE</h2><p class=\"sub\">ROOM " + room.code + "</p><p class=\"sub\">Map</p>" +
      "<div class=\"seg\" id=\"maps\">" + catalog.maps.map((m) => "<button data-m=\"" + m.id + "\" class=\"" + (m.id===mapDef.id?"on":"") + "\">" + m.name.toUpperCase() + "</button>").join("") + "</div>" +
      "<button class=\"btn-ghost\" style=\"width:100%;margin-top:14px\" id=\"fit\">FRAME TOWERS</button>" +
      "<button class=\"btn-ghost\" style=\"width:100%;margin-top:8px\" id=\"clearsnap\">CLEAR TRACE</button>" +
      "<p class=\"sub\" style=\"margin-top:16px\">Name \u00b7 " + myName + "</p>" +
      "<p class=\"sub\">Imagery from community overhead captures. 1 unit = 100 m. Unofficial.</p>");
    $("#maps").querySelectorAll("button").forEach((b) => b.onclick = async () => {
      room.mapId = b.dataset.m;
      mapDef = catalog.maps.find((m) => m.id === room.mapId);
      room.towerCount = mapDef.towers.length;
      room.towers = emptyTowers(mapDef.towers.length, mapDef);
      await loadMapImage();
      publish(); renderStrip(); renderBrute(); closeSheet();
    });
    $("#fit").onclick = () => { fitCam(); draw(); closeSheet(); };
    $("#clearsnap").onclick = () => { snapImg = null; draw(); closeSheet(); };
  }

  document.querySelectorAll(".dock button").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".dock button").forEach((x) => x.classList.toggle("on", x === b));
    ({ pins: sheetPins, call: sheetCall, kit: sheetKit, more: sheetMore })[b.dataset.sheet]();
  });

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const w = screenToWorld(e.offsetX, e.offsetY);
    pointer = w;
    $("#hud").textContent = "X " + w.x.toFixed(1) + "   Y " + w.y.toFixed(1);
    if (placingPin) {
      room.pins.push({ id: crypto.randomUUID(), type: placingPin, x: w.x, y: w.y });
      placingPin = null;
      publish(); draw();
      return;
    }
    dragging = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
  });
  canvas.addEventListener("pointermove", (e) => {
    const w = screenToWorld(e.offsetX, e.offsetY);
    pointer = w;
    $("#hud").textContent = "X " + w.x.toFixed(1) + "   Y " + w.y.toFixed(1);
    if (!dragging) return;
    cam.x = dragging.cx - (e.clientX - dragging.x) / cam.scale;
    cam.y = dragging.cy - (e.clientY - dragging.y) / cam.scale;
    draw();
  });
  canvas.addEventListener("pointerup", () => { dragging = null; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const before = screenToWorld(e.offsetX, e.offsetY);
    cam.scale *= e.deltaY < 0 ? 1.12 : 0.89;
    cam.scale = Math.min(48, Math.max(3, cam.scale));
    const after = screenToWorld(e.offsetX, e.offsetY);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    draw();
  }, { passive: false });

  document.addEventListener("paste", (e) => {
    const item = [].slice.call((e.clipboardData && e.clipboardData.items) || []).find((i) => i.type.indexOf("image/") === 0);
    if (!item || !room) return;
    const img = new Image();
    img.onload = () => { snapImg = img; draw(); toast("TRACE ON"); };
    img.src = URL.createObjectURL(item.getAsFile());
  });

  const cells = $("#joinCells");
  for (let i = 0; i < 6; i++) {
    const inp = document.createElement("input");
    inp.maxLength = 1;
    inp.autocomplete = "off";
    inp.inputMode = "text";
    cells.appendChild(inp);
  }
  const inputs = [].slice.call(cells.querySelectorAll("input"));
  function joinValue() { return inputs.map((i) => i.value.toUpperCase()).join(""); }
  cells.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "");
    const i = inputs.indexOf(e.target);
    if (e.target.value && i < 5) inputs[i + 1].focus();
    $("#joinBtn").disabled = joinValue().length !== 6;
  });
  cells.addEventListener("paste", (e) => {
    const t = ((e.clipboardData.getData("text") || "").toUpperCase().replace(/[^0-9A-Z]/g, "")).slice(0, 6);
    if (t.length < 2) return;
    e.preventDefault();
    t.split("").forEach((ch, i) => { inputs[i].value = ch; });
    $("#joinBtn").disabled = joinValue().length !== 6;
  });

  async function enter(code, mapId, existing) {
    room = existing || makeRoom(code, mapId || "bakurani");
    if (!room.members.some((m) => m.id === clientId)) room.members.push({ id: clientId, name: myName });
    mapDef = catalog.maps.find((m) => m.id === room.mapId) || catalog.maps[0];
    $("#landing").style.display = "none";
    $("#app").classList.add("on");
    $("#roomCode").textContent = room.code;
    $("#mapName").textContent = mapDef.name.toUpperCase();
    history.replaceState(null, "", "#" + room.code);
    await loadMapImage();
    resize(); fitCam();
    renderStrip(); renderBrute(); renderDesk();
    connectRoom();
    publish();
  }

  $("#newRoom").onclick = () => enter(newCode(), "bakurani");
  $("#joinBtn").onclick = () => {
    const code = joinValue();
    const saved = localStorage.getItem("warden:" + code);
    if (saved) enter(code, null, JSON.parse(saved));
    else enter(code, "bakurani");
  };
  $("#roomCode").onclick = () => copy(room.code + "  " + location.href.split("#")[0] + "#" + room.code);
  $("#shareBtn").onclick = () => copy(location.href.split("#")[0] + "#" + room.code);
  $("#leaveBtn").onclick = () => location.reload();
  $("#aboutBtn").onclick = () => toast("UNOFFICIAL \u00b7 NO ACCOUNT");

  window.addEventListener("resize", resize);

  fetch("maps/index.json").then((r) => r.json()).then((j) => {
    catalog = j;
    const hash = location.hash.replace("#", "").toUpperCase();
    if (hash.length === 6) {
      const saved = localStorage.getItem("warden:" + hash);
      enter(hash, null, saved ? JSON.parse(saved) : null);
    }
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
