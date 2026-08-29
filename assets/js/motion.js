/* ════════════════════════════════════════════════════════════════════
   PDCM — MOTION LAYER
   ════════════════════════════════════════════════════════════════════

   Progressive enhancement over the existing page. This file adds no
   content and reads no copy; it only animates elements that are already
   in the document.

   It stands down entirely — leaving the current site behaviour intact —
   when GSAP is unavailable or the visitor has asked for reduced motion.
   The .pdcm-motion class on <html> is the single switch: motion.css does
   nothing without it.
   ════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════
   HERO LIGHT FIELD
   ════════════════════════════════════════════════════════════════════

   Slow-drifting volumetric light over the hero's existing gradient. Runs
   independently of GSAP and of the scroll layer below: if a visitor has
   asked for reduced motion it draws a single still frame rather than
   disappearing, because a still light field is not motion.

   Colours are guideline values only — Capital Blue and Harbor Slate
   carry the field, with one Soft Gold mass kept low and slow, since the
   guidelines reserve gold for elevated use and ask that it stay sparing.
   ════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  var canvas = document.querySelector(".pdcm-hero-canvas");
  if (!hero || !canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Rendered at a sixth of display size and scaled up by CSS. The
     upscale does most of the softening; the CSS blur finishes it. */
  var SCALE = 6;

  /* Periods are deliberately coprime so the masses never resynchronise
     into a visible loop. They sit in the 17-31s range: slow enough to
     stay calm, quick enough that the hero is visibly alive within a few
     seconds of landing. The gold mass is the slowest and faintest. */
  var MASSES = [
    // colour               alpha  radius  origin        drift amp     period (s)
    { c: [33, 93, 155],   a: 0.50, r: 0.62, x: 0.30, y: 0.34, ax: 0.24, ay: 0.15, px: 19, py: 26 },
    { c: [47, 71, 104],   a: 0.55, r: 0.70, x: 0.72, y: 0.30, ax: 0.21, ay: 0.18, px: 23, py: 17 },
    { c: [33, 93, 155],   a: 0.34, r: 0.46, x: 0.54, y: 0.66, ax: 0.26, ay: 0.14, px: 29, py: 21 },
    { c: [234, 208, 156], a: 0.11, r: 0.34, x: 0.20, y: 0.26, ax: 0.17, ay: 0.11, px: 31, py: 27 }
  ];

  var w = 0;
  var h = 0;

  function size() {
    var r = hero.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width / SCALE));
    h = Math.max(1, Math.round(r.height / SCALE));
    canvas.width = w;
    canvas.height = h;
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    var min = Math.min(w, h);

    for (var i = 0; i < MASSES.length; i++) {
      var m = MASSES[i];
      var cx = (m.x + Math.sin(t / m.px) * m.ax) * w;
      var cy = (m.y + Math.cos(t / m.py) * m.ay) * h;
      var rad = m.r * min;

      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      var rgb = m.c[0] + "," + m.c[1] + "," + m.c[2];
      g.addColorStop(0, "rgba(" + rgb + "," + m.a + ")");
      g.addColorStop(0.55, "rgba(" + rgb + "," + m.a * 0.32 + ")");
      g.addColorStop(1, "rgba(" + rgb + ",0)");

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  var running = false;
  var raf = null;
  var start = null;

  function frame(now) {
    if (start === null) start = now;
    draw((now - start) / 1000);
    raf = window.requestAnimationFrame(frame);
  }

  function play() {
    if (running || reduce.matches) return;
    running = true;
    raf = window.requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = null;
  }

  function init() {
    size();
    draw(0);
    canvas.classList.add("is-lit");
    if (!reduce.matches) play();
  }

  init();

  /* Nothing to animate while the hero is off screen or the tab is
     hidden — a background that costs battery on an unread page is a
     bug, not an effect. */
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      entries[0].isIntersecting ? play() : pause();
    }, { threshold: 0 }).observe(hero);
  }

  document.addEventListener("visibilitychange", function () {
    document.hidden ? pause() : play();
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      size();
      if (!running) draw(0);
    }, 180);
  });

  /* Honour a preference changed after load, in both directions. */
  var onPref = function () {
    if (reduce.matches) { pause(); draw(0); } else { start = null; play(); }
  };
  if (reduce.addEventListener) reduce.addEventListener("change", onPref);
  else if (reduce.addListener) reduce.addListener(onPref);
})();


(function () {
  "use strict";

  if (!window.gsap || !window.ScrollTrigger) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  gsap.registerPlugin(ScrollTrigger);

  var root = document.documentElement;
  root.classList.add("pdcm-motion");

  var wide = window.matchMedia("(min-width: 901px)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* Parallax an inner layer against its container as it crosses the
     viewport. Uses yPercent so it stays correct at any element height. */
  function parallax(el, from, to) {
    if (!el || !el.parentElement) return;
    gsap.fromTo(el,
      { yPercent: from },
      {
        yPercent: to,
        ease: "none",
        scrollTrigger: {
          trigger: el.parentElement,
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      }
    );
  }


  /* ── Hero ────────────────────────────────────────────────────────
     The typed headline and the ambient gradient drift are existing
     signature behaviour and are left alone. This adds depth on exit,
     draws the gold rule in, and shows a scroll affordance. */

  var heroContent = $(".hero-content");
  if (heroContent) {
    gsap.to(heroContent, {
      yPercent: -13,
      opacity: 0.2,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: true
      }
    });
  }

  var heroRule = $(".pdcm-hero-rule");
  if (heroRule) {
    gsap.to(heroRule, {
      width: 220,
      duration: 1.6,
      delay: 1.1,
      ease: "power3.out"
    });
  }

  var cue = $(".pdcm-scroll-cue");
  if (cue) {
    gsap.to(cue, { opacity: 1, duration: 1.2, delay: 2.2, ease: "power2.out" });
    gsap.to(cue, {
      opacity: 0,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "15% top", scrub: true }
    });
  }


  /* ── Scroll reveals ──────────────────────────────────────────────
     Takes over from the base stylesheet's CSS-transition reveal. The
     value cards are excluded on wide viewports because the sticky stack
     drives their opacity and scale instead. */

  $$(".reveal").forEach(function (el) {
    if (wide && el.classList.contains("value-accordion-item")) return;
    el.classList.add("pdcm-rise");
    gsap.fromTo(el,
      { opacity: 0, y: 34 },
      {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 86%", once: true }
      }
    );
  });

  /* Stagger the three Approach items rather than firing them together. */
  var approachItems = $$(".approach-item");
  if (approachItems.length) {
    gsap.fromTo(approachItems,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 1.1,
        stagger: 0.14,
        ease: "power3.out",
        scrollTrigger: { trigger: ".approach-list", start: "top 82%", once: true }
      }
    );
  }


  /* ── Atmosphere ──────────────────────────────────────────────────
     The transitional band between The Firm and Approach, and the
     existing Tulsa photograph in Contact. */

  parallax($(".pdcm-band-art"), -12, 12);

  var banner = $(".location-banner");
  if (banner) parallax(banner, -7, 7);


  /* ── Values sticky stack ─────────────────────────────────────────
     Each card is pinned by CSS position:sticky. GSAP only handles the
     shrink-and-dim, driven by the NEXT card's arrival — that ordering is
     what makes the stack read as depth rather than as a slideshow.

     Below 901px the accordion is untouched and this is skipped. */

  if (wide) {
    var cards = $$(".accordion-values .value-accordion-item");

    cards.forEach(function (card, i) {
      var bar = $(".value-hover-bar", card);
      if (bar) {
        gsap.fromTo(bar,
          { width: "0%" },
          {
            width: "100%",
            duration: 1.3,
            ease: "power2.out",
            scrollTrigger: { trigger: card, start: "top 62%", once: true }
          }
        );
      }

      var body = $(".value-accordion-panel", card);
      var head = $(".value-accordion-trigger", card);
      if (head && body) {
        gsap.fromTo([head, body],
          { opacity: 0, y: 26 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: { trigger: card, start: "top 68%", once: true }
          }
        );
      }

      if (i === cards.length - 1) return;

      /* The card itself keeps opacity 1 so its background stays opaque
         and always occludes the card beneath. Fading the card as a whole
         (the canonical approach) makes every stuck card translucent at
         once and all five principles read through each other at the same
         time. So the card scales, and only its CONTENT dims.

         The window also starts at "top 70%" rather than "top bottom":
         with 88vh cards the next card's top crosses the viewport floor
         while the current one is still being read, which would dim the
         active card under the reader's eye. */
      var content = [head, body].filter(Boolean);

      gsap.to(card, {
        scale: 0.94,
        ease: "none",
        scrollTrigger: {
          trigger: cards[i + 1],
          start: "top 70%",
          end: "top top",
          scrub: true
        }
      });

      if (content.length) {
        gsap.to(content, {
          opacity: 0.25,
          ease: "none",
          scrollTrigger: {
            trigger: cards[i + 1],
            start: "top 70%",
            end: "top 20%",
            scrub: true
          }
        });
      }
    });
  }


  /* ── Navigation indicator ────────────────────────────────────────
     A gold hairline that slides to the link for the section in view.
     The lockup is deliberately not animated — brand guidelines 01.06
     forbids blur, shadow, gradient, scale, and distortion on the mark. */

  var ind = $(".pdcm-nav-ind");
  var navLinks = $$('.nav-links a[href^="#"]');

  if (ind && navLinks.length) {
    var place = function (link) {
      gsap.to(ind, {
        x: link.offsetLeft,
        width: link.offsetWidth,
        opacity: 1,
        duration: 0.55,
        ease: "power3.out"
      });
    };

    navLinks.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var section = id && document.getElementById(id);
      if (!section) return;

      ScrollTrigger.create({
        trigger: section,
        start: "top 42%",
        end: "bottom 42%",
        onEnter: function () { place(link); },
        onEnterBack: function () { place(link); },
        onLeave: function () { gsap.to(ind, { opacity: 0, duration: 0.35 }); },
        onLeaveBack: function () { gsap.to(ind, { opacity: 0, duration: 0.35 }); }
      });
    });
  }


  /* ── Recalculation ───────────────────────────────────────────────
     Trigger positions are measured from layout, so they must be redone
     after the webfonts settle (Cormorant reflows headings) and after the
     Family Office Notice gate releases the page. */

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }

  window.addEventListener("load", function () { ScrollTrigger.refresh(); });

  $$("[data-entry-disclaimer-close]").forEach(function (button) {
    button.addEventListener("click", function () {
      setTimeout(function () { ScrollTrigger.refresh(); }, 120);
    });
  });
})();
