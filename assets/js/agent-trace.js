/* FlyWith — agent trace player.
   Replays a recorded run of the multi-agent backend (agent/) inside the
   landing page, or streams a live run over SSE when an agent server origin is
   supplied via ?agent=<origin> (e.g. ?agent=http://localhost:8787).
   Progressive enhancement: without JS the section shows a static explainer. */
(function () {
  "use strict";

  var section = document.getElementById("agents");
  if (!section) return;

  var feed = document.getElementById("agent-feed");
  var verdictPane = document.getElementById("agent-verdict");
  var runBtn = document.getElementById("agent-run");
  var statusEl = document.getElementById("agent-status");
  if (!feed || !verdictPane || !runBtn) return;

  var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var agentOrigin = new URLSearchParams(window.location.search).get("agent");
  var playing = false;
  var playedOnce = false;

  var AGENT_LABEL = {
    "flight-search": "✈ flight-search",
    "stopover-value": "∑ stopover-value",
    "family-logistics": "🧳 family-logistics",
    "verifier": "✓ verifier"
  };

  function setStatus(text, busy) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.classList.toggle("busy", !!busy);
    }
  }

  function el(cls, tag, text) {
    var div = document.createElement("div");
    div.className = "at-ev " + cls;
    var tagEl = document.createElement("span");
    tagEl.className = "at-tag";
    tagEl.textContent = tag;
    div.appendChild(tagEl);
    var body = document.createElement("span");
    body.className = "at-body";
    body.textContent = text;
    div.appendChild(body);
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
    return div;
  }

  function money(n) { return "$" + Number(n).toLocaleString("en-CA"); }

  function renderVerdict(v) {
    verdictPane.innerHTML = "";
    var head = document.createElement("div");
    head.className = "at-verdict-head";
    head.innerHTML =
      "<h3>" + v.route + "</h3>" +
      "<p>" + v.summary + "</p>" +
      "<p class='at-dim'>Direct baseline: " + money(v.directBaselineCAD) + " per seat</p>";
    verdictPane.appendChild(head);

    (v.options || []).forEach(function (o, i) {
      var card = document.createElement("article");
      card.className = "at-card";
      card.style.animationDelay = (i * 120) + "ms";
      card.innerHTML =
        "<div class='at-card-top'><h4>" + o.stopoverCity + " · " + o.suggestedDays + " days</h4>" +
        "<span class='at-score'>" + o.worthItScore + "</span></div>" +
        "<p class='at-dim'>" + money(o.flightTotalCAD) + "/seat flights (+" + money(o.deltaVsDirectCAD) +
        " vs direct) · hotel est. " + money(o.hotelEstimateCAD) + "</p>" +
        "<p>✅ " + o.highlight + "</p>" +
        "<p>⚠️ " + o.caution + "</p>" +
        "<p class='at-dim'>🛂 " + o.visaVerdict + "</p>" +
        "<span class='at-badge " + o.dataStatus + "'>" + o.dataStatus + "</span>";
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
    switch (e.type) {
      case "run.start": el("orch", "orchestrator", "Planning: " + e.prompt); setStatus("orchestrator planning…", true); break;
      case "orchestrator.thinking": el("orch think", "orchestrator · thinking", e.text); break;
      case "orchestrator.text": el("orch", "orchestrator", e.text); break;
      case "subagent.start": el("sub", (AGENT_LABEL[e.agent] || e.agent) + " · spawned", e.task); setStatus((e.agent) + " working…", true); break;
      case "subagent.tool": el("tool", (AGENT_LABEL[e.agent] || e.agent) + " → " + e.tool, JSON.stringify(e.input)); break;
      case "subagent.tool_result": el("tool", (AGENT_LABEL[e.agent] || e.agent) + " ← " + e.tool, e.summary); break;
      case "subagent.done": el("sub done", (AGENT_LABEL[e.agent] || e.agent) + " · report", e.report); break;
      case "verdict": renderVerdict(e.verdict); el("orch", "orchestrator", "Verdict published after verifier approval ✔"); setStatus("verdict published", false); break;
      case "run.error": el("err", "error", e.message); setStatus("error", false); break;
      case "run.done": setStatus(agentOrigin ? "live run complete" : "replay complete — recorded run of the real agent backend", false); break;
    }
  }

  function resetPanes(pendingText) {
    feed.innerHTML = "";
    verdictPane.innerHTML = "<p class='at-dim at-waiting'>" + pendingText + "</p>";
  }

  /* ---------- Replay mode ---------- */
  function playReplay() {
    if (playing) return;
    playing = true;
    runBtn.disabled = true;
    resetPanes("The verdict appears only after the verifier subagent approves it.");
    fetch("assets/data/agent-trace-replay.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        var events = data.events || [];
        if (prefersReduced) {
          events.forEach(handleEvent);
          finish();
          return;
        }
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

    function finish() { playing = false; playedOnce = true; runBtn.disabled = false; runBtn.textContent = "↻ Replay the run"; }
  }

  /* ---------- Live mode ---------- */
  function playLive() {
    if (playing) return;
    playing = true;
    runBtn.disabled = true;
    resetPanes("Waiting for a verified verdict from the live agent…");
    var promptInput = document.getElementById("agent-prompt");
    var prompt = (promptInput && promptInput.value) ||
      "Toronto to Mumbai in November, 2 adults + 2 kids + grandma, Canadian passports. Is a stopover worth it?";
    var es = new EventSource(agentOrigin.replace(/\/$/, "") + "/api/plan?prompt=" + encodeURIComponent(prompt));
    es.onmessage = function (msg) {
      var e = JSON.parse(msg.data);
      handleEvent(e);
      if (e.type === "run.done") { es.close(); playing = false; runBtn.disabled = false; }
    };
    es.onerror = function () {
      el("err", "connection", "Lost connection to the agent server at " + agentOrigin);
      es.close(); playing = false; runBtn.disabled = false;
    };
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
    // Auto-play once when the section scrolls into view.
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !playedOnce && !playing) {
            io.disconnect();
            playReplay();
          }
        });
      }, { threshold: 0.35 });
      io.observe(section);
    }
  }
})();
