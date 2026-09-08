/* Progressive enhancement: without JS every section remains readable. */
(function () {
  "use strict";
  var sections = Array.from(document.querySelectorAll("main > section"));
  var links = Array.from(document.querySelectorAll("[data-screen-link]"));
  var screens = {plan: "plan", demo: "plan", cities: "explore", profiles: "travelers"};
  function screenFor(section) { return screens[section.id] || "about"; }
  function navigate() {
    var id = location.hash.slice(1) || "plan";
    if (id === "top" || id === "main") id = "plan";
    var target = document.getElementById(id);
    var section = target && target.closest("main > section");
    var screen = section ? screenFor(section) : "plan";
    sections.forEach(function (item) { item.hidden = screenFor(item) !== screen; });
    links.forEach(function (link) {
      if (link.dataset.screenLink === screen) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.body.dataset.screen = screen;
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    requestAnimationFrame(function () {
      (section || document.getElementById("plan")).scrollIntoView({block: "start", behavior: "instant"});
    });
  }
  document.documentElement.classList.add("app-ready");
  window.addEventListener("hashchange", navigate);
  navigate();
  var tabs = Array.from(document.querySelectorAll(".demo-tab"));
  tabs.forEach(function (tab, index) {
    tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
    tab.addEventListener("keydown", function (event) {
      var next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].click();
      tabs[next].focus();
    });
  });
})();
