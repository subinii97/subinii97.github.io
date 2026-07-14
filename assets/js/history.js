// History section module initializer
function initHistoryControls() {
  console.log("History timeline module initialized.");
  initTabs();
}

// Year sidebar: smooth scroll on click + active state on scroll
function initYearSidebar() {
  const yearLinks = document.querySelectorAll('.year-link');
  if (!yearLinks.length) return;

  // Smooth scroll on click
  yearLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').slice(1); // remove '#'
      const target = document.getElementById(targetId);
      if (!target) return;

      // Offset for sticky header (~80px)
      const offset = 90;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });

      // Immediately update active state on click
      yearLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Update active year link based on scroll position
  const timelineItems = document.querySelectorAll('.timeline-item[id], .hobby-card[id]');
  if (!timelineItems.length) return;

  function updateActiveYear() {
    const scrollY = window.scrollY + 120; // offset for header + some breathing room
    let currentYear = null;

    timelineItems.forEach(item => {
      // Only check visible items to support toggle view
      if (item.offsetHeight === 0) return;

      const top = item.getBoundingClientRect().top + window.scrollY;
      if (scrollY >= top) {
        currentYear = item.id; // e.g. "year-2023" or "travel-2024" or "hobby-ballet"
      }
    });

    if (currentYear) {
      const mainYear = currentYear.split('-').slice(0, 2).join('-');
      yearLinks.forEach(link => {
        const href = link.getAttribute('href').slice(1);
        link.classList.toggle('active', href === mainYear);
      });
    }
  }

  // Prevent multiple scroll event listeners when reloading tabs
  if (window.currentScrollListener) {
    window.removeEventListener('scroll', window.currentScrollListener);
  }
  window.currentScrollListener = updateActiveYear;
  window.addEventListener('scroll', updateActiveYear, { passive: true });
  window.updateActiveYear = updateActiveYear; // Expose to window
  updateActiveYear(); // run once on load
}

// Tabs switcher between Life, Travel and Hobby
function initTabs() {
  const tabBtns = document.querySelectorAll('.history-toggle-btn');
  if (!tabBtns.length) return;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab'); // 'life', 'travel', or 'hobby'
      window.location.hash = target;
    });
  });

  // Listen to hashchange to switch tabs
  window.addEventListener('hashchange', handleHistoryHash);

  // Run once at start
  handleHistoryHash();
}

function handleHistoryHash() {
  const hash = window.location.hash.substring(1); // 'life' or 'travel' or 'hobby'
  
  // If hash points to a specific item ID, extract the appropriate tab
  let targetTab = 'life';
  if (hash.startsWith('travel-') || hash === 'travel') {
    targetTab = 'travel';
  } else if (hash.startsWith('hobby-') || hash === 'hobby') {
    targetTab = 'hobby';
  } else if (hash.startsWith('year-') || hash === 'life') {
    targetTab = 'life';
  } else {
    // Default fallback
    targetTab = 'life';
  }
  
  switchTab(targetTab);
}

let currentActiveTab = null;

async function switchTab(target) {
  if (currentActiveTab === target) {
    // If the tab is already loaded, but we have a specific hash anchor (e.g. #travel-2024), scroll to it.
    scrollToHashAnchor();
    return;
  }
  currentActiveTab = target;

  const tabBtns = document.querySelectorAll('.history-toggle-btn');
  if (!tabBtns.length) return;

  // Toggle hobby-mode class on history-layout
  const layoutContainer = document.querySelector('.history-layout');
  if (layoutContainer) {
    if (target === 'hobby') {
      layoutContainer.classList.add('hobby-mode');
    } else {
      layoutContainer.classList.remove('hobby-mode');
    }
  }

  // Update button active state
  tabBtns.forEach(btn => {
    const btnTab = btn.getAttribute('data-tab');
    btn.classList.toggle('active', btnTab === target);
  });

  // Update year sidebar title text
  const yearTitle = document.querySelector('.year-title');
  if (yearTitle) {
    if (target === 'hobby') {
      yearTitle.textContent = 'Categories';
    } else {
      yearTitle.textContent = 'Years';
    }
  }

  // Update main history title text
  const historyTitle = document.querySelector('.history-title');
  if (historyTitle) {
    if (target === 'hobby') {
      historyTitle.textContent = 'Hobbies';
    } else {
      historyTitle.textContent = 'Timeline';
    }
  }

  // Load content dynamically
  await loadTabContent(target);
}

async function loadTabContent(target) {
  const sidebarContainer = document.getElementById('year-sidebar-content');
  const timelineContainer = document.getElementById('history-timeline-container');
  
  if (!sidebarContainer || !timelineContainer) return;
  
  // Show loading indicator
  timelineContainer.innerHTML = '<div class="loading-spinner" style="text-align: center; padding: 3rem; color: var(--accent-primary);"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
  
  try {
    const response = await fetch(`./${target}.html?v=${Date.now()}`);
    if (!response.ok) throw new Error(`Failed to load ${target} history data`);
    const htmlText = await response.text();
    
    // Parse fetched HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    const newSidebar = doc.querySelector('.year-sidebar-inner');
    const newTimeline = doc.querySelector('.history-timeline');
    
    if (newSidebar) {
      sidebarContainer.innerHTML = '';
      sidebarContainer.appendChild(newSidebar);
    } else {
      sidebarContainer.innerHTML = '';
    }
    
    if (newTimeline) {
      timelineContainer.innerHTML = '';
      timelineContainer.appendChild(newTimeline);
    }
    
    // Re-initialize Year Sidebar links and scroll listeners
    initYearSidebar();
    

    
    // Scroll to the specific timeline item if specified in hash
    scrollToHashAnchor();
    
  } catch (error) {
    console.error(error);
    timelineContainer.innerHTML = `<p class="error-msg" style="text-align: center; padding: 3rem; color: #ff3333;">이력을 불러오는 도중 오류가 발생했습니다.</p>`;
  }
}

function scrollToHashAnchor() {
  const hash = window.location.hash;
  if (hash && hash.length > 1) {
    const targetId = hash.substring(1);
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      setTimeout(() => {
        const offset = 90;
        const top = targetElement.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }, 100);
    }
  }
}
