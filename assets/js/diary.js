// Diary page filter and page state variables
let selectedCategory = 'All';
let isDescOrder = true;
let searchQuery = '';
let currentPage = 1;

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

  // 0. Render "Recent Updates" Section (Top 3 recently updated posts across diary posts)
  const recentUpdatesEl = document.getElementById('diary-recent-updates');
  if (recentUpdatesEl && diaryPosts.length > 0) {
    const sortedByUpdate = [...diaryPosts].sort((a, b) => {
      const dateA = a.updated ? new Date(a.updated) : new Date(a.date.split(' ')[0]);
      const dateB = b.updated ? new Date(b.updated) : new Date(b.date.split(' ')[0]);
      return dateB - dateA;
    });

    const topUpdates = sortedByUpdate.slice(0, 3);
    
    recentUpdatesEl.innerHTML = topUpdates.map((post, idx) => {
      const imageUrl = getFirstImageUrl(post);
      const formattedCreatedDate = formatPostDate(post.date);
      const formattedUpdateDate = post.updated 
        ? formatPostDate(post.updated.split('T')[0]) 
        : null;

      const createdDateOnly = post.date.split(' ')[0];
      const updatedDateOnly = post.updated ? post.updated.split('T')[0] : createdDateOnly;
      const isUpdated = post.updated && createdDateOnly !== updatedDateOnly;

      const dateHtml = isUpdated
        ? `<span><i class="far fa-calendar-alt"></i> 작성: ${formattedCreatedDate}</span>
           <span><i class="fas fa-edit"></i> 수정: ${formattedUpdateDate}</span>`
        : `<span><i class="far fa-calendar-alt"></i> 작성: ${formattedCreatedDate}</span>`;

      const isRead = readPosts.has(post.filename);
      
      const updateDate = post.updated ? new Date(post.updated) : new Date(post.date);
      const diffMs = new Date() - updateDate;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const isNew = diffDays >= 0 && diffDays <= 7 && !isRead;

      const gradients = [
        'linear-gradient(135deg, #1e1e2f 0%, #110e1b 100%)',
        'linear-gradient(135deg, #122c34 0%, #0a1128 100%)',
        'linear-gradient(135deg, #2b1055 0%, #0f051d 100%)'
      ];
      const fallbackGradient = gradients[idx % gradients.length];
      const thumbnailStyle = imageUrl 
        ? `background-image: url('${imageUrl}');` 
        : `background: ${fallbackGradient};`;

      const typeLabel = post.type === 'study' ? 'Study' : 'Diary';
      const categoryLabel = post.categories && post.categories.length > 0 ? post.categories[0] : typeLabel;
      const targetHash = `#${post.type}/${encodeURIComponent(post.filename)}`;

      return `
        <a href="${targetHash}" class="update-card glass-card ${isRead ? 'read' : ''}" data-filename="${post.filename}">
          <div class="update-card-image" style="${thumbnailStyle}">
            <span class="update-card-badge">${categoryLabel}</span>
          </div>
          <div class="update-card-body">
            <h3 class="update-card-title">${escapeHtml(post.title)}</h3>
            <div class="update-card-meta">
              <span class="update-card-date">
                ${dateHtml}
              </span>
              ${isNew ? '<span class="new-badge">NEW</span>' : ''}
            </div>
          </div>
        </a>
      `;
    }).join('');
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

  if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

  const startIndex = (currentPage - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  const paginatedPosts = filteredPosts.slice(startIndex, endIndex);

  if (paginatedPosts.length === 0) {
    postList.innerHTML = `<p class="empty-msg">조건에 부합하는 일기가 없습니다.</p>`;
    renderPagination(0);
    return;
  }

  postList.innerHTML = paginatedPosts.map(post => {
    const isRead = readPosts.has(post.filename);

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

    const updateDate = post.updated ? new Date(post.updated) : postDate;
    const diffMs = new Date() - updateDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const isNew = diffDays >= 0 && diffDays <= 7 && !isRead;

    const formattedCreatedDate = formatPostDate(post.date);
    const formattedUpdateDate = post.updated 
      ? formatPostDate(post.updated.split('T')[0]) 
      : null;

    const createdDateOnly = post.date.split(' ')[0];
    const updatedDateOnly = post.updated ? post.updated.split('T')[0] : createdDateOnly;
    const isUpdated = post.updated && createdDateOnly !== updatedDateOnly;

    const dateDisplay = isUpdated
      ? `${formattedCreatedDate} (수정: ${formattedUpdateDate})`
      : formattedCreatedDate;

    const tagText = post.categories && post.categories.length > 0 ? post.categories[0] : 'Diary';

    return `
      <a href="#diary/${encodeURIComponent(post.filename)}" class="post-item diary-inline-item glass-card ${isRead ? 'read' : ''}" data-filename="${post.filename}">
        <span class="diary-item-tag">${escapeHtml(tagText)}</span>
        <span class="diary-item-separator">|</span>
        <h2 class="diary-item-title">
          <span>${escapeHtml(post.title)}</span>
          ${isNew ? '<span class="new-badge">NEW</span>' : ''}
        </h2>
        <span class="diary-item-separator">|</span>
        <span class="diary-item-date">${dateDisplay}</span>
      </a>
    `;
  }).join('');

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

  html += `
    <button class="pag-btn prev-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
      <i class="fas fa-chevron-left"></i> 이전
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === currentPage ? 'active' : '';
    html += `
      <button class="pag-btn num-btn ${activeClass}" onclick="changePage(${i})">${i}</button>
    `;
  }

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

  const targetView = document.getElementById('diary-view');
  if (targetView) {
    targetView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// Category filter trigger
window.filterCategory = function (categoryName) {
  selectedCategory = categoryName;
  currentPage = 1;
  renderDiary();
};
