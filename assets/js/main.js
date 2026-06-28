// Global variables for Diary & Study SPA
let allPosts = [];
let diaryPosts = [];
let studyPosts = [];
let readPosts = new Set();

// Diary specific filters
let selectedCategory = 'All';
let isDescOrder = true; // Default: Recent first (Desc)
let searchQuery = '';
let currentPage = 1; // Pagination state

// Study specific filters
let studySelectedCategory = 'All';
let studyIsDescOrder = true;
let studySearchQuery = '';
let studyCurrentPage = 1;

let currentActiveHash = window.location.hash || '#';

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
    const response = await fetch('./posts.json');
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
  initDiaryControls();
  initStudyControls();
  initNavigationInterceptors();

  // 4. Handle initial routing based on URL Hash
  handleRouting();
  window.addEventListener('hashchange', handleRouting);
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



  function resizeCanvas() {
    isMobile = window.innerWidth <= 600;
    designSize = isMobile ? 850 : 1300;
    cx = designSize / 2;
    cy = designSize / 2;

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
  const g = 0.5; // Gravity scaled for Runge-Kutta 4th order time step integration
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
    const L1 = isMobile ? 60 : 100;
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

  // Cartesian Spring-Coupled equations of motion
  // q = [phi, x1, y1, x2, y2]
  // w = [omega_phi, vx1, vy1, vx2, vy2]
  function derivatives(q, w, L1_rest, L2_rest, R) {
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
    const alpha_phi = tau / (m0 * R * R);

    // Node 1 acceleration
    const ax1 = (Fs1_x - Fs2_x) / m1;
    const ay1 = g + (Fs1_y - Fs2_y) / m1;

    // Node 2 acceleration
    const ax2 = Fs2_x / m2;
    const ay2 = g + Fs2_y / m2;

    return [alpha_phi, ax1, ay1, ax2, ay2];
  }

  // Trails to store previous positions of the two nodes
  const trail1 = [];
  const trail2 = [];
  // Constant permanent trails (cleared on page navigation/hashchange)
  // We set a high maximum length of 20000 points as a safety limit to prevent memory leaks
  const maxTrailLength = 20000;
  const skipFrames = 3;

  // Clear trails when navigating to other pages (SPA view change)
  window.addEventListener('hashchange', () => {
    trail1.length = 0;
    trail2.length = 0;
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
    const L1 = isMobile ? 60 : 100;
    const L2 = L1 * 1;

    // Initialize node angles if not done
    if (!isInitialized) {
      initNodeAngles();
    }

    // 3. Runge-Kutta 4th Order (RK4) Integration Sub-stepping
    // Unifies the pivot (Node 0) and the double pendulum (Nodes 1, 2) in a 3-DOF state vector,
    // ensuring perfect physical coupling and energy conservation.
    const subSteps = 30;
    const dt = 0.01;

    let state_q = [phi, x1, y1, x2, y2];
    let state_w = [omega_phi, vx1, vy1, vx2, vy2];

    for (let step = 0; step < subSteps; step++) {
      // k1
      const alpha1 = derivatives(state_q, state_w, L1, L2, R);
      const k1_q = [...state_w];
      const k1_w = [...alpha1];

      // k2
      const temp_q2 = state_q.map((qVal, i) => qVal + 0.5 * dt * k1_q[i]);
      const temp_w2 = state_w.map((wVal, i) => wVal + 0.5 * dt * k1_w[i]);
      const alpha2 = derivatives(temp_q2, temp_w2, L1, L2, R);
      const k2_q = [...temp_w2];
      const k2_w = [...alpha2];

      // k3
      const temp_q3 = state_q.map((qVal, i) => qVal + 0.5 * dt * k2_q[i]);
      const temp_w3 = state_w.map((wVal, i) => wVal + 0.5 * dt * k2_w[i]);
      const alpha3 = derivatives(temp_q3, temp_w3, L1, L2, R);
      const k3_q = [...temp_w3];
      const k3_w = [...alpha3];

      // k4
      const temp_q4 = state_q.map((qVal, i) => qVal + dt * k3_q[i]);
      const temp_w4 = state_w.map((wVal, i) => wVal + dt * k3_w[i]);
      const alpha4 = derivatives(temp_q4, temp_w4, L1, L2, R);
      const k4_q = [...temp_w4];
      const k4_w = [...alpha4];

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

    drawTrail(trail1, '173, 203, 247', 2.25); // Node 1: #adcbf7 (Width 2.25, Mass 2.0, Blue)
    drawTrail(trail2, '180, 214, 168', 2.25); // Node 2: #b4d6a8 (Width 2.25, Mass 3.0, Melon Green)

    // 5. Draw rods
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 1.5;
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

    // Node sizes scaled proportionally (Pivot mass 4.0, Node 1 mass 2.0, Node 2 mass 3.0)
    drawNode(x0, y0, 11.0, '#888888'); // Pivot (Mass 4.0, Grey)
    drawNode(x1, y1, 10, '#adcbf7');  // Node 1 (Mass 2.0)
    drawNode(x2, y2, 7, '#b4d6a8'); // Node 2 (Mass 3.0)

    // 6.2 Render the red bead acting as the Sweep Second Hand of the central clock (symmetrically starts at 12 o'clock / -Math.PI / 2)
    const seconds = now.getSeconds();
    const ms = now.getMilliseconds();

    // 60 seconds = 2 * Math.PI rad -> 1 second = PI / 30 rad -> 1 millisecond = PI / 30000 rad
    const angle_red = -Math.PI / 2 +
      (seconds * Math.PI / 30) +
      (ms * Math.PI / 30000);

    const red_x = cx + R * Math.cos(angle_red);
    const red_y = cy + R * Math.sin(angle_red);
    drawNode(red_x, red_y, 7.5, '#e26d5c'); // Red Node (Clock Sweep Second Hand Indicator)



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

// Router to resolve view states based on URL hashes
function handleRouting() {
  const hash = window.location.hash;
  const oldHash = currentActiveHash;
  currentActiveHash = hash;

  const performRouting = () => {
    const cleanHash = hash.substring(1);
    const headerContainer = document.getElementById('header-subpage-container');
    const headerTitle = document.getElementById('header-subpage-title');

    if (!cleanHash) {
      document.body.classList.remove('theme-diary', 'theme-study', 'theme-finance');
      if (headerContainer && headerTitle) {
        headerContainer.classList.remove('active');
        headerTitle.classList.remove('show');
        headerTitle.textContent = '';
      }
      showView('home');

      // Home Entrance Animation Sequence (Only trigger when returning from another subpage)
      const homeView = document.getElementById('home-view');
      const entranceOverlay = document.getElementById('home-entrance-overlay');
      const isReturningFromSubpage = oldHash && oldHash !== '#' && oldHash !== '';

      if (homeView && entranceOverlay) {
        // Clear any previous exiting/animation classes to restore elements cleanly
        homeView.classList.remove('entrance-step-1', 'entrance-step-2', 'home-exiting');

        if (isReturningFromSubpage) {
          entranceOverlay.style.display = 'block';
          entranceOverlay.style.opacity = '1';
          homeView.classList.add('home-entrance-active');

          // Force reflow
          homeView.offsetHeight;

          // Step 0: Fade out the white overlay
          requestAnimationFrame(() => {
            entranceOverlay.style.opacity = '0';
          });

          // Step 1: Fade-in and scale-in the center orbit line & canvas (50ms)
          setTimeout(() => {
            homeView.classList.add('entrance-step-1');
          }, 50);

          // Step 2: Slide out the satellites from center (200ms)
          setTimeout(() => {
            homeView.classList.add('entrance-step-2');
          }, 200);

          // Step 3: Clean up animation class properties after transition completes (700ms)
          setTimeout(() => {
            homeView.classList.remove('home-entrance-active', 'entrance-step-1', 'entrance-step-2');
            entranceOverlay.style.display = 'none';
          }, 700);
        } else {
          // Initial load: Hide transition elements immediately and display page in its default layout state
          entranceOverlay.style.display = 'none';
          entranceOverlay.style.opacity = '0';
        }
      }
    } else if (cleanHash === 'profile') {
      window.location.hash = '#';
    } else if (cleanHash === 'study') {
      document.body.classList.add('theme-study');
      document.body.classList.remove('theme-diary', 'theme-finance');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = 'Study';
        if (!isTransitioning) {
          headerContainer.classList.add('active');
          headerTitle.classList.add('show');
        }
      }
      showView('study');
      document.getElementById('study-list-container').style.display = 'block';
      const readerContainer = document.getElementById('study-reader-container');
      if (readerContainer) readerContainer.style.display = 'none';
      renderStudy();
      window.scrollTo(0, 0);
    } else if (cleanHash === 'diary') {
      document.body.classList.add('theme-diary');
      document.body.classList.remove('theme-study', 'theme-finance');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = 'Diary';
        if (!isTransitioning) {
          headerContainer.classList.add('active');
          headerTitle.classList.add('show');
        }
      }
      showView('diary');
      document.getElementById('diary-list-container').style.display = 'block';
      const readerContainer = document.getElementById('diary-reader-container');
      if (readerContainer) readerContainer.style.display = 'none';
      renderDiary();
      window.scrollTo(0, 0);
    } else if (cleanHash.startsWith('diary/')) {
      document.body.classList.add('theme-diary');
      document.body.classList.remove('theme-study', 'theme-finance');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = 'Diary';
        if (!isTransitioning) {
          headerContainer.classList.add('active');
          headerTitle.classList.add('show');
        }
      }
      showView('diary');
      document.getElementById('diary-list-container').style.display = 'none';
      const readerContainer = document.getElementById('diary-reader-container');
      if (readerContainer) readerContainer.style.display = 'block';

      const filename = decodeURIComponent(cleanHash.substring(6));
      const post = diaryPosts.find(p => p.filename === filename);

      if (post) {
        renderReader(post, 'diary');
      } else {
        window.location.hash = 'diary';
      }
    } else if (cleanHash.startsWith('study/')) {
      document.body.classList.add('theme-study');
      document.body.classList.remove('theme-diary', 'theme-finance');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = 'Study';
        if (!isTransitioning) {
          headerContainer.classList.add('active');
          headerTitle.classList.add('show');
        }
      }
      showView('study');
      document.getElementById('study-list-container').style.display = 'none';
      const readerContainer = document.getElementById('study-reader-container');
      if (readerContainer) readerContainer.style.display = 'block';

      const filename = decodeURIComponent(cleanHash.substring(6));
      const post = studyPosts.find(p => p.filename === filename);

      if (post) {
        renderReader(post, 'study');
      } else {
        window.location.hash = 'study';
      }
    } else if (cleanHash === 'finance') {
      document.body.classList.add('theme-finance');
      document.body.classList.remove('theme-study', 'theme-diary');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = 'Finance';
        if (!isTransitioning) {
          headerContainer.classList.add('active');
          headerTitle.classList.add('show');
        }
      }
      showView('finance');
      if (window.initFinanceDashboard) {
        window.initFinanceDashboard();
      }
      window.scrollTo(0, 0);
    }
  };

  performRouting();
}

/* ----------------------------------
   EXPANDING RIPPLE PAGE TRANSITION
------------------------------------- */
let isTransitioning = false;

function triggerCenterTransition(target, targetHash, satelliteEl, clickEvent) {
  if (isTransitioning) return;
  isTransitioning = true;

  // Add global transition and theme-specific transitioning classes to body
  document.body.classList.add('global-transitioning', `transitioning-${target}`);

  // Add exiting class to home view to fade out and shrink other layout elements
  const homeView = document.getElementById('home-view');
  if (homeView) {
    homeView.classList.add('home-exiting');
  }

  // Add class to animate slide to center (takes 600ms). The text remains static inside the button.
  satelliteEl.classList.add('moving-to-center');

  // Compute the center coordinates of the orbit container and dimensions of the button
  const rect = satelliteEl.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  const container = document.querySelector('.orbit-container');
  let cx = window.innerWidth / 2;
  let cy = window.innerHeight / 2;
  if (container) {
    const cRect = container.getBoundingClientRect();
    cx = cRect.left + cRect.width / 2;
    cy = cRect.top + cRect.height / 2;
  }

  // Create the expanding ripple with theme class, sized to the button container
  const ripple = document.createElement('div');
  ripple.className = `expanding-circle theme-${target}`;
  ripple.style.width = `${w}px`;
  ripple.style.height = `${h}px`;
  ripple.style.left = `${cx}px`;
  ripple.style.top = `${cy}px`;

  // Declare textOverlay in parent scope to be accessed in the route swap timeout
  let textOverlay;

  // Wait 600ms (slide animation of satellite completes and reaches the center) before swapping and expanding
  setTimeout(() => {
    // 1. Hide the button's internal text element at the exact moment of arrival
    const btnSpan = satelliteEl.querySelector('.orbit-btn span');
    if (btnSpan) {
      btnSpan.style.opacity = '0';
    }

    // 2. Create the centered transition text overlay exactly at the center (already at scale 1.25)
    textOverlay = document.createElement('div');
    textOverlay.className = 'transition-text-overlay';
    textOverlay.textContent = target.charAt(0).toUpperCase() + target.slice(1);
    textOverlay.style.left = `${cx}px`;
    textOverlay.style.top = `${cy}px`;
    // Initialize color as white to match the transitioned button text
    textOverlay.style.color = '#ffffff';
    textOverlay.style.transform = 'translate(-50%, -50%) scale(1.25)';

    document.body.appendChild(ripple);
    document.body.appendChild(textOverlay);

    // Force browser reflow to ensure transitions start from initial state
    ripple.offsetHeight;
    textOverlay.offsetHeight;

    // Trigger animations
    requestAnimationFrame(() => {
      ripple.classList.add('active');
      textOverlay.classList.add('active');
    });

    // Perform route swap immediately without 1000ms delay
    window.location.hash = targetHash;

    // Prepare header subpage title hidden
    const headerContainer = document.getElementById('header-subpage-container');
    const headerTitle = document.getElementById('header-subpage-title');
    if (headerTitle && headerContainer) {
      headerTitle.textContent = target.charAt(0).toUpperCase() + target.slice(1);
      headerTitle.classList.remove('show');
      headerContainer.classList.add('active');
    }

    // Wait just 50ms (instead of 100ms) for the layout to update, then immediately trigger slide
    setTimeout(() => {
      // Calculate translation coordinates from current center position (cx, cy) to the actual header subpage title position
      let deltaX = 0;
      let deltaY = 0;
      let scaleFactor = 0.64; // Fallback
      if (headerTitle) {
        const targetRect = headerTitle.getBoundingClientRect();
        deltaX = (targetRect.left + targetRect.width / 2) - cx;
        deltaY = (targetRect.top + targetRect.height / 2) - cy;

        // Dynamically compute the exact scale factor to match the header font size
        const targetFontSize = parseFloat(window.getComputedStyle(headerTitle).fontSize);
        const baseFontSize = parseFloat(window.getComputedStyle(textOverlay).fontSize);
        scaleFactor = targetFontSize / baseFontSize;
      }

      // Apply transform transition and smooth color transition (white to theme color during slide)
      textOverlay.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), color 0.4s ease-out';
      textOverlay.style.color = 'var(--accent-primary)';

      // Slide/shrink transition text overlay to header logo's right
      textOverlay.style.transform = `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(${scaleFactor})`;

      // Fade out the background ripple to reveal the page
      ripple.style.opacity = '0';

      // Immediately fade out the body background color back to white along with the ripple
      // Also remove global-transitioning to let Subin's blog logo fade back in while the text is sliding
      document.body.classList.remove('global-transitioning', 'transitioning-diary', 'transitioning-study', 'transitioning-finance');

      // Wait for slide to complete (800ms from start) then do an atomic seamless handoff
      setTimeout(() => {
          if (headerTitle) {
            headerTitle.style.transition = 'none';
            headerTitle.style.opacity = '1';
            headerTitle.classList.add('show');
          }
          textOverlay.style.transition = 'none';
          textOverlay.style.opacity = '0';

          // Clean up DOM and reset transition properties in the next frame
          requestAnimationFrame(() => {
            if (headerTitle) {
              headerTitle.style.transition = '';
              headerTitle.style.opacity = '';
            }
            if (btnSpan) {
              btnSpan.style.opacity = '';
            }
            ripple.remove();
            textOverlay.remove();
            satelliteEl.classList.remove('moving-to-center');
            isTransitioning = false;
          });
        }, 800);
      }, 50);
    }, 600);
}

function triggerTransition(targetHash, clickEvent) {
  if (isTransitioning) return;
  isTransitioning = true;

  // Create circular transition element at coordinates of mouse click
  const ripple = document.createElement('div');
  ripple.className = 'expanding-circle';
  document.body.appendChild(ripple);

  const x = clickEvent.clientX || window.innerWidth / 2;
  const y = clickEvent.clientY || window.innerHeight / 2;

  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  // Find the currently active view section and fade it out smoothly in place (disable CSS animation to allow inline styles to work)
  const currentActiveView = document.querySelector('.view-section:not([style*="display: none"])');
  if (currentActiveView) {
    currentActiveView.style.animation = 'none';
    currentActiveView.offsetHeight; // Force layout recalculation
    currentActiveView.style.transition = 'opacity 0.55s ease-out';
    currentActiveView.style.opacity = '0';
  }

  // Start the expand animation
  requestAnimationFrame(() => {
    ripple.classList.add('active');
  });

  // Swap hash address after the screen is completely covered and fade-out completes (600ms)
  setTimeout(() => {
    window.location.hash = targetHash;

    // Smoothly fade-out and destroy ripple element
    setTimeout(() => {
      ripple.style.opacity = '0';
      setTimeout(() => {
        ripple.remove();
        isTransitioning = false;
      }, 400);
    }, 100);
  }, 450);
}

// Intercept standard data-target button clicks to trigger expanding animations
function initNavigationInterceptors() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-target]');
    if (btn) {
      e.preventDefault();
      const target = btn.getAttribute('data-target');
      const hash = target === 'home' ? '#' : `#${target}`;

      const satellite = btn.closest('.orbit-satellite');
      if (satellite) {
        triggerCenterTransition(target, hash, satellite, e);
      } else {
        triggerTransition(hash, e);
      }
    }
  });

  // Handle clicking on main logo "Subin's blog" to go home
  const mainLogo = document.querySelector('.main-logo');
  if (mainLogo) {
    mainLogo.addEventListener('click', (e) => {
      e.preventDefault();
      const currentHash = window.location.hash;
      if (!currentHash || currentHash === '#') {
        // Reload page if already on the home view
        window.location.reload();
      } else {
        // Trigger transition back to home if on another page
        triggerTransition('#', e);
      }
    });
  }

  // Handle clicking on header subpage title area to go back to list
  const headerSubpageContainer = document.getElementById('header-subpage-container');
  if (headerSubpageContainer) {
    headerSubpageContainer.addEventListener('click', (e) => {
      e.preventDefault();
      const titleEl = document.getElementById('header-subpage-title');
      if (titleEl) {
        const text = titleEl.textContent.trim().toLowerCase();
        if (text === 'diary') {
          triggerTransition('#diary', e);
        } else if (text === 'study') {
          triggerTransition('#study', e);
        }
      }
    });
  }
}



/* ----------------------------------
   DIARY PAGE SYSTEM LOGIC
------------------------------------- */
function initDiaryControls() {
  const searchInput = document.getElementById('diary-search');
  const sortBtn = document.getElementById('diary-sort-btn');
  const searchToggleBtn = document.getElementById('diary-search-toggle-btn');
  const categorySidebar = document.querySelector('.category-sidebar');

  // Search/Category toggle listener for mobile
  if (searchToggleBtn && categorySidebar) {
    searchToggleBtn.addEventListener('click', () => {
      categorySidebar.classList.toggle('show');
    });
  }

  // Search filter listener
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      currentPage = 1; // Reset to page 1 on new search query
      renderDiary();
    });
  }

  // Sort toggle listener
  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      isDescOrder = !isDescOrder;
      currentPage = 1; // Reset to page 1 on sort change
      renderDiary();
    });
  }

  // Disable drag, copy, selectstart, and right-click menu within the diary view to prevent copying content
  const diaryView = document.getElementById('diary-view');
  if (diaryView) {
    diaryView.addEventListener('copy', (e) => e.preventDefault());
    diaryView.addEventListener('selectstart', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
    });
    diaryView.addEventListener('dragstart', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
    });
    diaryView.addEventListener('contextmenu', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
    });
  }

  // Image preview click interceptor on reader content
  const readerContent = document.getElementById('diary-reader-post-content');
  if (readerContent) {
    readerContent.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (img) {
        openImagePreview(img.src, img.alt);
      }
    });
  }
}

// Render list items and category filter items
function renderDiary() {
  const postList = document.getElementById('post-list-element');
  const categoryMenu = document.getElementById('category-menu-element');
  const sortBtn = document.getElementById('diary-sort-btn');
  if (!postList) return;

  // Toggle sort button text: If currently Desc (Recent), show "오래된순" to indicate next toggle state, and vice versa.
  if (sortBtn) {
    sortBtn.innerHTML = isDescOrder
      ? `<i class="fas fa-sort-amount-up"></i> 오래된순`
      : `<i class="fas fa-sort-amount-down"></i> 최신순`;
  }

  // 1. Gather all categories and counts
  const categoryCounts = { 'All': diaryPosts.length };
  diaryPosts.forEach(post => {
    const cats = post.categories || [];
    cats.forEach(cat => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
  });

  // Render categories sidebar
  if (categoryMenu) {
    categoryMenu.innerHTML = Object.entries(categoryCounts)
      .map(([catName, count]) => {
        const isActive = catName === selectedCategory ? 'active' : '';
        return `
          <li class="category-item ${isActive}" onclick="filterCategory('${catName}')">
            <span>${catName}</span>
            <span class="category-count">${count}</span>
          </li>
        `;
      })
      .join('');
  }

  // 2. Filter posts by category and search query
  let filteredPosts = diaryPosts.filter(post => {
    const matchCategory = selectedCategory === 'All' || (post.categories && post.categories.includes(selectedCategory));
    const matchSearch = !searchQuery ||
      post.title.toLowerCase().includes(searchQuery) ||
      post.content.toLowerCase().includes(searchQuery);

    return matchCategory && matchSearch;
  });

  // 3. Sort posts
  filteredPosts.sort((a, b) => {
    const dateA = new Date(a.date.split(' ')[0]);
    const dateB = new Date(b.date.split(' ')[0]);
    return isDescOrder ? dateB - dateA : dateA - dateB;
  });

  const totalCount = filteredPosts.length;
  const postsPerPage = 10;
  const totalPages = Math.ceil(totalCount / postsPerPage);

  // Guard page range
  if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

  // 4. Slice for Pagination
  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const paginatedPosts = filteredPosts.slice(startIndex, endIndex);

  // 6. Render paginated list items in compact format (Date, Category, Title - NO summary)
  if (paginatedPosts.length === 0) {
    postList.innerHTML = `<p class="empty-msg">조건에 부합하는 일기가 없습니다.</p>`;
    renderPagination(0);
    return;
  }

  postList.innerHTML = paginatedPosts.map(post => {
    const isRead = readPosts.has(post.filename);

    // Check if post date is within 7 days from now
    let postDate;
    const parts = post.date.trim().split(/\s+/);
    if (parts.length >= 2) {
      const datePart = parts[0];
      const timePart = parts[1];
      let tzPart = parts[2] || '';
      if (tzPart && !tzPart.includes(':') && (tzPart.startsWith('+') || tzPart.startsWith('-'))) {
        tzPart = tzPart.slice(0, 3) + ':' + tzPart.slice(3);
      }
      postDate = new Date(`${datePart}T${timePart}${tzPart}`);
    } else {
      postDate = new Date(post.date);
    }

    const diffMs = new Date() - postDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const isNew = diffDays >= 0 && diffDays <= 7 && !isRead;

    const formattedDate = formatPostDate(post.date);
    const categoryLabel = post.categories && post.categories.length > 0
      ? `<span class="post-category-tag">${post.categories[0]}</span>`
      : '';

    return `
      <a href="#diary/${encodeURIComponent(post.filename)}" class="post-item compact-post-item glass-card ${isRead ? 'read' : ''}" data-filename="${post.filename}">
        <div class="post-item-header">
          <h2 class="post-title">${escapeHtml(post.title)}</h2>
          ${isNew ? '<span class="new-badge">NEW</span>' : ''}
        </div>
        <div class="post-item-meta-row">
          <span class="post-date"><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
          <div class="post-item-category-wrapper">
            ${categoryLabel}
          </div>
        </div>
      </a>
    `;
  }).join('');

  // 7. Render Pagination UI
  renderPagination(totalCount);
}

// Render dynamic pagination buttons
function renderPagination(totalCount) {
  const pagEl = document.getElementById('diary-pagination');
  if (!pagEl) return;

  const postsPerPage = 10;
  const totalPages = Math.ceil(totalCount / postsPerPage);

  if (totalPages <= 1) {
    pagEl.innerHTML = '';
    return;
  }

  let html = '';

  // Previous button
  html += `
    <button class="pag-btn prev-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
      <i class="fas fa-chevron-left"></i> 이전
    </button>
  `;

  // Page Numbers
  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === currentPage ? 'active' : '';
    html += `
      <button class="pag-btn num-btn ${activeClass}" onclick="changePage(${i})">${i}</button>
    `;
  }

  // Next button
  html += `
    <button class="pag-btn next-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
      다음 <i class="fas fa-chevron-right"></i>
    </button>
  `;

  pagEl.innerHTML = html;
}

// Page change trigger
window.changePage = function (page) {
  currentPage = page;
  renderDiary();

  // Scroll list container back to top smoothly
  const targetView = document.getElementById('diary-view');
  if (targetView) {
    targetView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// Category filter trigger
window.filterCategory = function (categoryName) {
  selectedCategory = categoryName;
  currentPage = 1; // Reset to page 1
  renderDiary();
};

/* ----------------------------------
   STUDY PAGE SYSTEM LOGIC
------------------------------------- */
function initStudyControls() {
  const searchInput = document.getElementById('study-search');
  const sortBtn = document.getElementById('study-sort-btn');
  const searchToggleBtn = document.getElementById('study-search-toggle-btn');
  const categorySidebar = document.querySelector('#study-view .category-sidebar');

  // Search/Category toggle listener for mobile
  if (searchToggleBtn && categorySidebar) {
    searchToggleBtn.addEventListener('click', () => {
      categorySidebar.classList.toggle('show');
    });
  }

  // Search filter listener
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      studySearchQuery = e.target.value.toLowerCase().trim();
      studyCurrentPage = 1; // Reset to page 1 on new search query
      renderStudy();
    });
  }

  // Sort toggle listener
  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      studyIsDescOrder = !studyIsDescOrder;
      studyCurrentPage = 1; // Reset to page 1 on sort change
      renderStudy();
    });
  }

  // Disable drag, copy, selectstart, and right-click menu within the study view to prevent copying content
  const studyView = document.getElementById('study-view');
  if (studyView) {
    studyView.addEventListener('copy', (e) => e.preventDefault());
    studyView.addEventListener('selectstart', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
    });
    studyView.addEventListener('dragstart', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
    });
    studyView.addEventListener('contextmenu', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
    });
  }

  // Image preview click interceptor on reader content
  const readerContent = document.getElementById('study-reader-post-content');
  if (readerContent) {
    readerContent.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (img) {
        openImagePreview(img.src, img.alt);
      }
    });
  }
}

// Render study list items and category filter items
function renderStudy() {
  const postList = document.getElementById('study-post-list-element');
  const categoryMenu = document.getElementById('study-category-menu-element');
  const sortBtn = document.getElementById('study-sort-btn');
  if (!postList) return;

  // Toggle sort button text
  if (sortBtn) {
    sortBtn.innerHTML = studyIsDescOrder
      ? `<i class="fas fa-sort-amount-up"></i> 오래된순`
      : `<i class="fas fa-sort-amount-down"></i> 최신순`;
  }

  // 1. Gather all categories and counts for study posts
  const categoryCounts = { 'All': studyPosts.length };
  studyPosts.forEach(post => {
    const cats = post.categories || [];
    cats.forEach(cat => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
  });

  // Render categories sidebar
  if (categoryMenu) {
    categoryMenu.innerHTML = Object.entries(categoryCounts)
      .map(([catName, count]) => {
        const isActive = catName === studySelectedCategory ? 'active' : '';
        return `
          <li class="category-item ${isActive}" onclick="filterStudyCategory('${catName}')">
            <span>${catName}</span>
            <span class="category-count">${count}</span>
          </li>
        `;
      })
      .join('');
  }

  // 2. Filter study posts by category and search query
  let filteredPosts = studyPosts.filter(post => {
    const matchCategory = studySelectedCategory === 'All' || (post.categories && post.categories.includes(studySelectedCategory));
    const matchSearch = !studySearchQuery ||
      post.title.toLowerCase().includes(studySearchQuery) ||
      (post.subtitle && post.subtitle.toLowerCase().includes(studySearchQuery)) ||
      post.content.toLowerCase().includes(studySearchQuery);

    return matchCategory && matchSearch;
  });

  // 3. Sort posts
  filteredPosts.sort((a, b) => {
    const dateA = new Date(a.date.split(' ')[0]);
    const dateB = new Date(b.date.split(' ')[0]);
    return studyIsDescOrder ? dateB - dateA : dateA - dateB;
  });

  const totalCount = filteredPosts.length;
  const postsPerPage = 10;
  const totalPages = Math.ceil(totalCount / postsPerPage);

  // Guard page range
  if (studyCurrentPage > totalPages) studyCurrentPage = Math.max(1, totalPages);

  // 4. Slice for Pagination
  const startIndex = (studyCurrentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const paginatedPosts = filteredPosts.slice(startIndex, endIndex);

  // 5. Render paginated list items in card format (Title, Subtitle, Date, Category)
  if (paginatedPosts.length === 0) {
    postList.innerHTML = `<p class="empty-msg">조건에 부합하는 학습 노트가 없습니다.</p>`;
    renderStudyPagination(0);
    return;
  }

  postList.innerHTML = paginatedPosts.map(post => {
    const isRead = readPosts.has(post.filename);

    // Check if post date is within 7 days from now
    let postDate;
    const parts = post.date.trim().split(/\s+/);
    if (parts.length >= 2) {
      const datePart = parts[0];
      const timePart = parts[1];
      let tzPart = parts[2] || '';
      if (tzPart && !tzPart.includes(':') && (tzPart.startsWith('+') || tzPart.startsWith('-'))) {
        tzPart = tzPart.slice(0, 3) + ':' + tzPart.slice(3);
      }
      postDate = new Date(`${datePart}T${timePart}${tzPart}`);
    } else {
      postDate = new Date(post.date);
    }

    const diffMs = new Date() - postDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const isNew = diffDays >= 0 && diffDays <= 7 && !isRead;

    const formattedDate = formatPostDate(post.date);
    const categoryLabel = post.categories && post.categories.length > 0
      ? `<span class="post-category-tag">${post.categories[0]}</span>`
      : '';

    return `
      <a href="#study/${encodeURIComponent(post.filename)}" class="post-item study-post-item glass-card ${isRead ? 'read' : ''}" data-filename="${post.filename}">
        <div class="post-item-header">
          <h2 class="post-title">${escapeHtml(post.title)}</h2>
          ${isNew ? '<span class="new-badge">NEW</span>' : ''}
        </div>
        ${post.subtitle ? `<div class="post-subtitle">${escapeHtml(post.subtitle)}</div>` : ''}
        <div class="post-item-meta-row">
          <span class="post-date"><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
          <div class="post-item-category-wrapper">
            ${categoryLabel}
          </div>
        </div>
      </a>
    `;
  }).join('');

  // 6. Render Pagination UI
  renderStudyPagination(totalCount);
}

// Render dynamic pagination buttons for Study
function renderStudyPagination(totalCount) {
  const pagEl = document.getElementById('study-pagination');
  if (!pagEl) return;

  const postsPerPage = 10;
  const totalPages = Math.ceil(totalCount / postsPerPage);

  if (totalPages <= 1) {
    pagEl.innerHTML = '';
    return;
  }

  let html = '';

  // Previous button
  html += `
    <button class="pag-btn prev-btn" ${studyCurrentPage === 1 ? 'disabled' : ''} onclick="studyChangePage(${studyCurrentPage - 1})">
      <i class="fas fa-chevron-left"></i> 이전
    </button>
  `;

  // Page Numbers
  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === studyCurrentPage ? 'active' : '';
    html += `
      <button class="pag-btn num-btn ${activeClass}" onclick="studyChangePage(${i})">${i}</button>
    `;
  }

  // Next button
  html += `
    <button class="pag-btn next-btn" ${studyCurrentPage === totalPages ? 'disabled' : ''} onclick="studyChangePage(${studyCurrentPage + 1})">
      다음 <i class="fas fa-chevron-right"></i>
    </button>
  `;

  pagEl.innerHTML = html;
}

// Study Page change trigger
window.studyChangePage = function (page) {
  studyCurrentPage = page;
  renderStudy();

  // Scroll list container back to top smoothly
  const targetView = document.getElementById('study-view');
  if (targetView) {
    targetView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// Study Category filter trigger
window.filterStudyCategory = function (categoryName) {
  studySelectedCategory = categoryName;
  studyCurrentPage = 1; // Reset to page 1
  renderStudy();
};

// Render Markdown Reader Mode
function renderReader(post, prefix = 'diary') {
  const listContainer = document.getElementById(`${prefix}-list-container`);
  const readerContainer = document.getElementById(`${prefix}-reader-container`);

  // Mark as read
  markPostAsRead(post.filename);

  // Set header details
  document.getElementById(`${prefix}-reader-post-title`).textContent = post.title;
  document.getElementById(`${prefix}-reader-post-date`).innerHTML = `<i class="far fa-calendar-alt"></i> ${post.date.split(' ')[0]}`;

  const categoryTag = post.categories && post.categories.length > 0
    ? `<span class="post-category-tag">${post.categories[0]}</span>`
    : '';
  document.getElementById(`${prefix}-reader-post-category`).innerHTML = categoryTag;

  // Determine the base path for images in this post's folder
  // post.folder is the subdirectory name within _posts/ (e.g. "2018-01-23-norway-1")
  const postImgBase = post.folder ? `./_posts/${post.folder}/` : './_posts/';

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
      (_, before, imgPath) => `<img${before}src="./_posts/${imgPath}"`
    );

    //   c) HTML <img> tag relative path correction: src="X.jpeg" -> src="postImgBase/X.jpeg"
    cleanContent = cleanContent.replace(
      /<img([^>]*?)src="(?!https?:\/\/)(?!\/)(?!\.\/)([^"]+)"/g,
      (_, before, imgPath) => `<img${before}src="${postImgBase}${imgPath}"`
    );

    //   d) Legacy absolute /assets/img/X paths in markdown → ./_posts/X
    cleanContent = cleanContent.replace(
      /!\[([^\]]*)\]\(\/assets\/img\/([^)]+)\)/g,
      (_, alt, imgPath) => `![${alt}](${'./_posts/' + imgPath})`
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

  // Trigger KaTeX math rendering if auto-render is loaded
  const contentEl = document.getElementById(`${prefix}-reader-post-content`);
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

    // Close overlay on click
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
  }

  const previewImg = overlay.querySelector('img');
  previewImg.src = src;
  previewImg.alt = alt || '';

  overlay.style.display = 'flex';
  overlay.offsetHeight; // Trigger reflow for transition
  overlay.classList.add('show');
}
