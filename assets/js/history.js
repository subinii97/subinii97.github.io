// History section module initializer
function initHistoryControls() {
  console.log("History timeline module initialized.");
  initYearSidebar();
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
  const timelineItems = document.querySelectorAll('.timeline-item[id]');
  if (!timelineItems.length) return;

  function updateActiveYear() {
    const scrollY = window.scrollY + 120; // offset for header + some breathing room
    let currentYear = null;

    timelineItems.forEach(item => {
      // Only check visible items to support toggle view
      if (item.offsetHeight === 0) return;

      const top = item.getBoundingClientRect().top + window.scrollY;
      if (scrollY >= top) {
        currentYear = item.id; // e.g. "year-2023" or "travel-2024"
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

  window.addEventListener('scroll', updateActiveYear, { passive: true });
  window.updateActiveYear = updateActiveYear; // Expose to window so toggle can invoke it
  updateActiveYear(); // run once on load
}

// Tabs switcher between Life timeline and Travel timeline
function initTabs() {
  const tabBtns = document.querySelectorAll('.history-toggle-btn');
  if (!tabBtns.length) return;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab'); // 'life' or 'travel'
      window.location.hash = target;
    });
  });

  // Listen to hashchange to switch tabs
  window.addEventListener('hashchange', handleHistoryHash);

  // Run once at start
  handleHistoryHash();
}

function handleHistoryHash() {
  const hash = window.location.hash.substring(1); // 'life' or 'travel' or other (e.g. empty)
  if (hash === 'travel') {
    switchTab('travel');
  } else {
    // Default or explicit 'life'
    switchTab('life');
  }
}

function switchTab(target) {
  const tabBtns = document.querySelectorAll('.history-toggle-btn');
  const timelineSection = document.getElementById('timeline-content');
  const travelSection = document.getElementById('travel-content');
  const timelineYears = document.getElementById('timeline-years');
  const travelYears = document.getElementById('travel-years');

  if (!tabBtns.length) return;

  // Update button active state
  tabBtns.forEach(btn => {
    const btnTab = btn.getAttribute('data-tab'); // 'life' or 'travel'
    btn.classList.toggle('active', btnTab === target);
  });

  // Update content visibility
  if (target === 'life') {
    if (timelineSection) timelineSection.style.display = 'block';
    if (travelSection) travelSection.style.display = 'none';
    if (timelineYears) timelineYears.style.display = 'flex';
    if (travelYears) travelYears.style.display = 'none';
  } else {
    if (timelineSection) timelineSection.style.display = 'none';
    if (travelSection) travelSection.style.display = 'block';
    if (timelineYears) timelineYears.style.display = 'none';
    if (travelYears) travelYears.style.display = 'flex';
  }

  // Re-trigger active sidebar link update
  if (typeof window.updateActiveYear === 'function') {
    window.updateActiveYear();
  }
}
