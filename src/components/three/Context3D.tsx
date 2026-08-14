'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { shellBounds } from '@/lib/volume';

/**
 * What you see through the glass.
 *
 * Without this the glazing looks out onto flat background colour, which throws
 * away the single best thing about the unit: the plaza frontage. The backdrop
 * is a photograph taken from inside 1225 looking out, so the view through the
 * window is the actual view from the window rather than an invented skyline.
 *
 * It is a flat billboard, not geometry, and it is not to scale. That is fine —
 * nobody measures a view — but it is the reason this lives in a "context"
 * layer that can be switched off rather than in the shell.
 */

const B = shellBounds();

/** Metres. Aspect matches the source crop so the towers are not stretched. */
const BACKDROP_W = 46;
const BACKDROP_H = 31;
/** North of the glazing line, which sits at y = 0 in model space. */
const BACKDROP_Z = -21;
/**
 * The plaza is at the very bottom of the source crop, so the bottom edge of
 * the billboard has to sit at about deck level. Sinking it lower — the first
 * attempt put it eight metres down — hides the trees and the street below the
 * floor and leaves the bottom half of every window showing bare deck.
 */
const BACKDROP_BASE = -1.2;

export default function Context3D() {
  /**
   * Loaded here rather than through drei's `useTexture` so the colour space is
   * set on a texture this component owns. Mutating a value a hook handed back
   * is exactly what the compiler's immutability rule exists to stop, and it is
   * right to stop it.
   */
  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load('/plaza-outlook.jpg');
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group>
      <mesh position={[B.cx - 2, BACKDROP_BASE + BACKDROP_H / 2, BACKDROP_Z]}>
        <planeGeometry args={[BACKDROP_W, BACKDROP_H]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {/* Podium deck outside the glazing, so the unit does not read as
          floating in a void when the camera swings round to the north. It only
          needs to bridge the strip between the glass and the billboard. */}
      <mesh position={[B.cx, -0.06, BACKDROP_Z / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, Math.abs(BACKDROP_Z)]} />
        <meshStandardMaterial color="#b9b8b0" roughness={1} />
      </mesh>
    </group>
  );
}
