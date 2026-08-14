'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { resetWalkInput, setWalkInput } from './walkInput';

/**
 * Virtual thumbstick for walk mode.
 *
 * Walk mode is drag-to-look plus WASD. A phone has the first and not the
 * second, so before this the mode was a cul-de-sac: you could turn on the spot
 * inside the unit and never take a step. The stick supplies the missing half.
 *
 * Left stick to move, rest of the screen to look, which is the arrangement
 * every phone user has already learnt somewhere else. It sits outside the
 * WebGL canvas in the DOM, so the canvas's own drag-to-look listener never sees
 * these pointers — no coordination needed between the two.
 */

const RADIUS = 56;
const KNOB = 44;
/** Below this the finger is basically still; treat it as neutral. */
const DEADZONE = 0.16;

export default function WalkStick() {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const activeId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  // Releasing the stick while unmounting (leaving walk mode, switching to plan)
  // would otherwise leave the last deflection latched and the camera gliding.
  useEffect(() => resetWalkInput, []);

  const apply = useCallback((dx: number, dy: number) => {
    const dist = Math.hypot(dx, dy);
    const clamped = dist > RADIUS ? RADIUS / dist : 1;
    const kx = dx * clamped;
    const ky = dy * clamped;
    setKnob({ x: kx, y: ky });

    const nx = kx / RADIUS;
    const ny = ky / RADIUS;
    const mag = Math.hypot(nx, ny);
    if (mag < DEADZONE) {
      resetWalkInput();
      return;
    }
    // Rescale the surviving range back to 0..1 so speed ramps up from the
    // deadzone edge. Passing the raw magnitude through would step straight from
    // stationary to 16% of walking speed the moment the threshold is crossed.
    const ramp = (mag - DEADZONE) / (1 - DEADZONE) / mag;
    // Screen y grows downward; pushing the stick up must walk forward.
    setWalkInput(-ny * ramp, nx * ramp);
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeId.current !== null) return;
      activeId.current = e.pointerId;
      const r = e.currentTarget.getBoundingClientRect();
      origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      e.currentTarget.setPointerCapture(e.pointerId);
      apply(e.clientX - origin.current.x, e.clientY - origin.current.y);
    },
    [apply],
  );

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeId.current !== e.pointerId) return;
      apply(e.clientX - origin.current.x, e.clientY - origin.current.y);
    },
    [apply],
  );

  const onUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setKnob(null);
    resetWalkInput();
  }, []);

  return (
    <div
      className="pointer-events-auto absolute left-3 z-20 md:hidden"
      style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 0.5rem) + 4.5rem)' }}
    >
      {/* `group`, not `application`: application tells a screen reader to stop
          intercepting keys, which only makes sense for something focusable that
          handles them. This is a pointer-only control, and the keyboard route
          to the same thing (W A S D) is always available. */}
      <div
        role="group"
        aria-label="Walk stick — drag to move through the model. W A S D also walks."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          width: RADIUS * 2,
          height: RADIUS * 2,
          touchAction: 'none',
        }}
        className="relative rounded-full border border-slate-400/70 bg-white/40 backdrop-blur-sm"
      >
        <div
          aria-hidden="true"
          style={{
            width: KNOB,
            height: KNOB,
            transform: `translate(-50%, -50%) translate(${knob?.x ?? 0}px, ${knob?.y ?? 0}px)`,
            transition: knob ? 'none' : 'transform 140ms ease',
          }}
          className="absolute left-1/2 top-1/2 rounded-full border border-slate-500/60 bg-white/85 shadow"
        />
      </div>
    </div>
  );
}
