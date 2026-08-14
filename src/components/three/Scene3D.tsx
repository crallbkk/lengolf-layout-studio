'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';

import Context3D from './Context3D';

import type { PlacedObject } from '@/lib/types';
import {
  swingClearances,
  type ClearanceResult,
  type Structure,
} from '@/lib/volume';
import Objects3D from './Objects3D';
import Shell3D from './Shell3D';
import WalkControls from './WalkControls';
import type { CameraView } from './cameraViews';
import { PALETTES, type PaletteMode } from './palette';
import type { CameraMode } from '@/store/useViewStore';

/**
 * The 3D scene.
 *
 * Everything it draws is derived from the same store the 2D canvas reads, so
 * there is no second copy of the layout to drift out of sync — move a bay in
 * plan and it has already moved here.
 */

/**
 * Applies a viewpoint in ORBIT mode only. Walk mode owns its camera outright
 * and takes the viewpoint through its own props; see WalkControls.
 */
function ApplyOrbitView({ view, nonce }: { view: CameraView; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;

  useEffect(() => {
    camera.position.set(...view.position);
    if (controls) {
      controls.target.set(...view.target);
      controls.update();
    } else {
      camera.lookAt(new THREE.Vector3(...view.target));
    }
    // `nonce` is what makes re-picking the same preset work: the view object is
    // identical, so without it React would see no change.
  }, [camera, controls, view, nonce]);

  return null;
}

export interface Scene3DProps {
  objects: PlacedObject[];
  selectedIds: string[];
  structure: Structure;
  cameraMode: CameraMode;
  showCeiling: boolean;
  showBeams: boolean;
  showFigures: boolean;
  showLabels: boolean;
  paletteMode: PaletteMode;
  view: CameraView;
  viewNonce: number;
  onSelect: (id: string, additive: boolean) => void;
  onBackgroundClick: () => void;
  onClearances: (results: ClearanceResult[]) => void;
}

export default function Scene3D({
  objects,
  selectedIds,
  structure,
  cameraMode,
  showCeiling,
  showBeams,
  showFigures,
  showLabels,
  paletteMode,
  view,
  viewNonce,
  onSelect,
  onBackgroundClick,
  onClearances,
}: Scene3DProps) {
  const palette = PALETTES[paletteMode];

  const clearances = useMemo(
    () => swingClearances(objects, structure),
    [objects, structure],
  );
  const byId = useMemo(
    () => new Map(clearances.map((c) => [c.objectId, c])),
    [clearances],
  );

  useEffect(() => {
    onClearances(clearances);
  }, [clearances, onClearances]);

  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ fov: 55, near: 0.1, far: 400, position: view.position }}
      onPointerMissed={onBackgroundClick}
      // preserveDrawingBuffer keeps the framebuffer readable after the frame is
      // presented, which is what lets the view be exported as a PNG. It costs a
      // little memory bandwidth and buys the whole reason this view is worth
      // building: frame a shot here, and the photoreal render made from it is
      // of the layout as drawn rather than one the image model invented.
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.background, 60, 160]} />

      {/* The outlook is a photograph, so it must not block the first frame if
          it is slow or missing. */}
      <Suspense fallback={null}>
        <Context3D />
      </Suspense>

      {/* Schematic light is flat and even on purpose: a study model should not
          have mood lighting, because shadow reads as design intent and there is
          none here to communicate. The finished palette turns it down to the
          low, warm, pooled light the concept actually calls for, and lets the
          bay screens and coves do the work. */}
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, palette.hemi]} />
      <ambientLight intensity={palette.ambient} />
      <directionalLight position={[18, 26, -12]} intensity={palette.key} />
      <directionalLight position={[-14, 18, 22]} intensity={palette.fill} />

      <Shell3D
        structure={structure}
        showCeiling={showCeiling}
        showBeams={showBeams}
        palette={palette}
      />
      <Objects3D
        objects={objects}
        selectedIds={selectedIds}
        structure={structure}
        clearances={byId}
        showLabels={showLabels}
        showFigures={showFigures}
        palette={palette}
        onSelect={onSelect}
      />

      {cameraMode === 'orbit' ? (
        <>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.02}
            minDistance={2}
            maxDistance={140}
          />
          <ApplyOrbitView view={view} nonce={viewNonce} />
        </>
      ) : (
        <WalkControls view={view} nonce={viewNonce} />
      )}
    </Canvas>
  );
}
