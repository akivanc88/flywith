/* FlyWith hero globe — three.js (vendored, global THREE).
   Progressive enhancement: only runs on capable, non-reduced-motion, wide-enough
   viewports. Otherwise the inline 2D SVG arc map stays visible. */
(function () {
  "use strict";

  var host = document.getElementById("globe-host");
  var fallback = document.getElementById("globe-fallback");
  if (!host) return;

  var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  // Bail to the SVG fallback when 3D would be heavy, unsupported, or unwanted.
  if (prefersReduced || typeof THREE === "undefined" || !hasWebGL() || window.innerWidth < 700) {
    return;
  }

  // Cities: [name, lat, lon, color]
  var ORIGIN = { name: "Toronto", lat: 43.65, lon: -79.38 };
  var DEST = { name: "Mumbai", lat: 19.08, lon: 72.88 };
  var STOPS = [
    { name: "Dubai", lat: 25.25, lon: 55.36, color: 0xff6b4a },
    { name: "Istanbul", lat: 41.01, lon: 28.98, color: 0xf5ad2a },
    { name: "Singapore", lat: 1.35, lon: 103.99, color: 0xff6b4a },
    { name: "Doha", lat: 25.27, lon: 51.61, color: 0xf5ad2a }
  ];

  var R = 1;
  function toVec(lat, lon, r) {
    r = r || R;
    var phi = (90 - lat) * Math.PI / 180;
    var theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  var width = host.clientWidth || 480;
  var height = host.clientHeight || 480;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(0, 0, 3.1);

  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  host.appendChild(renderer.domElement);

  var world = new THREE.Group();
  scene.add(world);

  // Solid globe core
  var core = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.992, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x0c5b5e })
  );
  world.add(core);

  // Dotted surface — dots fall only on real landmasses so continents read as
  // continents (COBE / Linear style). Positions are pre-baked in globe-land.js
  // from a land/ocean mask; fall back to a uniform sphere if that file is absent.
  var dotPos;
  if (window.FLYWITH_LAND_DOTS && window.FLYWITH_LAND_DOTS.length) {
    var src = window.FLYWITH_LAND_DOTS;
    dotPos = new Float32Array(src.length);
    for (var i = 0; i < src.length; i++) dotPos[i] = src[i] * (R * 1.002);
  } else {
    var dotCount = 1400;
    dotPos = new Float32Array(dotCount * 3);
    var gold = 1 + Math.sqrt(5);
    for (var i = 0; i < dotCount; i++) {
      var t = i / dotCount;
      var inc = Math.acos(1 - 2 * t);
      var az = gold * Math.PI * i;
      var v = new THREE.Vector3(
        Math.sin(inc) * Math.cos(az),
        Math.cos(inc),
        Math.sin(inc) * Math.sin(az)
      ).multiplyScalar(R * 1.002);
      dotPos[i * 3] = v.x; dotPos[i * 3 + 1] = v.y; dotPos[i * 3 + 2] = v.z;
    }
  }
  var dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  var dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: 0x7fe3df, size: 0.02, transparent: true, opacity: 0.78 }));
  world.add(dots);

  // Latitude/longitude grid
  var grid = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 1.003, 18, 12)),
    new THREE.LineBasicMaterial({ color: 0x2b7d7f, transparent: true, opacity: 0.18 })
  );
  world.add(grid);

  // City markers
  function addMarker(pos, color) {
    var m = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 14, 14),
      new THREE.MeshBasicMaterial({ color: color })
    );
    m.position.copy(pos);
    world.add(m);
    var halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 14, 14),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.25 })
    );
    halo.position.copy(pos);
    world.add(halo);
  }
  addMarker(toVec(ORIGIN.lat, ORIGIN.lon, R * 1.01), 0xffffff);
  addMarker(toVec(DEST.lat, DEST.lon, R * 1.01), 0xffffff);

  // Great-circle-ish arcs from origin to each stop, plus stop to destination
  var arcs = [];
  function makeArc(a, b, color, lift) {
    var start = toVec(a.lat, a.lon, R * 1.01);
    var end = toVec(b.lat, b.lon, R * 1.01);
    var mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(R * (1 + lift));
    var curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    var pts = curve.getPoints(60);
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.9 }));
    world.add(line);

    // travelling plane dot
    var dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    world.add(dot);
    arcs.push({ curve: curve, dot: dot, color: color, offset: Math.random() });
  }
  STOPS.forEach(function (s, idx) {
    addMarker(toVec(s.lat, s.lon, R * 1.01), s.color);
    makeArc(ORIGIN, s, s.color, 0.28 + idx * 0.02);
    makeArc(s, DEST, s.color, 0.16);
  });

  // Orient so the origin/arcs face the camera initially
  world.rotation.y = -1.1;
  world.rotation.x = 0.32;

  // Drag to rotate
  var dragging = false, lastX = 0, lastY = 0, velY = 0.0016, manualVelY = 0, manualVelX = 0;
  function onDown(x, y) { dragging = true; lastX = x; lastY = y; manualVelY = 0; manualVelX = 0; }
  function onMove(x, y) {
    if (!dragging) return;
    var dx = x - lastX, dy = y - lastY;
    lastX = x; lastY = y;
    world.rotation.y += dx * 0.005;
    world.rotation.x = Math.max(-0.7, Math.min(0.9, world.rotation.x + dy * 0.005));
    manualVelY = dx * 0.005; manualVelX = dy * 0.005;
  }
  function onUp() { dragging = false; }
  var el = renderer.domElement;
  el.style.cursor = "grab";
  el.addEventListener("mousedown", function (e) { el.style.cursor = "grabbing"; onDown(e.clientX, e.clientY); });
  window.addEventListener("mousemove", function (e) { onMove(e.clientX, e.clientY); });
  window.addEventListener("mouseup", function () { el.style.cursor = "grab"; onUp(); });
  el.addEventListener("touchstart", function (e) { if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  el.addEventListener("touchmove", function (e) { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  el.addEventListener("touchend", onUp);

  // Pause when offscreen / tab hidden
  var visible = true, running = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { threshold: 0.05 }).observe(host);
  }
  document.addEventListener("visibilitychange", function () { running = !document.hidden; });

  var clock = (typeof performance !== "undefined" ? performance : Date);
  function animate() {
    requestAnimationFrame(animate);
    if (!visible || !running) return;

    if (!dragging) {
      world.rotation.y += velY + manualVelY;
      world.rotation.x += manualVelX;
      manualVelY *= 0.95; manualVelX *= 0.95;
      if (world.rotation.x > 0.9) world.rotation.x = 0.9;
      if (world.rotation.x < -0.7) world.rotation.x = -0.7;
    }

    var t = (clock.now ? clock.now() : Date.now()) * 0.00012;
    for (var i = 0; i < arcs.length; i++) {
      var a = arcs[i];
      var p = (t + a.offset) % 1;
      a.dot.position.copy(a.curve.getPoint(p));
    }
    renderer.render(scene, camera);
  }

  function resize() {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", resize);

  // Success: reveal canvas, hide the SVG fallback.
  host.classList.add("globe-ready");
  if (fallback) fallback.style.display = "none";
  resize();
  animate();
})();
