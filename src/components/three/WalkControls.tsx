'use client';

import { useFrame, useStore } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import type { CameraView } from './cameraViews';
import { resetWalkInput, walkInput } from './walkInput';

/**
 * First-person controls: drag to look, WASD to walk.
 *
 * Deliberately NOT pointer lock. Pointer lock is the conventional choice, but
 * it hijacks the cursor for a tool whose 3D view is one panel among several,
 * and the escape gesture is a surprise every single time. Drag-to-look costs
 * nothing and never traps anyone.
 *
 * Camera and canvas are reached through the r3f store rather than `useThree`
 * selectors. Driving a camera IS mutation of renderer state, which the React
 * Compiler's immutability rule correctly forbids for values returned from
 * hooks; going through the store keeps that rule honest instead of suppressing
 * it, and `useFrame`'s own `state` argument is a plain parameter.
 */

const EYE_HEIGHT = 1.65;
const LOOK_SPEED = 0.0026;
const WALK_SPEED = 3.2;
const PITCH_LIMIT = 1.2;

export default function WalkControls({
  view,
  nonce,
  eyeHeight = EYE_HEIGHT,
}: {
  view: CameraView;
  nonce: number;
  eyeHeight?: number;
}) {
  const store = useStore();

  const yaw = useRef(0);
  const pitch = useRef(0);
  /** Pointer that owns the look drag, or null. See the note in the effect. */
  const lookPointer = useRef<number | null>(null);
  /** Its last position; deltas are measured from this. */
  const lastLook = useRef({ x: 0, y: 0 });
  const keys = useRef<Set<string>>(new Set());
  /**
   * Which viewpoint has been applied. Walk mode owns the camera outright — it
   * rewrites the quaternion every frame from yaw/pitch — so a preset cannot be
   * applied by setting `camera.lookAt` from outside; the next frame would
   * simply overwrite it with the stale angles. The preset has to land in
   * yaw/pitch instead, which is what this tracks.
   */
  const applied = useRef(-1);

  useEffect(() => {
    const el = store.getState().gl.domElement;

    /**
     * The thumbstick zeroes this on its own unmount, and today it always
     * unmounts alongside these controls. But this component is the only reader
     * of walkInput, and it should not depend on a component it does not own to
     * hand it a sane starting value — a stale deflection here means a camera
     * that drifts forever with nothing touching it.
     */
    resetWalkInput();

    /**
     * One pointer owns the look drag, and every later event is matched against
     * its id.
     *
     * Without that, a second finger — and pinch is the reflex gesture on a 3D
     * view, which the orbit-mode hint even advertises — overwrote the reference
     * position, so the next 3 px move of the FIRST finger was measured against
     * the second finger's coordinates and snapped the camera through tens of
     * degrees in one frame. Lifting either finger then ended the drag for both.
     * This was latent while deltas came from `movementX` (always 0 on touch);
     * measuring from clientX is what made it reachable.
     */
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || lookPointer.current !== null) return;
      lookPointer.current = e.pointerId;
      lastLook.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    /**
     * Deltas are measured from the previous client position rather than read
     * from `movementX` / `movementY`. Those are populated for mouse but are
     * flatly 0 for touch pointers in Safari, so on an iPhone the look drag did
     * nothing at all — and walk mode with neither looking nor walking is just a
     * frozen photograph. Without pointer lock the two are equivalent for a
     * mouse, so this costs desktop nothing.
     */
    const onPointerMove = (e: PointerEvent) => {
      if (lookPointer.current !== e.pointerId) return;
      const dx = e.clientX - lastLook.current.x;
      const dy = e.clientY - lastLook.current.y;
      lastLook.current = { x: e.clientX, y: e.clientY };
      yaw.current -= dx * LOOK_SPEED;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - dy * LOOK_SPEED,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    };
    const endDrag = (e: PointerEvent) => {
      if (lookPointer.current !== e.pointerId) return;
      lookPointer.current = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = 'grab';
    };

    // Keys are captured on the window so walking works without first clicking
    // the canvas, but never while the user is typing into a field.
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      keys.current.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const onBlur = () => keys.current.clear();

    el.style.cursor = 'grab';
    // OrbitControls sets this for itself while it is mounted; walk mode has to
    // do it by hand, or a look drag on touch is also a page gesture.
    const prevTouchAction = el.style.touchAction;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      el.style.cursor = '';
      el.style.touchAction = prevTouchAction;
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [store]);

  useFrame((state, delta) => {
    const camera = state.camera;

    if (applied.current !== nonce) {
      applied.current = nonce;
      camera.position.set(view.position[0], eyeHeight, view.position[2]);
      const dx = view.target[0] - view.position[0];
      const dy = view.target[1] - eyeHeight;
      const dz = view.target[2] - view.position[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      // Three's camera looks down its local -z, so with a YXZ euler the
      // forward vector is (-sin y * cos x, sin x, -cos y * cos x). Inverting
      // that is what turns a look-at target into the angles walk mode holds.
      yaw.current = Math.atan2(-dx, -dz);
      pitch.current = THREE.MathUtils.clamp(
        Math.asin(dy / len),
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    }

    camera.quaternion.setFromEuler(
      new THREE.Euler(pitch.current, yaw.current, 0, 'YXZ'),
    );

    /**
     * Keyboard and thumbstick land on the same two scalars, so there is exactly
     * one movement path for both. Anything that changes how walking feels —
     * speed, the horizontal-plane constraint below — changes for both at once
     * and the touch behaviour cannot quietly drift from the desktop one.
     *
     * Clamped because a held key and a pushed stick can be additive, and 2.0
     * forward would double the walk speed for no reason the user asked for.
     */
    const k = keys.current;
    const clamp1 = (n: number) => THREE.MathUtils.clamp(n, -1, 1);
    const forward = clamp1(
      (k.has('w') || k.has('arrowup') ? 1 : 0) -
        (k.has('s') || k.has('arrowdown') ? 1 : 0) +
        walkInput.forward,
    );
    const strafe = clamp1(
      (k.has('d') || k.has('arrowright') ? 1 : 0) -
        (k.has('a') || k.has('arrowleft') ? 1 : 0) +
        walkInput.strafe,
    );

    if (forward !== 0 || strafe !== 0) {
      const speed = WALK_SPEED * (k.has('shift') ? 2.2 : 1) * delta;
      // Movement stays in the horizontal plane regardless of where the head is
      // pointed, which is what makes looking up while walking feel normal.
      camera.position.addScaledVector(
        new THREE.Vector3(Math.sin(yaw.current), 0, Math.cos(yaw.current)),
        -forward * speed,
      );
      camera.position.addScaledVector(
        new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current)),
        strafe * speed,
      );
    }

    camera.position.y = eyeHeight;
  });

  return null;
}
