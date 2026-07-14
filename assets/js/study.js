// Study page filter and page state variables
let studySelectedCategory = 'All';
let studyIsDescOrder = true;
let studySearchQuery = '';
let studyCurrentPage = 1;

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
          ${isNew ? '<span class="new-badge">UPDATED</span>' : ''}
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
