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
     vertical-fin texture behind Approach. */

  parallax($(".pdcm-band-art"), -12, 12);
  parallax($(".pdcm-fins"), -8, 8);

  var banner = $(".location-banner");
  if (banner) parallax(banner, -7, 7);


  /* ── Approach progress rail ──────────────────────────────────────
     Fills across as the three items pass. */

  var railFill = $(".pdcm-rail i");
  if (railFill) {
    gsap.to(railFill, {
      width: "100%",
      ease: "none",
      scrollTrigger: {
        trigger: ".approach-list",
        start: "top 78%",
        end: "bottom 72%",
        scrub: true
      }
    });
  }


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
