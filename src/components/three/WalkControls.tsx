'use client';

import { useFrame, useStore } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import type { CameraView } from './cameraViews';

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
  const dragging = useRef(false);
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

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging.current = true;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      yaw.current -= e.movementX * LOOK_SPEED;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - e.movementY * LOOK_SPEED,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    };
    const endDrag = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
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
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      el.style.cursor = '';
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

    const k = keys.current;
    const forward =
      (k.has('w') || k.has('arrowup') ? 1 : 0) -
      (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const strafe =
      (k.has('d') || k.has('arrowright') ? 1 : 0) -
      (k.has('a') || k.has('arrowleft') ? 1 : 0);

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
