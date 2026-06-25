// Global variables for Diary SPA
let allPosts = [];
let readPosts = new Set();
let selectedCategory = 'All';
let isDescOrder = true; // Default: Recent first (Desc)
let searchQuery = '';
let currentPage = 1; // Pagination state

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
  } catch (err) {
    console.error(err);
    const listEl = document.getElementById('post-list-element');
    if (listEl) {
      listEl.innerHTML = `<p class="error-msg">일기 데이터를 불러오는 도중 오류가 발생했습니다.</p>`;
    }
  }

  // 3. Initialize common script components
  initMouseFollower();
  initMainPage();
  initDiaryControls();
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
  let phi = 0; // Orbit angle (starts at diary (0 radians) and swings to profile (PI radians))
  let omega_phi = 0; // Angular velocity of the pivot
  let frameCount = 0;

  // Physics Settings
  const g = 0.9; // Gravity scaled for Runge-Kutta 4th order time step integration
  const damp = 1.0; // Lossless damping (kept for compatibility)

  // Pendulum nodes physical masses (0: Pivot, 1: Node 1, 2: Node 2, 3: Node 3)
  // Mass ratio set strictly to 4:2:1 for dynamic nodes.
  const mass = [Infinity, 4.0, 2.0, 1.0];

  // Runge-Kutta State Variables (angles: theta1, theta2, theta3 / omegas: omega1, omega2, omega3)
  let angles = [0, 0, 0];
  let omegas = [0, 0, 0];

  // Pendulum nodes Cartesian states for rendering compatibility
  const pos = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ];

  let isInitialized = false;

  function initNodeAngles() {
    // Start with moderately deflected angles to store slightly more potential energy than original.
    // Node 1 is set to 0.5 rad, Node 2 to 2.2 rad, and Node 3 to -2.4 rad.
    // No initial velocities are set to avoid starting with an excessive initial kinetic kick.
    angles = [0.5, 2.2, -2.4];
    omegas = [0.0, 0.0, 0.0];

    isInitialized = true;
  }

  // Lagrangian Equations of Motion for Triple Pendulum (Calculates angular accelerations)
  function derivatives(ang, omg, L1, L2, L3) {
    const t1 = ang[0];
    const t2 = ang[1];
    const t3 = ang[2];
    const w1 = omg[0];
    const w2 = omg[1];
    const w3 = omg[2];

    // Mass Matrix elements (3x3 symmetric positive-definite matrix)
    const m11 = (mass[1] + mass[2] + mass[3]) * L1 * L1;
    const m12 = (mass[2] + mass[3]) * L1 * L2 * Math.cos(t1 - t2);
    const m13 = mass[3] * L1 * L3 * Math.cos(t1 - t3);

    const m21 = m12;
    const m22 = (mass[2] + mass[3]) * L2 * L2;
    const m23 = mass[3] * L2 * L3 * Math.cos(t2 - t3);

    const m31 = m13;
    const m32 = m23;
    const m33 = mass[3] * L3 * L3;

    // Right-Hand Side (RHS) Forces Vector
    const f1 = -(mass[2] + mass[3]) * L1 * L2 * w2 * w2 * Math.sin(t1 - t2)
      - mass[3] * L1 * L3 * w3 * w3 * Math.sin(t1 - t3)
      - (mass[1] + mass[2] + mass[3]) * g * L1 * Math.sin(t1);

    const f2 = (mass[2] + mass[3]) * L1 * L2 * w1 * w1 * Math.sin(t1 - t2)
      - mass[3] * L2 * L3 * w3 * w3 * Math.sin(t2 - t3)
      - (mass[2] + mass[3]) * g * L2 * Math.sin(t2);

    const f3 = mass[3] * L1 * L3 * w1 * w1 * Math.sin(t1 - t3)
      + mass[3] * L2 * L3 * w2 * w2 * Math.sin(t2 - t3)
      - mass[3] * g * L3 * Math.sin(t3);

    // Solve linear system M * alpha = F using Cramer's Rule
    const detM = m11 * (m22 * m33 - m23 * m32)
      - m12 * (m21 * m33 - m23 * m31)
      + m13 * (m21 * m32 - m22 * m31);

    if (Math.abs(detM) < 1e-10) {
      return [0, 0, 0];
    }

    const det1 = f1 * (m22 * m33 - m23 * m32)
      - m12 * (f2 * m33 - m23 * f3)
      + m13 * (f2 * m32 - m22 * f3);

    const det2 = m11 * (f2 * m33 - m23 * f3)
      - f1 * (m21 * m33 - m23 * m31)
      + m13 * (m21 * f3 - f2 * m31);

    const det3 = m11 * (m22 * f3 - f2 * m32)
      - m12 * (m21 * f3 - f2 * m31)
      + f1 * (m21 * m32 - m22 * m31);

    const alpha1 = det1 / detM;
    const alpha2 = det2 / detM;
    const alpha3 = det3 / detM;

    return [alpha1, alpha2, alpha3];
  }

  // Trails to store previous positions of the three nodes
  const trail1 = [];
  const trail2 = [];
  const trail3 = [];
  // Since phi oscillates back and forth, one complete swing cycle takes roughly 1500-1800 frames.
  // We sample coordinates every 3 frames. ~600 points covers a full swing.
  // We want the trail to remain solid for one full swing (600 pts) and fade out over the next half swing (300 pts).
  // Total trail length: 900 points.
  const maxTrailLength = 900;
  const skipFrames = 3;

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

    // Pendulum rod lengths (Increased slightly)
    const L1 = isMobile ? 110 : 160;
    const L2 = L1 / 2; // 2l
    const L3 = L1 / 4; // l (giving 4l : 2l : l ratio)

    // 2. Pendulum pivot coordinates (swings under gravity potential energy between diary (0) and profile (PI))
    // Acceleration a_g = (g_pivot / R) * cos(phi) where equilibrium is at the bottom (phi = PI/2)
    const g_pivot = 0.005; // Visual gravity parameter for the pivot
    const a_g = g_pivot / R;

    omega_phi += a_g * Math.cos(phi);
    phi += omega_phi;

    // Enforce hard boundaries at 0 and PI to prevent numerical overshoot or energy accumulation
    if (phi < 0) {
      phi = 0;
      omega_phi = 0;
    } else if (phi > Math.PI) {
      phi = Math.PI;
      omega_phi = 0;
    }

    const x0 = cx + R * Math.cos(phi);
    const y0 = cy + R * Math.sin(phi);

    // Initialize node angles if not done
    if (!isInitialized) {
      initNodeAngles();
    }

    // 3. Runge-Kutta 4th Order (RK4) Integration Sub-stepping
    // Feeds tiny sub-pixel chaotic perturbations directly to angular accelerations to prevent halting,
    // while preserving natural zero-velocity swings at peaks.
    const subSteps = 6;
    const dt = 0.05;

    // Closed system with no external forces to conserve mechanical energy perfectly.
    const getChaoticPerturb = (stepIdx) => {
      return [0, 0, 0];
    };

    for (let step = 0; step < subSteps; step++) {
      const perturb = getChaoticPerturb(step);

      // k1
      const alpha1 = derivatives(angles, omegas, L1, L2, L3);
      const k1_theta = [...omegas];
      const k1_omega = alpha1.map((a, i) => a + perturb[i]);

      // k2
      const temp_theta2 = angles.map((theta, i) => theta + 0.5 * dt * k1_theta[i]);
      const temp_omega2 = omegas.map((omega, i) => omega + 0.5 * dt * k1_omega[i]);
      const alpha2 = derivatives(temp_theta2, temp_omega2, L1, L2, L3);
      const k2_theta = [...temp_omega2];
      const k2_omega = alpha2.map((a, i) => a + perturb[i]);

      // k3
      const temp_theta3 = angles.map((theta, i) => theta + 0.5 * dt * k2_theta[i]);
      const temp_omega3 = omegas.map((omega, i) => omega + 0.5 * dt * k2_omega[i]);
      const alpha3 = derivatives(temp_theta3, temp_omega3, L1, L2, L3);
      const k3_theta = [...temp_omega3];
      const k3_omega = alpha3.map((a, i) => a + perturb[i]);

      // k4
      const temp_theta4 = angles.map((theta, i) => theta + dt * k3_theta[i]);
      const temp_omega4 = omegas.map((omega, i) => omega + dt * k3_omega[i]);
      const alpha4 = derivatives(temp_theta4, temp_omega4, L1, L2, L3);
      const k4_theta = [...temp_omega4];
      const k4_omega = alpha4.map((a, i) => a + perturb[i]);

      // Update state vectors (No damping to preserve mechanical energy perfectly)
      for (let i = 0; i < 3; i++) {
        angles[i] += (dt / 6) * (k1_theta[i] + 2 * k2_theta[i] + 2 * k3_theta[i] + k4_theta[i]);
        omegas[i] += (dt / 6) * (k1_omega[i] + 2 * k2_omega[i] + 2 * k3_omega[i] + k4_omega[i]);
      }
    }

    // 4. Resolve Cartesian Coordinates from Angles for rendering
    const x1 = x0 + L1 * Math.sin(angles[0]);
    const y1 = y0 + L1 * Math.cos(angles[0]);

    const x2 = x1 + L2 * Math.sin(angles[1]);
    const y2 = y1 + L2 * Math.cos(angles[1]);

    const x3 = x2 + L3 * Math.sin(angles[2]);
    const y3 = y2 + L3 * Math.cos(angles[2]);

    pos[0].x = x0;
    pos[0].y = y0;
    pos[1].x = x1;
    pos[1].y = y1;
    pos[2].x = x2;
    pos[2].y = y2;
    pos[3].x = x3;
    pos[3].y = y3;

    // Update trails on skip interval
    frameCount++;
    if (frameCount % skipFrames === 0) {
      trail1.push({ x: x1, y: y1 });
      trail2.push({ x: x2, y: y2 });
      trail3.push({ x: x3, y: y3 });

      if (trail1.length > maxTrailLength) trail1.shift();
      if (trail2.length > maxTrailLength) trail2.shift();
      if (trail3.length > maxTrailLength) trail3.shift();
    }

    // 4.5. Draw trails (fading out, with different colors for each node)
    const drawTrail = (trail, colorRGB, lineWidth = 1.0) => {
      if (trail.length < 2) return;
      const fullOrbitPoints = 600; // Sample count for 1 full orbit

      for (let i = 1; i < trail.length; i++) {
        const p1 = trail[i - 1];
        const p2 = trail[i];

        // Reverse index from the end of the trail
        const reverseIdx = trail.length - 1 - i;
        let alpha = 0.22;

        // If the coordinate is older than one full orbit, fade it out
        if (reverseIdx >= fullOrbitPoints) {
          const fadeRange = Math.max(1, trail.length - fullOrbitPoints);
          const ratio = 1 - (reverseIdx - fullOrbitPoints) / fadeRange;
          alpha = Math.max(0, ratio * 0.22);
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(${colorRGB}, ${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    drawTrail(trail1, '119, 155, 231', 2.0); // Node 1: #779be7 (Width 2.0)
    drawTrail(trail2, '164, 128, 207', 1.5); // Node 2: #a480cf (Width 1.5)
    drawTrail(trail3, '210, 100, 182', 1.0); // Node 3: #d264b6 (Width 1.0)

    // 5. Draw rods
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
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

    // Pivot has a neutral size, nodes 1, 2, 3 scale based on 4:2:1 mass ratio
    drawNode(x0, y0, 5.0, '#000000'); // Pivot (Black)
    drawNode(x1, y1, 8.0, '#779be7'); // Node 1 (Mass 4.0)
    drawNode(x2, y2, 5.5, '#a480cf'); // Node 2 (Mass 2.0)
    drawNode(x3, y3, 3.5, '#d264b6'); // Node 3 (Mass 1.0)

    requestAnimationFrame(updatePhysicsAndRender);
  }

  updatePhysicsAndRender();
}

/* ----------------------------------
   SPA VIEW CONTROL & ROUTING
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

  // Header logo is always visible (fixed position overlay)
}

// Router to resolve view states based on URL hashes
function handleRouting() {
  const hash = window.location.hash.substring(1);

  if (!hash) {
    showView('home');
  } else if (hash === 'profile') {
    showView('profile');
    window.scrollTo(0, 0);
  } else if (hash === 'diary') {
    showView('diary');
    document.getElementById('diary-list-container').style.display = 'block';
    const readerContainer = document.getElementById('diary-reader-container');
    if (readerContainer) readerContainer.style.display = 'none';
    renderDiary();
    window.scrollTo(0, 0);
  } else if (hash.startsWith('diary/')) {
    showView('diary');
    // Show reader, hide list
    document.getElementById('diary-list-container').style.display = 'none';
    const readerContainer = document.getElementById('diary-reader-container');
    if (readerContainer) readerContainer.style.display = 'block';

    const filename = decodeURIComponent(hash.substring(6));
    const post = allPosts.find(p => p.filename === filename);

    if (post) {
      renderReader(post);
    } else {
      window.location.hash = 'diary';
    }
  }
}

/* ----------------------------------
   EXPANDING RIPPLE PAGE TRANSITION
------------------------------------- */
function triggerTransition(targetHash, clickEvent) {
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
      triggerTransition(hash, e);
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
  const categoryCounts = { 'All': allPosts.length };
  allPosts.forEach(post => {
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
  let filteredPosts = allPosts.filter(post => {
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

// Render Markdown Reader Mode
function renderReader(post) {
  const listContainer = document.getElementById('diary-list-container');
  const readerContainer = document.getElementById('diary-reader-container');

  // Mark as read
  markPostAsRead(post.filename);

  // Set header details
  document.getElementById('reader-post-title').textContent = post.title;
  document.getElementById('reader-post-date').innerHTML = `<i class="far fa-calendar-alt"></i> ${post.date.split(' ')[0]}`;

  const categoryTag = post.categories && post.categories.length > 0
    ? `<span class="post-category-tag">${post.categories[0]}</span>`
    : '';
  document.getElementById('reader-post-category').innerHTML = categoryTag;

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

    document.getElementById('reader-post-content').innerHTML = wrappedHtml;
  } else {
    document.getElementById('reader-post-content').innerHTML = `<pre>${escapeHtml(post.content)}</pre>`;
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
