/* ═══════════════════════════════════════════════════════════════════════
   PHILIP DAVID CAPITAL MANAGEMENT — page behaviour
   ═══════════════════════════════════════════════════════════════════════

   Order of business: the Family Office Notice governs the page, so it is
   wired first and everything else waits behind it.

   The motion layer is progressive. html.motion is added only when GSAP is
   present AND the visitor has not asked for reduced motion; site.css does
   nothing without it. If either fails the page renders as a plain,
   complete, scrollable document.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var MOTION = hasGsap && !reduce;

  var root = document.documentElement;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  if (MOTION) {
    gsap.registerPlugin(ScrollTrigger);
    root.classList.add('motion');
  }


  /* ══ Smooth scroll ═══════════════════════════════════════════════════
     Lenis drives the scroll and ScrollTrigger reads from it. Held in a
     variable so the entry gate can stop it outright. */

  var lenis = null;

  if (MOTION && window.Lenis) {
    lenis = new Lenis({
      duration: 1.15,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  function lockScroll() {
    document.body.classList.add('is-locked');
    if (lenis) lenis.stop();
  }

  function unlockScroll() {
    document.body.classList.remove('is-locked');
    if (lenis) lenis.start();
  }


  /* ══ Entry gate ══════════════════════════════════════════════════════
     The Family Office Notice must sit over the LANDING PAGE and nowhere
     else. Two things guarantee that, on every visit:

       1. Scroll restoration is turned off and the document is pinned to
          the top before the gate is shown, so a reload part-way down the
          page still opens against the hero.
       2. The scroll is locked for as long as the gate is open, so the
          page cannot travel out from underneath it.

     The scrim is light on purpose: the headline and the lockup stay
     visible behind the notice, which is the intended first impression. */

  var gate = $('#gate');
  var introDone = false;

  function toTop() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (lenis) lenis.scrollTo(0, { immediate: true });
    window.scrollTo(0, 0);
  }

  function openGate() {
    if (!gate) return;
    toTop();
    lockScroll();
    gate.classList.add('is-open');
    gate.setAttribute('aria-hidden', 'false');
    var ack = $('.gate-ack', gate);
    if (ack) setTimeout(function () { ack.focus(); }, 420);
  }

  function closeGate() {
    if (!gate) return;
    gate.classList.remove('is-open');
    gate.setAttribute('aria-hidden', 'true');
    unlockScroll();
    toTop();
    playIntro();
    if (MOTION) setTimeout(function () { ScrollTrigger.refresh(); }, 200);
  }

  if (gate) {
    toTop();
    $$('[data-gate-close]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); closeGate(); });
    });
    /* Keep focus inside the notice while it is open. */
    gate.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('button, [href], input, select, textarea', gate)
        .filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    setTimeout(openGate, 120);
  }


  /* ══ Hero scene ══════════════════════════════════════════════════════
     Lives in scene.js, which boots itself as a module. A WebGL failure
     there is silent by design: the hero keeps its CSS gradient. */


  /* ══ Intro ═══════════════════════════════════════════════════════════
     Runs once, after the notice is dismissed — the first thing the
     visitor sees move. */

  function playIntro() {
    if (introDone) return;
    introDone = true;
    if (!MOTION) return;

    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.from('.nav', { yPercent: -100, opacity: 0, duration: 1.1 })
      .from('.hero-eyebrow', { opacity: 0, y: 18, duration: 0.9 }, 0.15)
      .from('.hero h1 .line-mask > *', {
        yPercent: 118, duration: 1.35, stagger: 0.11
      }, 0.25)
      .from('.hero-sub', { opacity: 0, y: 22, duration: 1 }, 0.75)
      .from('.hero-foot', { opacity: 0, duration: 1.2 }, 0.95)
      .to('.rail', { opacity: 1, duration: 1 }, 1);
  }

  /* If there is no gate for any reason, the intro should still run. */
  if (!gate) { unlockScroll(); playIntro(); }


  /* ══ Navigation ══════════════════════════════════════════════════════ */

  var nav = $('.nav');
  var onScroll = function () {
    if (nav) nav.classList.toggle('is-stuck', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var toggle = $('.nav-toggle');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* In-page links, routed through Lenis so they inherit the same easing. */
  $$('a[href^="#"]').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === '#' || a.hasAttribute('data-modal')) return;
    a.addEventListener('click', function (e) {
      var target = document.getElementById(href.slice(1));
      if (!target) return;
      e.preventDefault();
      if (nav) { nav.classList.remove('is-open'); }
      if (lenis) lenis.scrollTo(target, { offset: -70 });
      else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    });
  });


  /* ══ Legal modals ════════════════════════════════════════════════════
     Copy and structure are untouched from the original document. */

  var lastFocus = null;

  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    lastFocus = document.activeElement;
    m.setAttribute('aria-hidden', 'false');
    lockScroll();
    var c = $('.modal-card', m);
    if (c) { c.scrollTop = 0; }
    var close = $('.modal-close', m);
    if (close) setTimeout(function () { close.focus(); }, 60);
  }

  function closeModal(m) {
    m.setAttribute('aria-hidden', 'true');
    if (!gate || !gate.classList.contains('is-open')) unlockScroll();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  $$('[data-modal]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(el.getAttribute('data-modal'));
    });
  });

  $$('[data-modal-close]').forEach(function (el) {
    el.addEventListener('click', function () {
      var m = el.closest('.modal');
      if (m) closeModal(m);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    $$('.modal[aria-hidden="false"]').forEach(closeModal);
  });


  /* ══ Scroll motion ═══════════════════════════════════════════════════ */

  if (MOTION) {

    /* Headings rise from behind a mask. The masks are authored in the
       markup rather than split at runtime, so the line breaks are exactly
       where they were written and nested italics survive intact. */
    $$('section .line-mask > *').forEach(function (line) {
      gsap.from(line, {
        yPercent: 116,
        duration: 1.25,
        ease: 'power3.out',
        scrollTrigger: { trigger: line, start: 'top 92%', once: true }
      });
    });

    $$('.fade-up').forEach(function (el) {
      gsap.fromTo(el,
        { opacity: 0, y: 34 },
        {
          opacity: 1, y: 0, duration: 1.15, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true }
        }
      );
    });

    /* Approach: the three items arrive in sequence and each hairline
       draws itself across. */
    var items = $$('.approach-item');
    if (items.length) {
      gsap.fromTo(items,
        { opacity: 0, y: 44 },
        {
          opacity: 1, y: 0, duration: 1.15, stagger: 0.13, ease: 'power3.out',
          scrollTrigger: { trigger: '.approach-list', start: 'top 84%', once: true }
        }
      );
      /* Each item's hairline draws across as the item settles. It is a
         real element rather than a pseudo-element so it can be tweened. */
      $$('.approach-rule').forEach(function (rule, n) {
        gsap.fromTo(rule,
          { width: '0%' },
          {
            width: '100%', duration: 1.2, delay: n * 0.13, ease: 'power2.out',
            scrollTrigger: { trigger: '.approach-list', start: 'top 84%', once: true }
          }
        );
      });
    }

    /* Values: pinned cards by CSS sticky; GSAP only scales the outgoing
       card and dims its contents. The card background stays fully opaque
       so exactly one principle is ever legible. */
    if (window.matchMedia('(min-width: 901px)').matches) {
      var cards = $$('.value');
      cards.forEach(function (card, n) {
        var rule = $('.value-rule', card);
        if (rule) {
          gsap.fromTo(rule, { width: '0%' }, {
            width: '100%', duration: 1.3, ease: 'power2.out',
            scrollTrigger: { trigger: card, start: 'top 60%', once: true }
          });
        }

        var body = $('.value-inner', card);
        if (body) {
          gsap.fromTo(body, { opacity: 0, y: 40 }, {
            opacity: 1, y: 0, duration: 1.05, ease: 'power3.out',
            scrollTrigger: { trigger: card, start: 'top 72%', once: true }
          });
        }

        if (n === cards.length - 1) return;

        gsap.to(card, {
          scale: 0.945,
          ease: 'none',
          scrollTrigger: {
            trigger: cards[n + 1], start: 'top 72%', end: 'top top', scrub: true
          }
        });

        if (body) {
          gsap.to(body, {
            opacity: 0.22,
            ease: 'none',
            scrollTrigger: {
              trigger: cards[n + 1], start: 'top 78%', end: 'top 46%', scrub: true
            }
          });
        }
      });
    }

    /* Contact photograph drifts against its frame. */
    var photo = $('.contact-media img');
    if (photo) {
      gsap.fromTo(photo, { yPercent: -7 }, {
        yPercent: 7, ease: 'none',
        scrollTrigger: { trigger: '.contact-media', start: 'top bottom', end: 'bottom top', scrub: true }
      });
    }

    /* Active section, reflected in both the nav and the margin rail. */
    $$('section[id], header[id]').forEach(function (sec) {
      var links = $$('a[href="#' + sec.id + '"]');
      if (!links.length) return;
      var mark = function (on) {
        links.forEach(function (l) { l.classList.toggle('is-active', on); });
      };
      ScrollTrigger.create({
        trigger: sec,
        start: 'top 45%',
        end: 'bottom 45%',
        onEnter: function () { mark(true); },
        onEnterBack: function () { mark(true); },
        onLeave: function () { mark(false); },
        onLeaveBack: function () { mark(false); }
      });
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }
})();
