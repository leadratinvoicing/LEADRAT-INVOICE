import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ============================================================
   APP TOUR OVERLAY
   Dims the app, cuts a hole around the element the current step points at, and
   floats a card next to it. Steps that name a `page` switch the app there first
   and then wait for that element to actually exist, because the list pages
   mount their rows a frame later than the nav click.

   On the mandatory first run there is no Skip — the only way out is to reach
   the end. Replays from ❓ Help can be closed at any time.
   ============================================================ */

const GUTTER = 12;      // keep the card this far from the viewport edge
const PAD = 6;          // breathing room around the spotlit element
const CARD_W = 340;

/** Waits for a selector to appear, giving the page a few frames to mount. */
function waitForTarget(selector, cb) {
  let tries = 0;
  let raf = 0;
  const look = () => {
    const el = document.querySelector(selector);
    if (el || tries > 40) { cb(el); return; }   // ~40 frames ≈ 650ms, then give up
    tries += 1;
    raf = requestAnimationFrame(look);
  };
  look();
  return () => cancelAnimationFrame(raf);
}

export default function AppTour({ open, steps, mandatory, onNavigate, onFinish }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);   // null => centred card, no spotlight
  const cancelRef = useRef(null);

  const step = open && steps.length ? steps[Math.min(i, steps.length - 1)] : null;
  const last = i >= steps.length - 1;

  /* Restart from the top whenever the tour is (re)opened. */
  useEffect(() => { if (open) setI(0); }, [open]);

  /* Find and frame the current step's target. */
  useEffect(() => {
    if (!step) return undefined;
    if (cancelRef.current) cancelRef.current();

    if (step.page && onNavigate) onNavigate(step.page);

    if (!step.target) { setRect(null); return undefined; }

    setRect(null);
    const cancel = waitForTarget(step.target, (el) => {
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      // Let the smooth scroll settle before measuring, or the hole lands off-target.
      setTimeout(() => {
        const live = document.querySelector(step.target);
        if (live) setRect(live.getBoundingClientRect());
      }, 220);
    });
    cancelRef.current = cancel;
    return cancel;
  }, [step, onNavigate]);

  /* The hole must follow the element if the page moves under it. */
  useEffect(() => {
    if (!step || !step.target) return undefined;
    const remeasure = () => {
      const el = document.querySelector(step.target);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, [step]);

  const finish = useCallback((completed) => { onFinish(completed); }, [onFinish]);
  const next = useCallback(() => {
    if (last) finish(true); else setI((n) => n + 1);
  }, [last, finish]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  /* Keyboard: arrows step through, Esc leaves a replay (never the first run). */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.key === 'Escape' && !mandatory) { e.preventDefault(); finish(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, back, finish, mandatory]);

  if (!step) return null;

  /* --- where the card goes --- */
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let cardStyle;
  let arrow = null;

  if (!rect) {
    cardStyle = { left: Math.max(GUTTER, (vw - CARD_W) / 2), top: Math.max(GUTTER, vh * 0.28) };
  } else {
    const below = rect.bottom + 14;
    const spaceBelow = vh - rect.bottom;
    const placeBelow = spaceBelow > 240 || rect.top < 240;
    const top = placeBelow ? below : Math.max(GUTTER, rect.top - 14 - 200);
    let left = rect.left + rect.width / 2 - CARD_W / 2;
    left = Math.max(GUTTER, Math.min(left, vw - CARD_W - GUTTER));
    cardStyle = { left, top };
    arrow = {
      className: 'tour-arrow ' + (placeBelow ? 'up' : 'down'),
      style: {
        left: Math.max(left + 16, Math.min(rect.left + rect.width / 2 - 8, left + CARD_W - 32)) - left
      }
    };
  }

  const holeStyle = rect ? {
    left: rect.left - PAD,
    top: rect.top - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2
  } : null;

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="App tour">
      {/* Blocks the app underneath so the tour drives the navigation, not stray clicks. */}
      <div className={'tour-backdrop' + (rect ? ' has-hole' : '')} onClick={(e) => e.stopPropagation()} />
      {holeStyle && <div className="tour-hole" style={holeStyle} />}

      <div className="tour-card" style={cardStyle}>
        {arrow && <span className={arrow.className} style={arrow.style} />}
        <div className="tour-step-count">Step {i + 1} of {steps.length}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-body">{step.body}</div>

        <div className="tour-dots">
          {steps.map((s, n) => (
            <span key={s.id} className={'tour-dot' + (n === i ? ' active' : (n < i ? ' done' : ''))} />
          ))}
        </div>

        <div className="tour-actions">
          {!mandatory && (
            <button className="tour-skip" onClick={() => finish(false)}>Close</button>
          )}
          <div className="tour-actions-right">
            {i > 0 && <button className="btn btn-secondary btn-sm" onClick={back}>← Back</button>}
            <button className="btn btn-primary btn-sm" onClick={next}>
              {last ? 'Finish' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
