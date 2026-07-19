// Global variables for Diary & Study SPA
let allPosts = [];
let diaryPosts = [];
let studyPosts = [];
let readPosts = new Set();



let currentActiveHash = window.location.hash || '#';
let headerResetTimeout = null;

// Initialize SPA Application
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load read posts from LocalStorage
  const cachedRead = localStorage.getItem('read_posts');
  if (cachedRead) {
    try {
      readPosts = new Set(JSON.parse(cachedRead));
    } catch (e) {
      console.error('Error parsing read posts cache', e);
    }
  }

  // 2. Fetch posts database once at start
  try {
    const pathName = window.location.pathname;
    const isSubpage = pathName.includes('/diary/') || pathName.includes('/study/') || pathName.includes('/history/');
    const isPagesSubpage = pathName.includes('/pages/');
    const postsUrl = isPagesSubpage ? '../../posts.json' : (isSubpage ? '../posts.json' : './posts.json');
    const response = await fetch(`${postsUrl}?v=${Date.now()}`);
    if (!response.ok) throw new Error('Failed to load posts database');
    allPosts = await response.json();

    // Partition posts into Diary and Study
    studyPosts = allPosts.filter(post => post.type === 'study');
    diaryPosts = allPosts.filter(post => post.type === 'diary');
  } catch (err) {
    console.error(err);
    const listEl = document.getElementById('post-list-element');
    if (listEl) {
      listEl.innerHTML = `<p class="error-msg">데이터를 불러오는 도중 오류가 발생했습니다.</p>`;
    }
  }

  // 3. Initialize common script components
  initMouseFollower();
  initMainPage();
  if (typeof initDiaryControls === 'function') initDiaryControls();
  if (typeof initStudyControls === 'function') initStudyControls();
  if (typeof initHistoryControls === 'function') initHistoryControls();
  initNavigationInterceptors();

  // 4. Handle initial routing based on URL Hash
  handleRouting();
  window.addEventListener('hashchange', handleRouting);

  // 5. Play subpage entrance transition on load (only if navigating from home page)
  const pathName = window.location.pathname;
  const isTransitionFromHome = new URLSearchParams(window.location.search).get('from') === 'home';

  if (isTransitionFromHome) {
    // Clear query parameter immediately so manual reloads do not trigger animation
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);

    if (pathName.includes('diary')) {
      playSubpageEntranceAnimation('diary');
    } else if (pathName.includes('study')) {
      playSubpageEntranceAnimation('study');
    } else if (pathName.includes('history')) {
      playSubpageEntranceAnimation('history');
    }
  } else {
    // Direct load or refresh: immediately clear transition elements and show static headers
    const textOverlay = document.getElementById('subpage-transition-text');
    if (textOverlay) textOverlay.remove();

    const isSubpage = pathName.includes('diary') || pathName.includes('study') || pathName.includes('history');
    const headerContainer = document.getElementById('header-subpage-container');
    const headerTitle = document.getElementById('header-subpage-title');

    if (isSubpage) {
      if (headerContainer) headerContainer.classList.add('active');
      if (headerTitle) {
        headerTitle.classList.add('show');
        headerTitle.style.opacity = '1';
      }
    } else {
      if (headerContainer) headerContainer.classList.remove('active');
      if (headerTitle) {
        headerTitle.classList.remove('show');
        headerTitle.style.opacity = '';
      }
    }

    // Ensure transitioning background classes are removed
    document.body.classList.remove('transitioning-diary', 'transitioning-study', 'transitioning-history');
  }
});

/* ----------------------------------
   MOUSE FOLLOWER CONCENTRIC CIRCLES
------------------------------------- */
function initMouseFollower() {
  const follower = document.createElement('div');
  follower.className = 'mouse-follower-container';

  // Create 3 concentric circles
  for (let i = 0; i < 3; i++) {
    const circle = document.createElement('div');
    circle.className = `follower-circle circle-${i}`;
    follower.appendChild(circle);
  }

  document.body.appendChild(follower);

  // Update follower position instantly on mouse move (no delay)
  document.addEventListener('mousemove', (e) => {
    follower.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
  });
}

/* ----------------------------------
   MAIN ORBIT & TRIPLE PENDULUM SIMULATOR
------------------------------------- */
function initMainPage() {
  const canvas = document.getElementById('orbit-canvas');

  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Set up High DPI scale factor dynamically
  let isMobile = window.innerWidth <= 600;
  let designSize = isMobile ? 850 : 1300;
  let cx = designSize / 2;
  let cy = designSize / 2;
  let g = isMobile ? 0.25 : 0.5;



  function resizeCanvas() {
    isMobile = window.innerWidth <= 600;
    designSize = isMobile ? 850 : 1300;
    cx = designSize / 2;
    cy = designSize / 2;
    g = isMobile ? 0.25 : 0.5;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = designSize * dpr;
    canvas.height = designSize * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale
    ctx.scale(dpr, dpr);

  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);


  // Set up Footer Email Tooltip Toggle
  const emailBtn = document.getElementById('footer-email-btn');
  const emailTooltip = document.getElementById('footer-email-tooltip');
  if (emailBtn && emailTooltip) {
    emailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emailTooltip.classList.toggle('active');
    });

    // Close tooltip when clicking anywhere else on the document
    document.addEventListener('click', () => {
      emailTooltip.classList.remove('active');
    });

    // Prevent closing tooltip when clicking inside the tooltip container itself (allowing the mailto link to trigger)
    emailTooltip.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Physics & animation states
  let phi = -Math.PI / 2 + 0.02; // Orbit angle (starts near 12 o'clock and swings dynamically under gravity)
  let omega_phi = 0; // Angular velocity of the pivot
  let frameCount = 0;

  // Physics Settings
  const damp = 1.0; // Lossless damping (kept for compatibility)

  // Pendulum nodes physical masses (0: Pivot, 1: Node 1, 2: Node 2)
  // Mass ratio set strictly to 4:2:3.
  const mass = [20.0, 10.0, 5.0];

  // Spring Pendulum Constants
  const k_spring1 = 3;
  const k_spring2 = 0.5;
  const c_damping = 0.0;

  // Cartesian coordinates of the nodes
  let x1 = 0, y1 = 0;
  let vx1 = 0, vy1 = 0;
  let x2 = 0, y2 = 0;
  let vx2 = 0, vy2 = 0;

  // Pendulum nodes Cartesian states for rendering compatibility
  const pos = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ];

  let isInitialized = false;

  function initNodeAngles() {
    // Rest lengths
    const L1 = isMobile ? 45 : 100;
    const L2 = L1 * 1;

    // Start with small deflected angles
    const theta1 = 0.1;
    const theta2 = 0.1;

    // Node 0 (Pivot) start position
    const x0 = cx + (isMobile ? 130 : 240) * Math.cos(phi);
    const y0 = cy + (isMobile ? 130 : 240) * Math.sin(phi);

    // Initial positions based on rest lengths and angles
    x1 = x0 + L1 * Math.sin(theta1);
    y1 = y0 + L1 * Math.cos(theta1);

    x2 = x1 + L2 * Math.sin(theta2);
    y2 = y1 + L2 * Math.cos(theta2);

    vx1 = 0; vy1 = 0;
    vx2 = 0; vy2 = 0;

    isInitialized = true;
  }

  // Pre-allocated typed arrays for RK4 integration to prevent memory allocation / Garbage Collection micro-stutter
  const state_q = new Float64Array(5);
  const state_w = new Float64Array(5);
  const temp_q = new Float64Array(5);
  const temp_w = new Float64Array(5);
  const k1_q = new Float64Array(5);
  const k1_w = new Float64Array(5);
  const k2_q = new Float64Array(5);
  const k2_w = new Float64Array(5);
  const k3_q = new Float64Array(5);
  const k3_w = new Float64Array(5);
  const k4_q = new Float64Array(5);
  const k4_w = new Float64Array(5);

  // Cartesian Spring-Coupled equations of motion
  // q = [phi, x1, y1, x2, y2]
  // w = [omega_phi, vx1, vy1, vx2, vy2]
  function computeDerivatives(q, w, L1_rest, L2_rest, R, out) {
    const phi = q[0];
    const x_node1 = q[1];
    const y_node1 = q[2];
    const x_node2 = q[3];
    const y_node2 = q[4];

    const omega_phi = w[0];
    const vx1 = w[1];
    const vy1 = w[2];
    const vx2 = w[3];
    const vy2 = w[4];

    // Node 0 (Pivot) position and velocity
    const x0 = cx + R * Math.cos(phi);
    const y0 = cy + R * Math.sin(phi);
    const vx0 = -R * omega_phi * Math.sin(phi);
    const vy0 = R * omega_phi * Math.cos(phi);

    // Vector from Node 0 to Node 1
    const dx1 = x_node1 - x0;
    const dy1 = y_node1 - y0;
    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1e-5;
    const udx1 = dx1 / dist1;
    const udy1 = dy1 / dist1;

    // Relative velocity 1
    const rvx1 = vx1 - vx0;
    const rvy1 = vy1 - vy0;
    const v_rel_spring1 = rvx1 * udx1 + rvy1 * udy1;

    // Spring force 1 (acts on Node 1 from Node 0)
    const F_spring1_mag = -k_spring1 * (dist1 - L1_rest) - c_damping * v_rel_spring1;
    const Fs1_x = F_spring1_mag * udx1;
    const Fs1_y = F_spring1_mag * udy1;

    // Vector from Node 1 to Node 2
    const dx2 = x_node2 - x_node1;
    const dy2 = y_node2 - y_node1;
    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1e-5;
    const udx2 = dx2 / dist2;
    const udy2 = dy2 / dist2;

    // Relative velocity 2
    const rvx2 = vx2 - vx1;
    const rvy2 = vy2 - vy1;
    const v_rel_spring2 = rvx2 * udx2 + rvy2 * udy2;

    // Spring force 2 (acts on Node 2 from Node 1)
    const F_spring2_mag = -k_spring2 * (dist2 - L2_rest) - c_damping * v_rel_spring2;
    const Fs2_x = F_spring2_mag * udx2;
    const Fs2_y = F_spring2_mag * udy2;

    const m0 = mass[0];
    const m1 = mass[1];
    const m2 = mass[2];

    // Node 0 tangential acceleration
    // Torque = force * tangent
    const tau = m0 * g * R * Math.cos(phi) + Fs1_x * R * Math.sin(phi) - Fs1_y * R * Math.cos(phi);
    
    out[0] = tau / (m0 * R * R);
    out[1] = (Fs1_x - Fs2_x) / m1;
    out[2] = g + (Fs1_y - Fs2_y) / m1;
    out[3] = Fs2_x / m2;
    out[4] = g + Fs2_y / m2;
  }

  // Trails to store previous positions of the two nodes
  const trail1 = [];
  const trail2 = [];
  const redBeadTrail = [];
  // Constant permanent trails (cleared on page navigation/hashchange)
  // We set a high maximum length of 20000 points as a safety limit to prevent memory leaks
  const maxTrailLength = 20000;
  const skipFrames = 3;

  // Clear trails when navigating to other pages (SPA view change)
  window.addEventListener('hashchange', () => {
    trail1.length = 0;
    trail2.length = 0;
    redBeadTrail.length = 0;
  });

  function updatePhysicsAndRender() {
    ctx.clearRect(0, 0, designSize, designSize);

    // 0. Update Central Clock & Date Display (24-hour format with seconds + YYYY. MM. DD. Day)
    const clockEl = document.getElementById('center-clock');
    const dateEl = document.getElementById('center-date');
    const now = new Date();

    if (clockEl) {
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${hrs}:${mins}:${secs}`;
    }

    if (dateEl) {
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayName = days[now.getDay()];
      dateEl.textContent = `${yyyy}. ${mm}. ${dd}. ${dayName}`;
    }

    // 1. Determine device dimensions
    const R = isMobile ? 130 : 240; // Orbit ring radius (Desktop 240, Mobile 130)

    // 1.5. Draw matching static orbit ring inside canvas (ensures perfect alignment with pendulum pivot)
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Pendulum rod lengths (Ratio L1:L2 is set strictly to 2:3)
    const L1 = isMobile ? 45 : 100;
    const L2 = L1 * 1;

    // Initialize node angles if not done
    if (!isInitialized) {
      initNodeAngles();
    }

    // 3. Runge-Kutta 4th Order (RK4) Integration Sub-stepping
    // Unifies the pivot (Node 0) and the double pendulum (Nodes 1, 2) in a 3-DOF state vector,
    // ensuring perfect physical coupling and energy conservation.
    // Reduced subSteps to 12 and optimized math to run without any garbage allocations.
    const subSteps = 20;
    const dt = 0.02;

    state_q[0] = phi;
    state_q[1] = x1;
    state_q[2] = y1;
    state_q[3] = x2;
    state_q[4] = y2;

    state_w[0] = omega_phi;
    state_w[1] = vx1;
    state_w[2] = vy1;
    state_w[3] = vx2;
    state_w[4] = vy2;

    for (let step = 0; step < subSteps; step++) {
      // k1
      computeDerivatives(state_q, state_w, L1, L2, R, k1_w);
      for (let i = 0; i < 5; i++) k1_q[i] = state_w[i];

      // k2
      for (let i = 0; i < 5; i++) {
        temp_q[i] = state_q[i] + 0.5 * dt * k1_q[i];
        temp_w[i] = state_w[i] + 0.5 * dt * k1_w[i];
      }
      computeDerivatives(temp_q, temp_w, L1, L2, R, k2_w);
      for (let i = 0; i < 5; i++) k2_q[i] = temp_w[i];

      // k3
      for (let i = 0; i < 5; i++) {
        temp_q[i] = state_q[i] + 0.5 * dt * k2_q[i];
        temp_w[i] = state_w[i] + 0.5 * dt * k2_w[i];
      }
      computeDerivatives(temp_q, temp_w, L1, L2, R, k3_w);
      for (let i = 0; i < 5; i++) k3_q[i] = temp_w[i];

      // k4
      for (let i = 0; i < 5; i++) {
        temp_q[i] = state_q[i] + dt * k3_q[i];
        temp_w[i] = state_w[i] + dt * k3_w[i];
      }
      computeDerivatives(temp_q, temp_w, L1, L2, R, k4_w);
      for (let i = 0; i < 5; i++) k4_q[i] = temp_w[i];

      // Update state vectors
      for (let i = 0; i < 5; i++) {
        state_q[i] += (dt / 6) * (k1_q[i] + 2 * k2_q[i] + 2 * k3_q[i] + k4_q[i]);
        state_w[i] += (dt / 6) * (k1_w[i] + 2 * k2_w[i] + 2 * k3_w[i] + k4_w[i]);
      }
    }

    // Unpack states back
    phi = state_q[0];
    omega_phi = state_w[0];
    x1 = state_q[1];
    y1 = state_q[2];
    x2 = state_q[3];
    y2 = state_q[4];
    vx1 = state_w[1];
    vy1 = state_w[2];
    vx2 = state_w[3];
    vy2 = state_w[4];

    // Normalize values to stay within [-2*PI, 2*PI] to prevent precision loss
    if (Math.abs(phi) > 2 * Math.PI) {
      phi = phi % (2 * Math.PI);
    }

    const x0 = cx + R * Math.cos(phi);
    const y0 = cy + R * Math.sin(phi);

    pos[0].x = x0;
    pos[0].y = y0;
    pos[1].x = x1;
    pos[1].y = y1;
    pos[2].x = x2;
    pos[2].y = y2;

    // Update trails on skip interval (storing the current timestamp)
    frameCount++;
    if (frameCount % skipFrames === 0) {
      const now = Date.now();
      trail1.push({ x: x1, y: y1, t: now });
      trail2.push({ x: x2, y: y2, t: now });
    }

    // Clean up points older than 40 seconds (30s full opacity + 10s fade-out)
    const cutoff = Date.now() - 40000;
    while (trail1.length > 0 && trail1[0].t < cutoff) {
      trail1.shift();
    }
    while (trail2.length > 0 && trail2[0].t < cutoff) {
      trail2.shift();
    }

    // 4.5. Draw trails (retains full opacity for 30s, then fades out over 10s)
    const drawTrail = (trail, colorRGB, lineWidth = 1.0) => {
      if (trail.length < 2) return;
      const now = Date.now();
      for (let i = 1; i < trail.length; i++) {
        const p1 = trail[i - 1];
        const p2 = trail[i];
        const age = now - p2.t;
        let alpha = 0.22;
        if (age > 30000) {
          alpha = Math.max(0, 0.22 * (1 - (age - 30000) / 10000));
        }
        if (alpha <= 0) continue;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(${colorRGB}, ${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    const trailWidth = isMobile ? 1.5 : 2.25;
    drawTrail(trail1, '173, 203, 247', trailWidth); // Node 1: #adcbf7 (Width 2.25, Mass 2.0, Blue)
    drawTrail(trail2, '180, 214, 168', trailWidth); // Node 2: #b4d6a8 (Width 2.25, Mass 3.0, Melon Green)

    // 5. Draw rods
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = isMobile ? 1.0 : 1.5;
    ctx.stroke();

    // 6. Draw nodes (custom fill with solid white border, sized proportionally to mass)
    const drawNode = (nx, ny, r = 4.5, color = '#000000') => {
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const pivotRadius = isMobile ? 7.0 : 11.0;
    const node1Radius = isMobile ? 6.0 : 10.0;
    const node2Radius = isMobile ? 4.5 : 7.0;
    const redBeadRadius = isMobile ? 4.5 : 7.5;

    // Node sizes scaled proportionally (Pivot mass 4.0, Node 1 mass 2.0, Node 2 mass 3.0)
    drawNode(x0, y0, pivotRadius, '#888888'); // Pivot (Mass 4.0, Grey)
    drawNode(x1, y1, node1Radius, '#adcbf7');  // Node 1 (Mass 2.0)
    drawNode(x2, y2, node2Radius, '#b4d6a8'); // Node 2 (Mass 3.0)

    // 6.2 Render the red bead acting as the Sweep Second Hand of the central clock (symmetrically starts at 12 o'clock / -Math.PI / 2)
    const seconds = now.getSeconds();
    const ms = now.getMilliseconds();

    // 60 seconds = 2 * Math.PI rad -> 1 second = PI / 30 rad -> 1 millisecond = PI / 30000 rad
    const angle_red = -Math.PI / 2 +
      (seconds * Math.PI / 30) +
      (ms * Math.PI / 30000);

    const red_x = cx + R * Math.cos(angle_red);
    const red_y = cy + R * Math.sin(angle_red);

    // Spawn smoke particle shooting backward purely in the tangent direction (shorter jet tail)
    const ux = Math.sin(angle_red);
    const uy = -Math.cos(angle_red);
    const ejectSpeed = isMobile ? 1.6 : 3.0; // speed in pixels per frame
    
    // Pure tangent velocity with minor random dispersion
    const vx = ux * ejectSpeed + (Math.random() - 0.5) * 0.4;
    const vy = uy * ejectSpeed + (Math.random() - 0.5) * 0.4;

    redBeadTrail.push({
      x: red_x,
      y: red_y,
      vx: vx,
      vy: vy,
      age: 0
    });

    // Update and draw expanding jet smoke trail (clean tangent linear motion, short lifetime)
    if (redBeadTrail.length > 0) {
      ctx.save();
      for (let i = redBeadTrail.length - 1; i >= 0; i--) {
        const p = redBeadTrail[i];
        
        // Move particle
        p.x += p.vx;
        p.y += p.vy;

        // Soft air resistance to let it fade out gracefully at the tail end
        p.vx *= 0.985;
        p.vy *= 0.985;

        // Age particle (assuming ~16.7ms per frame at 60fps)
        p.age += 16.7;

        // Rotate the velocity vector as it ages to bend the tail end slightly (vortex wake effect towards the circle)
        const ageRatio = Math.min(1.0, p.age / 900);
        const angleDelta = -0.02 * ageRatio; // negative angle rotates counter-clockwise, curving inwards towards the circle
        const cosD = Math.cos(angleDelta);
        const sinD = Math.sin(angleDelta);
        const newVx = p.vx * cosD - p.vy * sinD;
        const newVy = p.vx * sinD + p.vy * cosD;
        p.vx = newVx;
        p.vy = newVy;

        // Remove old particles (lifetime 0.9 seconds for a compact look)
        if (p.age > 900) {
          redBeadTrail.splice(i, 1);
          continue;
        }

        const ageFraction = p.age / 900;
        const alpha = Math.max(0, 0.14 * (1 - ageFraction)); // soft subtle opacity (0.14 max)
        if (alpha <= 0) continue;

        // Smoke particles expand as they age
        const size = redBeadRadius * (0.6 + 1.6 * ageFraction);

        // Draw soft, wispy smoke using a radial gradient (completely removes hard circular borders)
        const grad = ctx.createRadialGradient(p.x, p.y, size * 0.05, p.x, p.y, size);
        grad.addColorStop(0, `rgba(226, 109, 92, ${alpha})`);
        grad.addColorStop(0.3, `rgba(226, 109, 92, ${alpha * 0.4})`);
        grad.addColorStop(1, 'rgba(226, 109, 92, 0)');

        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.restore();
    }

    drawNode(red_x, red_y, redBeadRadius, '#e26d5c'); // Red Node (Clock Sweep Second Hand Indicator)



    requestAnimationFrame(updatePhysicsAndRender);
  }

  updatePhysicsAndRender();
}

/* ----------------------------------
   SPA VIEW CONTROL & ROUTING & FLIP TRANSITION
------------------------------------- */
function showView(viewId) {
  // Hide all views
  document.querySelectorAll('.view-section').forEach(view => {
    view.style.display = 'none';
    // Clear any inline style values from page transitions
    view.style.opacity = '';
    view.style.transform = '';
    view.style.transition = '';
    view.style.animation = '';
  });

  // Show target view
  const targetView = document.getElementById(`${viewId}-view`);
  if (targetView) {
    targetView.style.display = 'block';
  }
}

// Router to resolve view states based on URL hashes and filenames
function handleRouting() {
  const hash = window.location.hash;
  const oldHash = currentActiveHash;
  currentActiveHash = hash;

  const performRouting = () => {
    const cleanHash = hash.substring(1);
    const headerContainer = document.getElementById('header-subpage-container');
    const headerTitle = document.getElementById('header-subpage-title');

    // Page checks
    const pathName = window.location.pathname;
    const isDiaryPage = pathName.includes('diary');
    const isStudyPage = pathName.includes('study');
    const isHistoryPage = pathName.includes('history');
    const isHomePage = !isDiaryPage && !isStudyPage && !isHistoryPage;

    if (isHomePage) {
      // Home page: backward-compatibility redirect or normal load
      if (cleanHash === 'diary' || cleanHash === 'study' || cleanHash === 'history') {
        window.location.href = `./pages/${cleanHash}/`;
        return;
      }
      if (cleanHash.startsWith('diary/') || cleanHash.startsWith('study/')) {
        const parts = cleanHash.split('/');
        window.location.href = `./pages/${parts[0]}/#${cleanHash}`;
        return;
      }

      // Normal Home page initialization
      showView('home');
      document.title = "Subin's Blog";
      ensureHistorySatelliteUpdated();

      const homeView = document.getElementById('home-view');
      const entranceOverlay = document.getElementById('home-entrance-overlay');
      
      // Determine if returning from subpage via URL parameter (?from=...)
      const urlParams = new URLSearchParams(window.location.search);
      const isReturningFromSubpage = urlParams.has('from');

      if (homeView && entranceOverlay) {
        homeView.classList.remove('entrance-step-1', 'entrance-step-2', 'home-exiting');

        if (isReturningFromSubpage) {
          // Clear query params to avoid re-triggering entrance animation on page reload
          window.history.replaceState({}, document.title, window.location.pathname);

          entranceOverlay.style.display = 'none';
          entranceOverlay.style.opacity = '0';
          homeView.classList.add('home-entrance-active');

          // Force reflow
          homeView.offsetHeight;

          // Step 1: Fade-in and scale-in the center orbit line & canvas (50ms)
          setTimeout(() => {
            homeView.classList.add('entrance-step-1');
          }, 50);

          // Step 2: Slide out the satellites from center (200ms)
          setTimeout(() => {
            homeView.classList.add('entrance-step-2');
          }, 200);

          // Step 3: Clean up animation class properties after transition completes (850ms)
          setTimeout(() => {
            homeView.classList.remove('home-entrance-active', 'entrance-step-1', 'entrance-step-2');
          }, 850);
        } else {
          // Initial load: just ensure elements are visible normally
          entranceOverlay.style.display = 'none';
          entranceOverlay.style.opacity = '0';
        }
      }
    } else if (isDiaryPage) {
      // Diary page:
      document.body.classList.add('theme-diary');
      document.body.classList.remove('theme-study', 'theme-history');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = 'Diary';
        headerContainer.classList.add('active');
        headerTitle.classList.add('show');
      }
      
      const listContainer = document.getElementById('diary-list-container');
      const readerContainer = document.getElementById('diary-reader-container');

      if (cleanHash && cleanHash !== 'diary' && (cleanHash.startsWith('diary/') || !cleanHash.includes('/'))) {
        // We are on reader mode
        if (listContainer) listContainer.style.display = 'none';
        if (readerContainer) readerContainer.style.display = 'block';

        const filename = cleanHash.startsWith('diary/') 
          ? decodeURIComponent(cleanHash.substring(6)) 
          : decodeURIComponent(cleanHash);
        
        const post = diaryPosts.find(p => p.filename === filename);
        if (post) {
          renderReader(post, 'diary');
        } else {
          window.location.hash = '';
        }
      } else {
        // We are on list mode
        if (listContainer) listContainer.style.display = 'block';
        if (readerContainer) readerContainer.style.display = 'none';
        if (typeof renderDiary === 'function') renderDiary();
        document.title = "Diary | Subin's Blog";
        window.scrollTo(0, 0);
      }
    } else if (isStudyPage) {
      // Study page:
      document.body.classList.add('theme-study');
      document.body.classList.remove('theme-diary', 'theme-history');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = 'Study';
        headerContainer.classList.add('active');
        headerTitle.classList.add('show');
      }

      const listContainer = document.getElementById('study-list-container');
      const readerContainer = document.getElementById('study-reader-container');

      if (cleanHash && cleanHash !== 'study' && (cleanHash.startsWith('study/') || !cleanHash.includes('/'))) {
        // We are on reader mode
        if (listContainer) listContainer.style.display = 'none';
        if (readerContainer) readerContainer.style.display = 'block';

        const filename = cleanHash.startsWith('study/') 
          ? decodeURIComponent(cleanHash.substring(6)) 
          : decodeURIComponent(cleanHash);

        const post = studyPosts.find(p => p.filename === filename);
        if (post) {
          renderReader(post, 'study');
        } else {
          window.location.hash = '';
        }
      } else {
        // We are on list mode
        if (listContainer) listContainer.style.display = 'block';
        if (readerContainer) readerContainer.style.display = 'none';
        if (typeof renderStudy === 'function') renderStudy();
        document.title = "Study | Subin's Blog";
        window.scrollTo(0, 0);
      }
    } else if (isHistoryPage) {
      // History page:
      document.body.classList.add('theme-history');
      document.body.classList.remove('theme-study', 'theme-diary');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = 'History';
        headerContainer.classList.add('active');
        headerTitle.classList.add('show');
      }
      document.title = "History | Subin's Blog";
      window.scrollTo(0, 0);
    }

    // Google Analytics virtual page_view track
    if (typeof gtag === 'function') {
      gtag('config', 'G-Y1K0WLJYQS', {
        'page_path': window.location.pathname + window.location.hash,
        'page_title': document.title
      });
    }
  };

  performRouting();
}

/* ----------------------------------
   EXPANDING RIPPLE PAGE TRANSITION
------------------------------------- */
let isTransitioning = false;

// Handle browser Back/Forward cache (bfcache) loads to clean up transition locks and hidden page states
window.addEventListener('pageshow', (event) => {
  isTransitioning = false;

  // Remove transition classes and inline styles from body
  document.body.classList.remove(
    'global-transitioning',
    'transitioning-diary',
    'transitioning-study',
    'transitioning-history',
    'footer-transitioning'
  );
  document.body.style.transition = '';

  // Reset Home View state
  const homeView = document.getElementById('home-view');
  if (homeView) {
    homeView.classList.remove('home-exiting', 'home-entrance-active', 'entrance-step-1', 'entrance-step-2');
    homeView.style.opacity = '';
    homeView.style.transform = '';
  }

  // Ensure active view is visible and not stuck in transition opacity
  const activeView = document.querySelector('.view-section');
  if (activeView) {
    activeView.style.opacity = '';
    activeView.style.transform = '';
    activeView.style.display = 'block';
  }

  // Ensure History satellite is correctly labeled/targeted (handles old browser cache issues)
  ensureHistorySatelliteUpdated();

  // Reset satellite positioning/opacity
  document.querySelectorAll('.orbit-satellite, .satellite-career').forEach(sat => {
    sat.classList.remove('moving-to-center');
    sat.style.opacity = '';
    sat.style.transform = '';
  });

  // Clean up subpage text overlay on page show if we loaded from cache
  const textOverlay = document.getElementById('subpage-transition-text');
  if (textOverlay && event.persisted) {
    textOverlay.remove();
  }
});

function ensureHistorySatelliteUpdated() {
  const oldCareerSat = document.querySelector('.satellite-career');
  if (oldCareerSat) {
    oldCareerSat.classList.remove('satellite-career');
    oldCareerSat.classList.add('satellite-history');
    const btn = oldCareerSat.querySelector('.orbit-btn');
    if (btn) {
      btn.setAttribute('data-target', 'history');
      const span = btn.querySelector('span');
      if (span) span.textContent = 'History';
    }
  }
}

function triggerCenterTransition(target, targetUrl, satelliteEl, clickEvent) {
  if (isTransitioning) return;
  isTransitioning = true;

  // Add global transition and theme-specific transitioning classes to body
  document.body.classList.add('global-transitioning', `transitioning-${target}`);

  // Add exiting class to home view to fade out and shrink other layout elements
  const homeView = document.getElementById('home-view');
  if (homeView) {
    homeView.classList.add('home-exiting');
  }

  // Add class to animate slide to center (takes 600ms).
  satelliteEl.classList.add('moving-to-center');

  // Wait 600ms (slide animation of satellite completes and reaches the center) then immediately redirect
  setTimeout(() => {
    window.location.href = targetUrl;
  }, 600);
}

function startHeaderWindBlow() {
  const headerContainer = document.getElementById('header-subpage-container');
  if (!headerContainer || !headerContainer.classList.contains('active')) return;
  
  const separatorSpan = headerContainer.querySelector('.subpage-separator');
  const titleSpan = headerContainer.querySelector('.subpage-title');
  const separatorText = separatorSpan ? separatorSpan.textContent : '/';
  const titleText = titleSpan ? titleSpan.textContent : '';
  
  const titleColor = titleSpan ? window.getComputedStyle(titleSpan).color : '';
  const separatorColor = separatorSpan ? window.getComputedStyle(separatorSpan).color : '';
  
  // Clear any active reset timeout to prevent layout overlap
  if (headerResetTimeout) {
    clearTimeout(headerResetTimeout);
    headerResetTimeout = null;
  }
  
  // Retain 'active' class to prevent trigger of 0.4s fadeout transition during splitting
  headerContainer.classList.add('exit-active');
  
  // Keep footer transparent during the wind-blow animation
  document.body.classList.add('footer-transitioning');
  
  const titleLen = titleText.length;
  const fragment = document.createDocumentFragment();
  
  // 1. Separator span (exits last, after all title letters fly away)
  const sepSpan = document.createElement('span');
  sepSpan.textContent = separatorText;
  sepSpan.className = 'subpage-separator';
  sepSpan.style.display = 'inline-block';
  sepSpan.style.color = separatorColor;
  sepSpan.style.marginRight = '0.8rem'; // Maintain original visual spacing without layout gap shifts
  fragment.appendChild(sepSpan);
  
  // Drive via Web Animations API to isolate animation playback from display/class reflow restarts
  sepSpan.animate([
    { transform: 'translateX(0) translateY(0) rotate(0deg) scale(1)', filter: 'blur(0)', opacity: 0.35 },
    { opacity: 0.3, transform: 'translateX(9vw) translateY(10px) rotate(17deg) scale(0.85)', filter: 'blur(1px)', offset: 0.5 },
    { transform: 'translateX(18vw) translateY(20px) rotate(35deg) scale(0.65)', filter: 'blur(3px)', opacity: 0 }
  ], {
    duration: 1400,
    delay: (titleLen + 2) * 40,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    fill: 'both'
  });
  
  // 2. Title character spans (delayed in reverse order: y -> r -> a -> i -> d)
  for (let i = 0; i < titleLen; i++) {
    const char = titleText[i];
    const span = document.createElement('span');
    span.textContent = char === ' ' ? '\u00A0' : char;
    span.className = 'subpage-title show'; // Retains the original green/blue/red font styles and colors
    span.style.display = 'inline-block';
    span.style.color = titleColor;
    span.style.margin = '0'; // Prevent default margin jumps
    fragment.appendChild(span);
    
    // Linearly increase flight distance from 23vw (leftmost, 'D') to 33vw (rightmost, 'y')
    const dist = titleLen > 1 ? 23 + (i * (10 / (titleLen - 1))) : 30;
    
    // Stagger wind-blow using Web Animations API (Interpolates cleanly from theme color to solid white)
    span.animate([
      { transform: 'translateX(0) translateY(0) rotate(0deg) scale(1)', filter: 'blur(0)', opacity: 1, color: titleColor },
      { opacity: 0.85, transform: `translateX(${dist * 0.5}vw) translateY(10px) rotate(17deg) scale(0.85)`, filter: 'blur(1px)', color: titleColor, offset: 0.5 },
      { transform: `translateX(${dist}vw) translateY(20px) rotate(35deg) scale(0.65)`, filter: 'blur(3px)', opacity: 0, color: '#ffffff' }
    ], {
      duration: 1400,
      delay: (titleLen - 1 - i) * 40,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      fill: 'both'
    });
  }
  
  // Atomic DOM updates using Fragment to prevent flickering jumps
  headerContainer.innerHTML = '';
  headerContainer.appendChild(fragment);
  
  headerResetTimeout = setTimeout(() => {
    headerContainer.style.transition = 'none';
    headerContainer.style.opacity = '0';
    
    headerContainer.innerHTML = `
      <span class="subpage-separator">/</span>
      <span class="subpage-title" id="header-subpage-title"></span>
    `;
    
    // Safely remove body theme classes here to prevent recalculating styles during animation flight
    document.body.classList.remove('theme-diary', 'theme-study', 'theme-history', 'footer-transitioning');
    headerContainer.classList.remove('active', 'exit-active');
    
    requestAnimationFrame(() => {
      headerContainer.offsetHeight; // Reflow
      headerContainer.style.transition = '';
      headerContainer.style.opacity = '';
    });
  }, 1800);
}

function triggerTransition(targetUrl, clickEvent) {
  if (isTransitioning) return;
  isTransitioning = true;

  // Make footer transparent for entire ripple duration
  document.body.classList.add('footer-transitioning');

  // Find the currently active view section and fade it out smoothly in place
  const currentActiveView = document.querySelector('.view-section');
  if (currentActiveView) {
    currentActiveView.style.animation = 'none';
    currentActiveView.offsetHeight; // Force layout recalculation
    currentActiveView.style.transition = 'opacity 0.55s ease-out';
    currentActiveView.style.opacity = '0';
  }

  // Create circular transition element at coordinates of mouse click
  const ripple = document.createElement('div');
  ripple.className = 'expanding-circle';
  
  // If returning to home, the default color is white. If going to subpage, we can match theme
  const goingHome = targetUrl.includes('index.html') || targetUrl === '../' || targetUrl.includes('../index.html');
  if (!goingHome) {
    let targetTheme = 'diary';
    if (targetUrl.includes('study')) targetTheme = 'study';
    else if (targetUrl.includes('history')) targetTheme = 'history';
    ripple.classList.add(`theme-${targetTheme}`);
  }
  document.body.appendChild(ripple);

  const x = clickEvent ? (clickEvent.clientX || window.innerWidth / 2) : window.innerWidth / 2;
  const y = clickEvent ? (clickEvent.clientY || window.innerHeight / 2) : window.innerHeight / 2;

  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  // Start the expand animation
  requestAnimationFrame(() => {
    ripple.classList.add('active');
  });

  // Redirect after the screen is completely covered (500ms for subpage, 850ms for home to allow full fadeout)
  const delay = goingHome ? 850 : 500;
  setTimeout(() => {
    window.location.href = targetUrl;
  }, delay);
}

// Intercept standard data-target button clicks to trigger expanding animations
function initNavigationInterceptors() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-target]');
    if (btn) {
      e.preventDefault();
      const target = btn.getAttribute('data-target');
      
      const pathName = window.location.pathname;
      const isSubpage = pathName.includes('/diary/') || pathName.includes('/study/') || pathName.includes('/history/');
      const isPagesSubpage = pathName.includes('/pages/');

      let pageName = 'home';
      if (pathName.includes('diary')) pageName = 'diary';
      else if (pathName.includes('study')) pageName = 'study';
      else if (pathName.includes('history')) pageName = 'history';

      let targetUrl;
      const rootPath = isPagesSubpage ? '../../' : (isSubpage ? '../' : './');

      if (target === 'home') {
        const fromParam = (isPagesSubpage || isSubpage) ? `?from=${pageName}` : '';
        targetUrl = rootPath + `index.html${fromParam}`;
      } else {
        targetUrl = isPagesSubpage ? `../${target}/?from=home` : (isSubpage ? `../${target}/?from=home` : `./pages/${target}/?from=home`);
      }

      const satellite = btn.closest('.orbit-satellite');
      if (satellite) {
        triggerCenterTransition(target, targetUrl, satellite, e);
      } else {
        triggerTransition(targetUrl, e);
      }
    }
  });

  // Handle clicking on main logo "Subin's blog" to go home
  const mainLogo = document.querySelector('.main-logo');
  if (mainLogo) {
    mainLogo.addEventListener('click', (e) => {
      e.preventDefault();
      const pathName = window.location.pathname;
      const isSubpage = pathName.includes('/diary/') || pathName.includes('/study/') || pathName.includes('/history/');
      const isPagesSubpage = pathName.includes('/pages/');
      
      if (!isSubpage && !isPagesSubpage) {
        window.location.reload();
      } else {
        if (typeof startHeaderWindBlow === 'function') {
          startHeaderWindBlow();
        }
        let pageName = 'home';
        if (pathName.includes('diary')) pageName = 'diary';
        else if (pathName.includes('study')) pageName = 'study';
        else if (pathName.includes('history')) pageName = 'history';
        const fromParam = `?from=${pageName}`;
        const rootPath = isPagesSubpage ? '../../' : '../';
        triggerTransition(`${rootPath}index.html${fromParam}`, e);
      }
    });
  }

  // Handle clicking on header subpage title area to go back to list
  const headerSubpageContainer = document.getElementById('header-subpage-container');
  if (headerSubpageContainer) {
    headerSubpageContainer.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = '';
    });
  }
}





// Render Markdown Reader Mode
function renderReader(post, prefix = 'diary') {
  const listContainer = document.getElementById(`${prefix}-list-container`);
  const readerContainer = document.getElementById(`${prefix}-reader-container`);

  // Set document title
  document.title = `${post.title} | Subin's Blog`;

  // Mark as read
  markPostAsRead(post.filename);

  // Set header details
  document.getElementById(`${prefix}-reader-post-title`).textContent = post.title;
  let dateHtml = `<i class="far fa-calendar-alt"></i> 작성: ${post.date.split(' ')[0]}`;
  const createdDateOnly = post.date.split(' ')[0];
  const updatedDateOnly = post.updated ? post.updated.split('T')[0] : createdDateOnly;
  if (createdDateOnly !== updatedDateOnly && post.updated) {
    dateHtml += ` <span class="reader-post-updated"><i class="fas fa-edit"></i> 수정: ${updatedDateOnly}</span>`;
  }
  document.getElementById(`${prefix}-reader-post-date`).innerHTML = dateHtml;

  const categoryTag = post.categories && post.categories.length > 0
    ? `<span class="post-category-tag">${post.categories[0]}</span>`
    : '';
  document.getElementById(`${prefix}-reader-post-category`).innerHTML = categoryTag;

  // Determine the base path for images in this post's folder
  // post.folder is the subdirectory name within _posts/ (e.g. "2018-01-23-norway-1")
  const pathNameForImg = window.location.pathname;
  const isSubpageForImg = pathNameForImg.includes('/diary/') || pathNameForImg.includes('/study/') || pathNameForImg.includes('/history/');
  const isPagesSubpageForImg = pathNameForImg.includes('/pages/');
  const basePathForImg = isPagesSubpageForImg ? '../../' : (isSubpageForImg ? '../' : './');
  const postImgBase = post.folder ? `${basePathForImg}${post.folder}/` : basePathForImg;

  // Compile markdown
  if (window.marked) {
    // Step 1: Strip Jekyll Kramdown attribute syntax {: width=... height=... }
    let cleanContent = post.content.replace(/\{:\s*[^}]*\}/g, '');

    // Step 2: Pre-process image paths and captions directly in the markdown text

    //   a) Re-map generic 'Desktop View' alt text to the next line's caption if present
    cleanContent = cleanContent.replace(
      /!\[([^\]]*)\]\(([^)]+?)\)\s*\r?\n\s*[_*][ \t]*(.+?)[ \t]*[_*]/g,
      (match, alt, imgPath, caption) => {
        const cleanAlt = (alt === 'Desktop View' || !alt) ? caption : alt;
        return `![${cleanAlt}](${imgPath})`;
      }
    );

    //   b) HTML <img> tag absolute path correction: src="/assets/img/..." -> src="./_posts/..."
    cleanContent = cleanContent.replace(
      /<img([^>]*?)src="\/assets\/img\/([^"]+)"/g,
      (_, before, imgPath) => `<img${before}src="${basePathForImg}_posts/${imgPath}"`
    );

    //   c) HTML <img> tag relative path correction: src="X.jpeg" -> src="postImgBase/X.jpeg"
    cleanContent = cleanContent.replace(
      /<img([^>]*?)src="(?!https?:\/\/)(?!\/)(?!\.\/)([^"]+)"/g,
      (_, before, imgPath) => `<img${before}src="${postImgBase}${imgPath}"`
    );

    //   d) Legacy absolute /assets/img/X paths in markdown → ./_posts/X
    cleanContent = cleanContent.replace(
      /!\[([^\]]*)\]\((\/assets\/img\/|assets\/img\/)([^)]+)\)/g,
      (_, alt, prefix, imgPath) => `![${alt}](${basePathForImg + '_posts/' + imgPath})`
    );

    //   e) Relative paths in markdown (no leading / or http) → prefix with post folder
    cleanContent = cleanContent.replace(
      /!\[([^\]]*)\]\((?!https?:\/\/)(?!\/)([^)]+)\)/g,
      (_, alt, imgPath) => {
        const resolved = imgPath.startsWith('./') ? postImgBase + imgPath.substring(2) : postImgBase + imgPath;
        return `![${alt}](${resolved})`;
      }
    );

    // Step 3: Parse with marked (no custom renderer needed — paths already resolved)
    const rawHtml = marked.parse(cleanContent);

    // Step 4: Wrap standalone markdown <img> tags (wrapped in <p>) in <figure>
    // Alt text is used as caption. Avoid wrapping existing HTML <figure> tags.
    const wrappedHtml = rawHtml.replace(
      /<p>\s*<img([^>]*?)alt="([^"]*)"([^>]*?)>\s*<\/p>/g,
      (_, before, alt, after) => {
        const cleanAlt = alt.trim();
        if (cleanAlt && cleanAlt !== 'Desktop View') {
          return `<figure><img${before}alt="${alt}"${after} loading="lazy"><figcaption>${cleanAlt}</figcaption></figure>`;
        } else {
          return `<figure><img${before}alt="${alt}"${after} loading="lazy"></figure>`;
        }
      }
    );

    document.getElementById(`${prefix}-reader-post-content`).innerHTML = wrappedHtml;
  } else {
    document.getElementById(`${prefix}-reader-post-content`).innerHTML = `<pre>${escapeHtml(post.content)}</pre>`;
  }

  // Wrap table tags in scrollable table-wrapper containers and auto-merge empty cells (colspan)
  const contentEl = document.getElementById(`${prefix}-reader-post-content`);
  if (contentEl) {
    contentEl.querySelectorAll('table').forEach(table => {
      // 1. Auto-merge cells horizontally (colspan) if they are empty
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.cells);
        if (cells.length > 0) {
          let lastNonEmptyCell = null;
          let spanCount = 1;
          const cellsToRemove = [];

          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const text = cell.textContent.trim();
            const html = cell.innerHTML.trim();
            const isEmpty = text === "" && html.replace(/<br\s*\/?>/gi, '').trim() === "";

            if (i > 0 && isEmpty) {
              if (lastNonEmptyCell) {
                spanCount++;
                cellsToRemove.push(cell);
              }
            } else {
              if (lastNonEmptyCell && spanCount > 1) {
                lastNonEmptyCell.setAttribute('colspan', spanCount);
              }
              lastNonEmptyCell = cell;
              spanCount = 1;
            }
          }
          if (lastNonEmptyCell && spanCount > 1) {
            lastNonEmptyCell.setAttribute('colspan', spanCount);
          }
          cellsToRemove.forEach(c => c.remove());
        }
      });

      // 2. Wrap the table in a scrollable wrapper
      if (!table.parentElement.classList.contains('table-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });
  }

  // Trigger KaTeX math rendering if auto-render is loaded
  if (contentEl && window.renderMathInElement) {
    window.renderMathInElement(contentEl, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  }

  // Toggle views
  listContainer.style.display = 'none';
  readerContainer.style.display = 'block';
  window.scrollTo(0, 0);
}

// Mark post as read
function markPostAsRead(filename) {
  if (!readPosts.has(filename)) {
    readPosts.add(filename);
    localStorage.setItem('read_posts', JSON.stringify(Array.from(readPosts)));
  }
}

// Utility to escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Format date relatively (within 7 days / 1 hour)
function formatPostDate(dateStr) {
  if (!dateStr) return '';

  let parsedDate;
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length >= 2) {
    const datePart = parts[0];
    const timePart = parts[1];
    let tzPart = parts[2] || '';
    if (tzPart && !tzPart.includes(':') && (tzPart.startsWith('+') || tzPart.startsWith('-'))) {
      tzPart = tzPart.slice(0, 3) + ':' + tzPart.slice(3);
    }
    parsedDate = new Date(`${datePart}T${timePart}${tzPart}`);
  } else {
    parsedDate = new Date(dateStr);
  }

  const now = new Date();
  const diffMs = now - parsedDate;

  if (isNaN(diffMs) || diffMs < 0) {
    return dateStr.split(' ')[0];
  }

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return '방금 전';
  } else if (diffHours < 24) {
    return `${diffHours}시간 전`;
  } else if (diffDays <= 7) {
    return `${diffDays}일 전`;
  } else {
    const yyyy = parsedDate.getFullYear();
    const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(parsedDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

// Fullscreen Image Preview Lightbox Modal
function openImagePreview(src, alt) {
  let overlay = document.querySelector('.image-preview-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';

    const previewImg = document.createElement('img');
    previewImg.alt = alt || '';
    overlay.appendChild(previewImg);

    document.body.appendChild(overlay);
  }

  // Bind close-on-click and copy prevention event listeners if they haven't been bound yet
  if (!overlay.dataset.listenerAdded) {
    overlay.addEventListener('click', () => {
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 300);
    });

    // Content copy and extraction prevention inside preview mode
    overlay.addEventListener('copy', (e) => e.preventDefault());
    overlay.addEventListener('selectstart', (e) => e.preventDefault());
    overlay.addEventListener('dragstart', (e) => e.preventDefault());
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());

    overlay.dataset.listenerAdded = 'true';
  }

  const previewImg = overlay.querySelector('img');
  if (previewImg) {
    previewImg.src = src;
    previewImg.alt = alt || '';
  }

  overlay.style.display = 'flex';
  overlay.offsetHeight; // Trigger reflow for transition
  overlay.classList.add('show');
}

// Utility: Find first image in markdown content and resolve its path
function getFirstImageUrl(post) {
  const content = post.content || '';
  
  const pathNameForImg = window.location.pathname;
  const isSubpageForImg = pathNameForImg.includes('/diary/') || pathNameForImg.includes('/study/') || pathNameForImg.includes('/history/');
  const isPagesSubpageForImg = pathNameForImg.includes('/pages/');
  const basePathForImg = isPagesSubpageForImg ? '../../' : (isSubpageForImg ? '../' : './');
  const postImgBase = post.folder ? `${basePathForImg}${post.folder}/` : basePathForImg;

  // 0. Try designated preview image in post front-matter
  if (post.preview) {
    const src = post.preview;
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/') || src.startsWith('./')) {
      if (src.startsWith('/assets/img/')) {
        return src.replace('/assets/img/', `${basePathForImg}_posts/`);
      }
      return src;
    }
    return postImgBase + src;
  }

  // 1. Try HTML img tag
  const imgTagMatch = content.match(/<img[^>]*?src=["']([^"']+)["']/);
  if (imgTagMatch) {
    const src = imgTagMatch[1];
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/') || src.startsWith('./')) {
      if (src.startsWith('/assets/img/')) {
        return src.replace('/assets/img/', `${basePathForImg}_posts/`);
      }
      return src;
    }
    return postImgBase + src;
  }

  // 2. Try markdown image syntax
  const mdImgMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (mdImgMatch) {
    const src = mdImgMatch[1];
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/') || src.startsWith('./')) {
      if (src.startsWith('/assets/img/')) {
        return src.replace('/assets/img/', `${basePathForImg}_posts/`);
      }
      return src;
    }
    return postImgBase + src;
  }

  return null;
}

// Subpage entrance slide-to-header animation on page load
function playSubpageEntranceAnimation(target) {
  const headerTitle = document.getElementById('header-subpage-title');
  const headerContainer = document.getElementById('header-subpage-container');
  if (!headerTitle || !headerContainer) return;

  // Find the pre-rendered transition text overlay in HTML
  let textOverlay = document.getElementById('subpage-transition-text');
  if (!textOverlay) {
    // Fallback if not pre-rendered in HTML
    textOverlay = document.createElement('div');
    textOverlay.className = 'transition-text-overlay active';
    textOverlay.textContent = target.charAt(0).toUpperCase() + target.slice(1);
    textOverlay.style.left = '50%';
    textOverlay.style.top = 'calc(50% - 30px)';
    textOverlay.style.color = 'var(--accent-primary)';
    textOverlay.style.transform = 'translate(-50%, -50%) scale(1.25)';
    document.body.appendChild(textOverlay);
  }

  // Ensure body background is transitioning (in case it wasn't statically set)
  document.body.classList.add(`transitioning-${target}`);

  // Temporarily hide the static header title so we can animate the flying text
  headerTitle.style.opacity = '0';
  headerTitle.classList.remove('show');

  // Find the solid color entrance overlay (hide it since we use body class transitioning instead)
  const overlay = document.getElementById('subpage-entrance-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }

  // Force reflow to ensure layout is computed
  textOverlay.offsetHeight;

  // Wait 50ms to ensure the browser has painted the initial centered state in white
  setTimeout(() => {
    // Calculate the text overlay's actual painted center coordinate dynamically *at this frame*
    const overlayRect = textOverlay.getBoundingClientRect();
    const startX = overlayRect.left + overlayRect.width / 2;
    const startY = overlayRect.top + overlayRect.height / 2;

    // Calculate translation coordinates from current center position to the header title position
    const targetRect = headerTitle.getBoundingClientRect();
    const deltaX = (targetRect.left + targetRect.width / 2) - startX;
    const deltaY = (targetRect.top + targetRect.height / 2) - startY;

    const targetFontSize = parseFloat(window.getComputedStyle(headerTitle).fontSize);
    const baseFontSize = parseFloat(window.getComputedStyle(textOverlay).fontSize);
    const scaleFactor = targetFontSize / baseFontSize;

    // Apply transform transition and smooth color transition (transform takes 0.6s, color changes in 0.05s to instantly contrast with the background)
    textOverlay.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), color 0.05s ease-out';
    textOverlay.style.color = 'var(--accent-primary)';
    textOverlay.style.transform = `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(${scaleFactor})`;

    // Explicitly add transition to body background (0.4s) and remove the transitioning class
    document.body.style.transition = 'background-color 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    document.body.classList.remove(`transitioning-${target}`);
  }, 50);

  // Wait for animation to finish (650ms = 50ms delay + 600ms transition) then do atomic handoff to static header
  setTimeout(() => {
    headerContainer.classList.add('active'); // Add active class to show the / separator and title layout
    headerTitle.style.transition = 'none';
    headerTitle.style.opacity = '1';
    headerTitle.classList.add('show');
    
    textOverlay.style.transition = 'none';
    textOverlay.style.opacity = '0';

    requestAnimationFrame(() => {
      headerTitle.style.transition = '';
      headerTitle.style.opacity = '';
      textOverlay.remove();
      if (overlay) overlay.remove();
      // Reset inline body transition style so subsequent transitions work normally
      document.body.style.transition = '';
    });
  }, 650);
}

