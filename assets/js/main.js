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

  // Physics & animation states
  let phi = -Math.PI / 2 + 0.02; // Orbit angle (starts near 12 o'clock and swings dynamically under gravity)
  let omega_phi = 0; // Angular velocity of the pivot
  let frameCount = 0;

  // Physics Settings
  const g = 0.7; // Gravity scaled for Runge-Kutta 4th order time step integration
  const damp = 1.0; // Lossless damping (kept for compatibility)

  // Pendulum nodes physical masses (0: Pivot, 1: Node 1, 2: Node 2)
  // Mass ratio set strictly to 4:2:3.
  const mass = [4.0, 2.0, 3.0];

  // Runge-Kutta State Variables (angles: theta1, theta2 / omegas: omega1, omega2)
  let angles = [0, 0];
  let omegas = [0, 0];

  // Pendulum nodes Cartesian states for rendering compatibility
  const pos = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ];

  let isInitialized = false;

  function initNodeAngles() {
    // Start with small deflected angles to reduce the initial potential energy.
    angles = [0.1, 0.1];
    omegas = [0.0, 0.0];

    isInitialized = true;
  }

  // Gaussian elimination solver with partial pivoting for 3x3 matrix
  function solve3x3(M, F) {
    const n = 3;
    const A = [];
    for (let i = 0; i < n; i++) {
      A.push([M[i][0], M[i][1], M[i][2], F[i]]);
    }

    for (let i = 0; i < n; i++) {
      let maxEl = Math.abs(A[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }

      const temp = A[maxRow];
      A[maxRow] = A[i];
      A[i] = temp;

      if (Math.abs(A[i][i]) < 1e-10) {
        return [0, 0, 0];
      }

      for (let k = i + 1; k < n; k++) {
        const c = -A[k][i] / A[i][i];
        for (let j = i; j <= n; j++) {
          if (i === j) {
            A[k][j] = 0;
          } else {
            A[k][j] += c * A[i][j];
          }
        }
      }
    }

    const x = [0, 0, 0];
    for (let i = n - 1; i >= 0; i--) {
      x[i] = A[i][n] / A[i][i];
      for (let k = i - 1; k >= 0; k--) {
        A[k][n] -= A[k][i] * x[i];
      }
    }
    return x;
  }

  // Lagrangian Equations of Motion for the Coupled 3-DOF System (Double Pendulum with revolving pivot)
  // q = [phi, theta1, theta2]
  // omega = [omega_phi, omega1, omega2]
  function derivatives(q, omega, L1, L2, R) {
    const phi = q[0];
    const t1 = q[1];
    const t2 = q[2];

    const w0 = omega[0];
    const w1 = omega[1];
    const w2 = omega[2];

    // Mass parameters
    const M_tot = mass[0] + mass[1] + mass[2];
    const mu1 = mass[1] + mass[2];
    const mu2 = mass[2];

    // Construct 3x3 Mass Matrix M
    const M = [
      [
        M_tot * R * R,
        -mu1 * R * L1 * Math.sin(phi + t1),
        -mu2 * R * L2 * Math.sin(phi + t2)
      ],
      [
        -mu1 * R * L1 * Math.sin(phi + t1),
        mu1 * L1 * L1,
        mu2 * L1 * L2 * Math.cos(t1 - t2)
      ],
      [
        -mu2 * R * L2 * Math.sin(phi + t2),
        mu2 * L1 * L2 * Math.cos(t1 - t2),
        mu2 * L2 * L2
      ]
    ];

    // Construct Force Vector F
    const F = [
      // F0 (phi force)
      R * (
        mu1 * L1 * w1 * w1 * Math.cos(phi + t1) +
        mu2 * L2 * w2 * w2 * Math.cos(phi + t2)
      ) + M_tot * g * R * Math.cos(phi),

      // F1 (theta1 force)
      mu1 * R * L1 * w0 * w0 * Math.cos(phi + t1)
      - mu2 * L1 * L2 * w2 * w2 * Math.sin(t1 - t2)
      - mu1 * g * L1 * Math.sin(t1),

      // F2 (theta2 force)
      mu2 * R * L2 * w0 * w0 * Math.cos(phi + t2)
      + mu2 * L1 * L2 * w1 * w1 * Math.sin(t1 - t2)
      - mu2 * g * L2 * Math.sin(t2)
    ];

    return solve3x3(M, F);
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

    // 1. Determine device dimensions
    const R = isMobile ? 130 : 240; // Increased Orbit ring radius (Desktop 240, Mobile 130)

    // 1.5. Draw matching static orbit ring inside canvas (ensures perfect alignment with pendulum pivot)
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Pendulum rod lengths (Ratio L1:L2 is set strictly to 2:3)
    const L1 = isMobile ? 60 : 150;
    const L2 = L1 * 1.5;

    // Initialize node angles if not done
    if (!isInitialized) {
      initNodeAngles();
    }

    // 3. Runge-Kutta 4th Order (RK4) Integration Sub-stepping
    // Unifies the pivot (Node 0) and the double pendulum (Nodes 1, 2) in a 3-DOF state vector,
    // ensuring perfect physical coupling and energy conservation.
    const subSteps = 6;
    const dt = 0.05;

    let state_q = [phi, angles[0], angles[1]];
    let state_w = [omega_phi, omegas[0], omegas[1]];

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

      // Update state vectors (No damping to preserve mechanical energy perfectly)
      for (let i = 0; i < 3; i++) {
        state_q[i] += (dt / 6) * (k1_q[i] + 2 * k2_q[i] + 2 * k3_q[i] + k4_q[i]);
        state_w[i] += (dt / 6) * (k1_w[i] + 2 * k2_w[i] + 2 * k3_w[i] + k4_w[i]);
      }
    }

    // Unpack states back
    phi = state_q[0];
    omega_phi = state_w[0];
    angles[0] = state_q[1];
    angles[1] = state_q[2];
    omegas[0] = state_w[1];
    omegas[1] = state_w[2];

    // Normalize values to stay within [-2*PI, 2*PI] to prevent precision loss
    if (Math.abs(phi) > 2 * Math.PI) {
      phi = phi % (2 * Math.PI);
    }
    for (let i = 0; i < 2; i++) {
      if (Math.abs(angles[i]) > 2 * Math.PI) {
        angles[i] = angles[i] % (2 * Math.PI);
      }
    }

    const x0 = cx + R * Math.cos(phi);
    const y0 = cy + R * Math.sin(phi);

    // 4. Resolve Cartesian Coordinates from Angles for rendering
    const x1 = x0 + L1 * Math.sin(angles[0]);
    const y1 = y0 + L1 * Math.cos(angles[0]);

    const x2 = x1 + L2 * Math.sin(angles[1]);
    const y2 = y1 + L2 * Math.cos(angles[1]);

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
    drawNode(x1, y1, 5.5, '#adcbf7');  // Node 1 (Mass 2.0)
    drawNode(x2, y2, 8.25, '#b4d6a8'); // Node 2 (Mass 3.0)

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
      document.body.classList.remove('theme-diary', 'theme-study');
      if (headerContainer && headerTitle) {
        headerContainer.classList.remove('active');
        headerTitle.classList.remove('show');
        headerTitle.textContent = '';
      }
      showView('home');
    } else if (cleanHash === 'profile') {
      window.location.hash = '#';
    } else if (cleanHash === 'study') {
      document.body.classList.add('theme-study');
      document.body.classList.remove('theme-diary');
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
      document.body.classList.remove('theme-study');
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
      document.body.classList.remove('theme-study');
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
      document.body.classList.remove('theme-diary');
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

  // Add class to animate slide to center (takes 600ms)
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

  // Create the centered transition text overlay
  const textOverlay = document.createElement('div');
  textOverlay.className = 'transition-text-overlay';
  textOverlay.textContent = target.charAt(0).toUpperCase() + target.slice(1);
  textOverlay.style.left = `${cx}px`;
  textOverlay.style.top = `${cy}px`;
  textOverlay.style.color = target === 'diary' ? '#6c9e5f' : '#5582c9';

  // Wait 600ms (slide animation of satellite completes) before expanding ripple and text
  setTimeout(() => {
    // Hide the button's internal text element right before appending the overlay
    const btnSpan = satelliteEl.querySelector('.orbit-btn span');
    if (btnSpan) {
      btnSpan.style.opacity = '0';
    }

    document.body.appendChild(ripple);
    document.body.appendChild(textOverlay);

    // Force browser reflow to ensure transitions start from initial state
    ripple.offsetHeight;
    textOverlay.offsetHeight;

    // Trigger animations
    requestAnimationFrame(() => {
      ripple.classList.add('active');
      textOverlay.classList.add('active');
      textOverlay.style.color = '#ffffff';
    });

    // Wait 1000ms (matching the smooth 1.0s transition) for ripple to cover screen, then perform route swap
    setTimeout(() => {
      window.location.hash = targetHash;

      // Prepare header subpage title hidden
      const headerContainer = document.getElementById('header-subpage-container');
      const headerTitle = document.getElementById('header-subpage-title');
      if (headerTitle && headerContainer) {
        headerTitle.textContent = target.charAt(0).toUpperCase() + target.slice(1);
        headerTitle.classList.remove('show');
        headerContainer.classList.add('active');
      }

      // Wait 100ms for route swap layout to stabilize, then trigger the slide-to-header and green-to-white fadeout
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
          const isMobile = window.innerWidth <= 600;
          const baseFontSize = isMobile ? 16 : 20; // 1.0rem = 16px, 1.25rem = 20px
          scaleFactor = targetFontSize / baseFontSize;
        }

        // Slide/shrink transition text overlay to header logo's right and change its color to green/blue
        textOverlay.style.transform = `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(${scaleFactor})`;
        textOverlay.style.color = 'var(--accent-primary)';

        // Fade out the background green/blue ripple to reveal the white diary page
        ripple.style.opacity = '0';

        // Wait 800ms (slide 500ms and fade-out 800ms complete) to perform the seamless handoff
        setTimeout(() => {
          if (headerTitle) {
            headerTitle.classList.add('show');
          }
          // Restore button text opacity for future visits
          if (btnSpan) {
            btnSpan.style.opacity = '';
          }
          // Clean up DOM and reset state
          ripple.remove();
          textOverlay.remove();
          satelliteEl.classList.remove('moving-to-center');
          isTransitioning = false;
        }, 800);
      }, 100);
    }, 1000);
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

  // Start the expand animation
  requestAnimationFrame(() => {
    ripple.classList.add('active');
  });

  // Swap hash address after the screen is completely covered (approx 450ms)
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
      triggerTransition('#', e);
    });
  }
}



/* ----------------------------------
   DIARY PAGE SYSTEM LOGIC
------------------------------------- */
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
  const readerContent = document.getElementById('reader-post-content');
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
