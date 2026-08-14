'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

import { COLUMNS, FIXED_OBSTACLES } from '@/lib/floorplan';
import { BEAM_LINES, beamFootprint, type Structure } from '@/lib/volume';
import { floorGeometry, wallPanels } from './shellGeometry';
import type { Palette } from './palette';

/**
 * The raw shell: floor, walls, columns, downstand beams, slab.
 *
 * Materials stay deliberately plain. This is a massing model whose job is to be
 * measured against, so the concrete reads as concrete and nothing is dressed
 * up to look like a finished venue — that is what the photoreal renders are
 * for, and confusing the two is how a study drawing gets mistaken for a design.
 */

const WALL_THICKNESS = 0.15;

const GLASS = '#cfe0e4';

/** Curtain wall module. The site photographs read at roughly this spacing. */
const MULLION_SPACING_M = 2.7;
const MULLION_W = 0.07;
const FRAME_D = 0.1;

/**
 * A glazed run, built as curtain wall rather than a tinted slab.
 *
 * The first version was one translucent box per run, which from inside read as
 * milky perspex and hid the single best thing about this unit — that you can
 * see the plaza through it. In the site photographs the glass is essentially
 * clear and what you actually read is the frame: slim dark mullions on a
 * regular module, a transom, and a head. So the glass goes nearly transparent
 * and the frame does the drawing.
 */
function GlazedWall({
  panel: p,
  height,
  frame,
}: {
  panel: ReturnType<typeof wallPanels>[number];
  height: number;
  frame: string;
}) {
  // Divide the run into whole modules so mullions land symmetrically rather
  // than leaving a sliver at one end.
  const bays = Math.max(1, Math.round(p.length / MULLION_SPACING_M));
  const step = p.length / bays;
  const transomY = height * 0.62;

  /**
   * The curved corner arrives here as ~20 tessellated segments a few
   * centimetres long. Framing each one puts a 70 mm mullion at both ends of a
   * 60 mm panel, and the whole curve renders as a solid black post. Short
   * segments therefore get glass and horizontals only, which is also how the
   * corner reads on site: continuous curved glazing, not a row of frames.
   */
  const framed = p.length >= 1;

  return (
    <group position={[p.mid.x, 0, p.mid.y]} rotation={[0, p.yaw, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[p.length, height, 0.03]} />
        <meshPhysicalMaterial
          color={GLASS}
          transparent
          opacity={0.13}
          roughness={0.04}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Head and sill. */}
      {[height - 0.05, 0.05].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[p.length, 0.1, FRAME_D]} />
          <meshStandardMaterial color={frame} roughness={0.6} metalness={0.2} />
        </mesh>
      ))}

      {/* Transom. */}
      <mesh position={[0, transomY, 0]}>
        <boxGeometry args={[p.length, 0.06, FRAME_D * 0.9]} />
        <meshStandardMaterial color={frame} roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Mullions, including both ends. */}
      {framed
        ? Array.from({ length: bays + 1 }, (_, i) => (
            <mesh key={i} position={[-p.length / 2 + i * step, height / 2, 0]}>
              <boxGeometry args={[MULLION_W, height, FRAME_D]} />
              <meshStandardMaterial
                color={frame}
                roughness={0.6}
                metalness={0.2}
              />
            </mesh>
          ))
        : null}
    </group>
  );
}

export default function Shell3D({
  structure,
  showCeiling,
  showBeams,
  palette,
}: {
  structure: Structure;
  showCeiling: boolean;
  showBeams: boolean;
  palette: Palette;
}) {
  const floor = useMemo(() => floorGeometry(), []);
  const panels = useMemo(() => wallPanels(), []);

  const beamDepth = Math.max(0, structure.slabSoffitM - structure.beamSoffitM);

  return (
    <group>
      {/* Floor. DoubleSide because the shape's winding is inherited from the
          traced plan and is not worth normalising just to save one face. */}
      <mesh geometry={floor} receiveShadow>
        <meshStandardMaterial
          color={palette.floor}
          side={THREE.DoubleSide}
          roughness={0.95}
        />
      </mesh>

      {/* Walls. Glazing runs the full storey height; solid walls stop at the
          beam soffit, which is what the site photographs actually show — the
          blockwork dies into the downstand rather than the slab. */}
      {panels.map((p) =>
        p.kind === 'solid' ? (
          <mesh
            key={p.id}
            position={[p.mid.x, structure.beamSoffitM / 2, p.mid.y]}
            rotation={[0, p.yaw, 0]}
          >
            <boxGeometry
              args={[p.length, structure.beamSoffitM, WALL_THICKNESS]}
            />
            <meshStandardMaterial color={palette.blockwork} roughness={0.9} />
          </mesh>
        ) : (
          <GlazedWall
            key={p.id}
            panel={p}
            height={structure.slabSoffitM}
            frame={palette.glazingFrame}
          />
        ),
      )}

      {/* Structural columns, full height to the slab. */}
      {COLUMNS.map((c) => (
        <mesh
          key={c.id}
          position={[c.center.x, structure.slabSoffitM / 2, c.center.y]}
        >
          {c.shape === 'circle' ? (
            <cylinderGeometry
              args={[c.size / 2, c.size / 2, structure.slabSoffitM, 24]}
            />
          ) : (
            <boxGeometry args={[c.size, structure.slabSoffitM, c.size]} />
          )}
          <meshStandardMaterial color={palette.column} roughness={0.9} />
        </mesh>
      ))}

      {/* Riser / shaft enclosures — fixed, and objects may not overlap them. */}
      {FIXED_OBSTACLES.map((o) => (
        <mesh
          key={o.id}
          position={[o.x + o.w / 2, structure.beamSoffitM / 2, o.y + o.d / 2]}
        >
          <boxGeometry args={[o.w, structure.beamSoffitM, o.d]} />
          <meshStandardMaterial color={palette.blockwork} roughness={0.9} />
        </mesh>
      ))}

      {/* Downstand beams. Inferred from the column grid, not drawn by the
          landlord — but they are the constraint that decides whether a swing
          fits, so hiding them would defeat the purpose of the view. */}
      {showBeams && beamDepth > 0
        ? BEAM_LINES.map((b) => {
            const f = beamFootprint(b, structure.beamWidthM);
            const w = f.maxX - f.minX;
            const d = f.maxY - f.minY;
            return (
              <mesh
                key={b.id}
                position={[
                  f.minX + w / 2,
                  structure.beamSoffitM + beamDepth / 2,
                  f.minY + d / 2,
                ]}
              >
                <boxGeometry args={[w, beamDepth, d]} />
                <meshStandardMaterial color={palette.beam} roughness={0.95} />
              </mesh>
            );
          })
        : null}

      {/* Slab soffit. Off by default in orbit, where it would simply be a lid
          over the whole model. */}
      {showCeiling ? (
        <mesh geometry={floor} position={[0, structure.slabSoffitM, 0]}>
          <meshStandardMaterial
            color={palette.soffit}
            side={THREE.DoubleSide}
            roughness={1}
          />
        </mesh>
      ) : null}
    </group>
  );
}
