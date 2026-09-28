/* FlyWith — agent trace player.
   Replays a recorded run of the agent backend (agent/) inside the landing page,
   or streams a live run over SSE when an agent server origin is supplied via
   ?agent=<origin> (e.g. ?agent=http://localhost:8787).
   Progressive enhancement: without JS the section shows a static explainer.
   The pure helpers are exported for Node unit tests (agent/tests/web-trace.test.ts). */
(function (root) {
  "use strict";

  var AGENT_LABEL = {
    "flight-search": "✈ flight-search",
    "stopover-value": "∑ stopover-value",
    "family-logistics": "🧳 family-logistics",
    "verifier": "✓ verifier"
  };
  var STATUSES = ["live", "snapshot", "estimated", "editorial"];

  function label(agent) { return AGENT_LABEL[agent] || agent; }
  function money(n) { return "$" + Number(n).toLocaleString("en-CA"); }
  function signedMoney(n) { return n < 0 ? "−" + money(-n) : "+" + money(n); }
  function safeStatus(s) { return STATUSES.indexOf(s) >= 0 ? s : "editorial"; }

  /** The live server wraps events as {sequence, event}; recordings store bare events. */
  function unwrap(message) {
    return message && message.event && typeof message.event.type === "string" ? message.event : message;
  }

  /** Map a trace event to one feed line {cls, tag, text} and an optional status; null when nothing is shown. */
  function describeEvent(e, live) {
    if (!e || typeof e.type !== "string") return null;
    switch (e.type) {
      case "run.start": return { cls: "orch", tag: "orchestrator", text: "Planning: " + e.prompt, status: ["orchestrator planning…", true] };
      case "router.decision": {
        var d = e.decision || {};
        if (d.action === "reject") return { cls: "orch", tag: "🧭 intake-router", text: "Request screened before any agent runs." };
        var who = (d.subagents || []).map(label).join(" · ");
        return { cls: "orch", tag: "🧭 intake-router", text: "Routed to " + who + " · " + (d.tier === "strong" ? "deep drafting for competing family constraints" : "fast drafting for a simple trip"), status: ["routing complete…", true] };
      }
      /* Older recordings may contain private reasoning events. Never render them. */
      case "orchestrator.thinking": return null;
      case "orchestrator.text": return { cls: "orch", tag: "orchestrator", text: e.text };
      case "subagent.start": return { cls: "sub", tag: label(e.agent) + " · spawned", text: e.task, status: [e.agent + " working…", true] };
      case "subagent.tool": return { cls: "tool", tag: label(e.agent) + " → " + e.tool, text: JSON.stringify(e.input) };
      case "subagent.tool_result": return { cls: "tool", tag: label(e.agent) + " ← " + e.tool, text: e.summary };
      case "subagent.done": return { cls: "sub done", tag: label(e.agent) + " · report", text: e.report };
      case "verdict": return { cls: "orch", tag: "orchestrator", text: "Verdict published after verifier approval ✔", status: ["verdict published", false] };
      case "run.error": return { cls: "err", tag: "error", text: e.message, status: ["error", false] };
      case "run.done": return e.status === "completed" || e.status === undefined ? { status: [live ? "live run complete" : "snapshot replay complete — observed June 2026", false] } : { status: ["run " + e.status, false] };
      default: return null;
    }
  }

  /** Plain-text view model of one verdict option card. */
  function optionLines(o) {
    return {
      title: o.stopoverCity + " · " + o.suggestedDays + " days",
      score: String(o.worthItScore),
      lines: [
        ["at-dim", money(o.flightTotalCAD) + "/seat flights (" + signedMoney(o.deltaVsDirectCAD) + " vs direct) · hotel est. " + money(o.hotelEstimateCAD)],
        ["", "✅ " + o.highlight],
        ["", "⚠️ " + o.caution],
        ["at-dim", "🛂 " + o.visaVerdict]
      ],
      status: safeStatus(o.dataStatus)
    };
  }

  var api = { unwrap: unwrap, describeEvent: describeEvent, optionLines: optionLines, money: money, signedMoney: signedMoney, safeStatus: safeStatus };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }
  root.FlyWithTrace = api;

  var document = root.document;
  var section = document.getElementById("agents");
  if (!section) return;
  var feed = document.getElementById("agent-feed");
  var verdictPane = document.getElementById("agent-verdict");
  var runBtn = document.getElementById("agent-run");
  var statusEl = document.getElementById("agent-status");
  if (!feed || !verdictPane || !runBtn) return;

  var prefersReduced = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var agentOrigin = new URLSearchParams(root.location.search).get("agent");
  var playing = false;
  var playedOnce = false;

  function setStatus(text, busy) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("busy", !!busy);
  }

  function el(cls, tag, text) {
    var div = document.createElement("div");
    div.className = "at-ev " + cls;
    var tagEl = document.createElement("span");
    tagEl.className = "at-tag";
    tagEl.textContent = tag;
    var body = document.createElement("span");
    body.className = "at-body";
    body.textContent = text;
    div.append(tagEl, body);
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
    return div;
  }

  function renderVerdict(v) {
    verdictPane.innerHTML = "";
    var head = document.createElement("div");
    head.className = "at-verdict-head";
    var title = document.createElement("h3");
    title.textContent = v.route;
    var summary = document.createElement("p");
    summary.textContent = v.summary;
    var baseline = document.createElement("p");
    baseline.className = "at-dim";
    baseline.textContent = "Direct baseline: " + money(v.directBaselineCAD) + " per seat";
    head.append(title, summary, baseline);
    verdictPane.appendChild(head);
    (v.options || []).forEach(function (o, i) {
      var view = optionLines(o);
      var card = document.createElement("article");
      card.className = "at-card";
      card.style.animationDelay = (i * 120) + "ms";
      var top = document.createElement("div");
      top.className = "at-card-top";
      var h4 = document.createElement("h4");
      h4.textContent = view.title;
      var score = document.createElement("span");
      score.className = "at-score";
      score.textContent = view.score;
      top.append(h4, score);
      card.appendChild(top);
      view.lines.forEach(function (line) {
        var p = document.createElement("p");
        p.className = line[0];
        p.textContent = line[1];
        card.appendChild(p);
      });
      var badge = document.createElement("span");
      badge.className = "at-badge " + view.status;
      badge.textContent = view.status;
      card.appendChild(badge);
      verdictPane.appendChild(card);
    });
    if (v.verifierNote) {
      var note = document.createElement("p");
      note.className = "at-dim at-note";
      note.textContent = "Verifier: " + v.verifierNote;
      verdictPane.appendChild(note);
    }
  }

  function handleEvent(e) {
    var view = describeEvent(e, !!agentOrigin);
    if (!view) return;
    if (e.type === "verdict") renderVerdict(e.verdict);
    if (view.tag) el(view.cls, view.tag, view.text);
    if (view.status) setStatus(view.status[0], view.status[1]);
  }

  function resetPanes(pendingText) {
    feed.innerHTML = "";
    verdictPane.innerHTML = "";
    var p = document.createElement("p");
    p.className = "at-dim at-waiting";
    p.textContent = pendingText;
    verdictPane.appendChild(p);
  }

  /* ---------- Replay mode ---------- */
  function playReplay() {
    if (playing) return;
    playing = true;
    runBtn.disabled = true;
    resetPanes("The verdict appears only after the verifier subagent approves it.");
    function finish() { playing = false; playedOnce = true; runBtn.disabled = false; runBtn.textContent = "↻ Replay the run"; }
    fetch("assets/data/agent-trace-replay.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        var events = data.events || [];
        if (prefersReduced) { events.forEach(handleEvent); finish(); return; }
        var i = 0;
        (function next() {
          if (i >= events.length) { finish(); return; }
          var e = events[i++];
          setTimeout(function () { handleEvent(e); next(); }, e.d || 300);
        })();
      })
      .catch(function () {
        el("err", "replay", "Couldn't load the recorded trace (are you viewing over file://?). Run it live instead: cd agent && npm run dev");
        finish();
      });
  }

  /* ---------- Live mode ---------- */
  function playLive() {
    if (playing) return;
    playing = true;
    runBtn.disabled = true;
    resetPanes("Waiting for a verified verdict from the live agent…");
    var promptInput = document.getElementById("agent-prompt");
    var prompt = (promptInput && promptInput.value) || "Toronto to Mumbai in November, 2 adults + 2 kids (ages 4 and 7) + grandma, Canadian passports. Is a stopover worth it?";
    var origin = agentOrigin.replace(/\/$/, "");
    var es;
    var terminal = false;
    function finishLive() { playing = false; runBtn.disabled = false; if (es) es.close(); }

    fetch(origin + "/api/plan", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ prompt: prompt }) })
      .then(function (response) {
        if (!response.ok) throw new Error("The agent server rejected the request (HTTP " + response.status + ").");
        return response.json();
      })
      .then(function (run) {
        if (!run || typeof run.runId !== "string" || typeof run.eventsUrl !== "string") throw new Error("The agent server returned an invalid run endpoint.");
        var streamUrl = new URL(run.eventsUrl, origin + "/");
        if (streamUrl.origin !== new URL(origin).origin) throw new Error("The agent server returned an unsafe run endpoint.");
        setStatus("live run started…", true);
        es = new EventSource(streamUrl.href);
        es.onmessage = function (msg) {
          var e;
          try { e = unwrap(JSON.parse(msg.data)); } catch (_) { return; }
          handleEvent(e);
          if (e.type === "run.done") { terminal = true; finishLive(); }
        };
        es.onerror = function () {
          if (!terminal) { el("err", "connection", "Lost connection to the agent server. The run may have been cancelled."); setStatus("connection lost", false); }
          finishLive();
        };
      })
      .catch(function (error) {
        el("err", "connection", error && error.message ? error.message : "Could not start the live run.");
        setStatus("could not start live run", false);
        finishLive();
      });
  }

  /* ---------- Wiring ---------- */
  if (agentOrigin) {
    section.classList.add("live");
    runBtn.textContent = "▶ Run the agents live";
    var promptWrap = document.getElementById("agent-prompt-wrap");
    if (promptWrap) promptWrap.hidden = false;
    setStatus("live mode · connected to " + agentOrigin, false);
    runBtn.addEventListener("click", playLive);
  } else {
    runBtn.addEventListener("click", playReplay);
    if ("IntersectionObserver" in root) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !playedOnce && !playing) { io.disconnect(); playReplay(); }
        });
      }, { threshold: 0.35 });
      io.observe(section);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
