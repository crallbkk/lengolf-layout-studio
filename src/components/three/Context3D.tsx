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
const BACKDROP_BASE = -5.5;

/**
 * Unit 1225 is on the L2 podium, so the landscaped plaza in the photograph is a
 * storey DOWN, not level with the floor. The first version put a 21 m deck at
 * floor level right outside the glass, which is what produced a grey band
 * across the bottom of every window: a slab at eye-ish level occludes
 * everything beyond it. What is actually out there is a narrow terrace, a
 * parapet, and then a drop.
 */
const PLAZA_DROP = -5.5;

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

      {/* No terrace slab at floor level either.
   *
   * 1225 is on the L2 podium, so there is no ground immediately outside the
   * glass to stand on — you look DOWN onto the plaza. A slab at floor level
   * filled the bottom half of every window with flat grey, which is exactly
   * what it would do: a horizontal plane at eye-adjacent height, seen almost
   * edge on, occludes everything past it. */}

      {/* No parapet. The site photographs do show one — the pale pink planter
          band — but a metre of solid wall two metres outside the glass crops
          the plaza out of the view from any standing eye inside, and the view
          is the reason the backdrop exists. Losing accuracy at the sill to keep
          the outlook is the right trade for a study model. */}

      {/* The plaza, a storey down.
   *
   * Green, not grey. A flat neutral plane here is what people kept reading as
   * "a grey area outside the window": below the horizon the billboard runs out
   * and this plane takes over, so whatever colour it is IS the view. The plaza
   * in the photograph is landscaped and tree-covered, so the ground under the
   * billboard has to carry on looking like that. */}
      <mesh position={[B.cx, PLAZA_DROP, -60]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[220, 130]} />
        <meshStandardMaterial color="#7f9268" roughness={1} />
      </mesh>
    </group>
  );
}
