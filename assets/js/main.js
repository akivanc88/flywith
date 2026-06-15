/* FlyWith landing page — interactions + tasteful GSAP scroll motion.
   All animation is progressive enhancement: the page is fully functional and
   visible without GSAP and when prefers-reduced-motion is set. */
(function () {
  "use strict";

  var docEl = document.documentElement;
  var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGSAP = typeof window.gsap !== "undefined";
  var animate = hasGSAP && !prefersReduced;

  /* ---------- Sticky nav shadow ---------- */
  var nav = document.querySelector(".site-nav");
  function onScroll() {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("mobile-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      if (nav) nav.classList.toggle("menu-open", open);
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        if (nav) nav.classList.remove("menu-open");
      });
    });
  }

  /* ---------- Demo tabs ---------- */
  window.flywithSwitchTab = function (btn, id) {
    document.querySelectorAll(".demo-tab").forEach(function (t) {
      var on = t === btn;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    document.querySelectorAll(".demo-panel").forEach(function (p) { p.classList.remove("active"); });
    var panel = document.getElementById("panel-" + id);
    if (panel) {
      panel.classList.add("active");
      if (animate) {
        window.gsap.fromTo(panel.children, { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power2.out", clearProps: "all" });
      }
    }
  };

  /* ---------- Profile selector ---------- */
  var profileData = {
    family: {
      title: "👨‍👩‍👧‍👦 Family-optimized recommendations",
      items: [
        "Dubai (DXB): No visa for Canadians, world-class airport play zones, stroller lanes, Legoland nearby",
        "Singapore (SIN): Changi Airport has indoor slides & butterfly garden — kids love the layover itself",
        "Amsterdam (AMS): KLM family lounges, Anne Frank House for older kids, short taxi distances",
        "Avoids: Long connection sprints, multi-terminal transfers, cities with poor infant facilities"
      ]
    },
    seniors: {
      title: "👴👵 Senior-optimized recommendations",
      items: [
        "Dubai (DXB): Excellent wheelchair access, golf cart shuttles, no visa required, short flying sectors",
        "Frankfurt (FRA): Compact terminal, Lufthansa Senator lounge, direct lift access throughout",
        "Doha (DOH): Hamad International rated #1 for comfort, no crowds, efficient medical services",
        "Avoids: Rushed connections under 2 hours, multi-terminal airports, cities with uneven terrain"
      ]
    },
    budget: {
      title: "💸 Budget-optimized recommendations",
      items: [
        "Istanbul (IST): Free e-visa for Canadians, cheap hotels from $40/night, incredible food scene",
        "Kuala Lumpur (KUL): No visa required, world-class budget transport, KLIA2 budget hub",
        "Colombo (CMB): Surprisingly cheap stopover, visa on arrival, stunning beaches nearby",
        "Tip: A 4-day stopover in Istanbul costs $17 more than a quick connection — and you get a vacation"
      ]
    },
    explorer: {
      title: "🧭 Explorer picks (off the beaten path)",
      items: [
        "Tbilisi, Georgia (TBS): Hidden gem, no visa, ancient caves, incredible wine, $25/night hotels",
        "Muscat, Oman (MCT): Underrated, stunning architecture, desert adventures, zero tourists",
        "Colombo, Sri Lanka (CMB): Spice markets, Buddhism, surf — most travelers fly right over it",
        "Baku, Azerbaijan (GYD): The \"Dubai of the Caucasus\" — futuristic city almost nobody has heard of"
      ]
    }
  };

  var resultBox = document.getElementById("profile-result");
  var resultTitle = document.getElementById("profile-result-title");
  var resultList = document.getElementById("profile-result-list");

  document.querySelectorAll(".profile-card").forEach(function (card) {
    card.addEventListener("click", function () {
      var key = card.getAttribute("data-profile");
      var data = profileData[key];
      if (!data) return;
      document.querySelectorAll(".profile-card").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      card.setAttribute("aria-pressed", "true");
      resultTitle.textContent = data.title;
      resultList.innerHTML = data.items.map(function (i) { return "<li>" + i + "</li>"; }).join("");
      resultBox.hidden = false;
      if (animate) {
        window.gsap.fromTo(resultBox, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", clearProps: "all" });
        window.gsap.fromTo(resultList.children, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.06, ease: "power2.out", clearProps: "all" });
      }
    });
  });

  /* ---------- Counters ---------- */
  function runCounter(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    if (!animate) { el.textContent = target + suffix; return; }
    var obj = { v: 0 };
    window.gsap.to(obj, {
      v: target, duration: 1.3, ease: "power2.out",
      onUpdate: function () { el.textContent = Math.round(obj.v) + suffix; },
      onComplete: function () { el.textContent = target + suffix; }
    });
  }

  /* ---------- GSAP scroll motion ---------- */
  if (animate) {
    docEl.classList.add("anim");
    var gsap = window.gsap;
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

    // Hero intro timeline. CSS (html.anim .reveal) starts these hidden, so we
    // animate TO the visible state.
    var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.to(".hero .reveal", { opacity: 1, y: 0, duration: 0.7, stagger: 0.12 })
      .from(".hero-globe", { opacity: 0, scale: 0.92, duration: 0.9 }, "-=0.7");

    // Reveal-on-scroll for everything tagged .reveal outside the hero
    if (window.ScrollTrigger) {
      gsap.utils.toArray(".reveal").forEach(function (node) {
        if (node.closest(".hero")) return;
        gsap.to(node, {
          opacity: 1, y: 0, duration: 0.7, ease: "power2.out",
          scrollTrigger: { trigger: node, start: "top 86%", once: true }
        });
      });
      gsap.utils.toArray(".reveal-scale").forEach(function (node) {
        gsap.to(node, {
          opacity: 1, scale: 1, duration: 0.6, ease: "power2.out",
          scrollTrigger: { trigger: node, start: "top 88%", once: true }
        });
      });
      // Counters fire when hero stats scroll in (also fine immediately for above-fold)
      document.querySelectorAll("[data-count]").forEach(function (el) {
        window.ScrollTrigger.create({ trigger: el, start: "top 92%", once: true, onEnter: function () { runCounter(el); } });
      });
      // Subtle parallax on city art
      gsap.utils.toArray(".city-art svg").forEach(function (art) {
        gsap.to(art, { yPercent: -6, ease: "none", scrollTrigger: { trigger: art, start: "top bottom", end: "bottom top", scrub: true } });
      });
    } else {
      // GSAP present but no ScrollTrigger: reveal everything and run counters.
      gsap.set(".reveal", { opacity: 1, y: 0 });
      gsap.set(".reveal-scale", { opacity: 1, scale: 1 });
      document.querySelectorAll("[data-count]").forEach(runCounter);
    }
  } else {
    // No animation: ensure counters show final values immediately.
    document.querySelectorAll("[data-count]").forEach(function (el) {
      el.textContent = el.getAttribute("data-count") + (el.getAttribute("data-suffix") || "");
    });
  }
})();
