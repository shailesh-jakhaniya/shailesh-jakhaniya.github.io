(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'portfolio-theme';

  // ---- Theme toggle ----
  var themeToggle = document.getElementById('themeToggle');
  var storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_KEY);
  } catch (e) {
    // localStorage unavailable (private browsing, etc.) — fall back to system preference only
  }
  if (storedTheme === 'light' || storedTheme === 'dark') {
    root.setAttribute('data-theme', storedTheme);
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = root.getAttribute('data-theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var effectiveCurrent = current || (prefersDark ? 'dark' : 'light');
      var next = effectiveCurrent === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        // ignore storage failures
      }
    });
  }

  // ---- Footer year ----
  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // ---- Mobile nav toggle ----
  var navToggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  function closeMobileNav() {
    if (nav) nav.classList.remove('is-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // =========================================================
  // Paged "book flip" controller
  // =========================================================
  var pagesWrapper = document.getElementById('pages');
  var pages = pagesWrapper ? Array.prototype.slice.call(pagesWrapper.querySelectorAll('.page')) : [];
  var dotsNav = document.getElementById('pageDots');
  var dotButtons = dotsNav ? Array.prototype.slice.call(dotsNav.querySelectorAll('button')) : [];
  var scrollHint = document.getElementById('scrollHint');

  if (pagesWrapper && pages.length) {
    var pageIds = pages.map(function (p) { return p.id; });
    var totalPages = pages.length;
    var currentIndex = 0;
    var isAnimating = false;
    var animLock = null;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var FLIP_DURATION = reducedMotion ? 400 : 1000;

    // Static z-index so earlier pages always stack above later ones.
    // Combined with backface-visibility:hidden, a flipped-away page
    // renders nothing even though its z-index is technically higher.
    pages.forEach(function (page, i) {
      page.style.zIndex = String(totalPages - i);
    });

    function resetReveals(page) {
      var els = page.querySelectorAll('.reveal');
      for (var i = 0; i < els.length; i++) {
        els[i].classList.remove('is-visible');
      }
    }

    function triggerReveals(page) {
      var els = page.querySelectorAll('.reveal');
      els.forEach(function (el, i) {
        setTimeout(function () {
          el.classList.add('is-visible');
        }, 100 + i * 70);
      });
    }

    function updateDots() {
      dotButtons.forEach(function (btn, i) {
        btn.classList.toggle('active', i === currentIndex);
      });
    }

    function updateNavLinks() {
      var activeId = pageIds[currentIndex];
      document.querySelectorAll('.nav-link').forEach(function (link) {
        var href = link.getAttribute('href') || '';
        link.classList.toggle('active', href === '#' + activeId);
      });
    }

    function updateHash() {
      var id = pageIds[currentIndex];
      if (history.replaceState) {
        history.replaceState(null, '', '#' + id);
      } else {
        location.hash = id;
      }
    }

    function applyState(animated) {
      pages.forEach(function (page, i) {
        page.classList.toggle('is-flipped', i < currentIndex);
        var isActive = i === currentIndex;
        page.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        if (isActive) {
          page.removeAttribute('inert');
        } else {
          page.setAttribute('inert', '');
        }
      });
      updateDots();
      updateNavLinks();
      triggerReveals(pages[currentIndex]);
      if (animated) {
        isAnimating = true;
        clearTimeout(animLock);
        animLock = setTimeout(function () { isAnimating = false; }, FLIP_DURATION);
      }
    }

    function goTo(targetIndex) {
      targetIndex = Math.max(0, Math.min(totalPages - 1, targetIndex));
      if (targetIndex === currentIndex || isAnimating) return;
      resetReveals(pages[currentIndex]);
      currentIndex = targetIndex;
      applyState(true);
      updateHash();
      closeMobileNav();
    }

    // ---- Initial state (from URL hash, no animation) ----
    // A deep link like "#expertise" can require several pages to already be
    // "flipped" on first paint — without this, they'd all visibly animate
    // through on load. Suppress transitions until that first state is applied.
    var initialId = (location.hash || '').replace('#', '');
    var initialIndex = pageIds.indexOf(initialId);
    currentIndex = initialIndex !== -1 ? initialIndex : 0;
    pagesWrapper.classList.add('no-anim');
    applyState(false);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        pagesWrapper.classList.remove('no-anim');
      });
    });

    // ---- Wheel navigation (boundary-aware so long sections still scroll internally) ----
    var WHEEL_COOLDOWN = 60;
    var lastWheelAt = 0;

    window.addEventListener('wheel', function (e) {
      var activeInner = pages[currentIndex].querySelector('.page-inner');
      if (!activeInner) return;

      var dir = e.deltaY > 0 ? 1 : -1;
      var atTop = activeInner.scrollTop <= 1;
      var atBottom = activeInner.scrollTop + activeInner.clientHeight >= activeInner.scrollHeight - 1;

      var wantsPageChange = (dir > 0 && atBottom) || (dir < 0 && atTop);
      if (!wantsPageChange) return; // let the section scroll internally

      e.preventDefault();

      var now = Date.now();
      if (isAnimating || now - lastWheelAt < WHEEL_COOLDOWN) return;
      lastWheelAt = now;

      goTo(currentIndex + dir);
    }, { passive: false });

    // ---- Touch navigation ----
    var touchStartY = 0;
    var TOUCH_THRESHOLD = 60;

    window.addEventListener('touchstart', function (e) {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', function (e) {
      if (isAnimating) return;
      var deltaY = touchStartY - e.changedTouches[0].clientY;
      if (Math.abs(deltaY) < TOUCH_THRESHOLD) return;

      var activeInner = pages[currentIndex].querySelector('.page-inner');
      if (!activeInner) return;
      var dir = deltaY > 0 ? 1 : -1;
      var atTop = activeInner.scrollTop <= 1;
      var atBottom = activeInner.scrollTop + activeInner.clientHeight >= activeInner.scrollHeight - 1;

      if ((dir > 0 && atBottom) || (dir < 0 && atTop)) {
        goTo(currentIndex + dir);
      }
    }, { passive: true });

    // ---- Keyboard navigation ----
    window.addEventListener('keydown', function (e) {
      if (isAnimating) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          goTo(currentIndex + 1);
          break;
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goTo(currentIndex - 1);
          break;
        case 'Home':
          e.preventDefault();
          goTo(0);
          break;
        case 'End':
          e.preventDefault();
          goTo(totalPages - 1);
          break;
      }
    });

    // ---- Nav links, buttons with hash hrefs, and dots ----
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      var targetId = link.getAttribute('href').slice(1);
      var idx = pageIds.indexOf(targetId);
      if (idx === -1) return;
      link.addEventListener('click', function (e) {
        e.preventDefault();
        goTo(idx);
      });
    });

    dotButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = pageIds.indexOf(btn.getAttribute('data-target'));
        if (idx !== -1) goTo(idx);
      });
    });

    if (scrollHint) {
      scrollHint.addEventListener('click', function () { goTo(1); });
    }

    // Keep hash-based deep links working if the user edits the URL manually
    window.addEventListener('hashchange', function () {
      var idx = pageIds.indexOf((location.hash || '').replace('#', ''));
      if (idx !== -1) goTo(idx);
    });
  }
})();
