// Career section module initializer
function initCareerControls() {
  console.log("Career timeline module initialized.");
  initYearSidebar();
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
      const top = item.getBoundingClientRect().top + window.scrollY;
      if (scrollY >= top) {
        currentYear = item.id; // e.g. "year-2023"
      }
    });

    if (currentYear) {
      yearLinks.forEach(link => {
        const href = link.getAttribute('href').slice(1);
        link.classList.toggle('active', href === currentYear);
      });
    }
  }

  window.addEventListener('scroll', updateActiveYear, { passive: true });
  updateActiveYear(); // run once on load
}
