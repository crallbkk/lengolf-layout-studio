'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

import { COLUMNS, FIXED_OBSTACLES } from '@/lib/floorplan';
import { BEAM_LINES, beamFootprint, type Structure } from '@/lib/volume';
import { floorGeometry, wallPanels } from './shellGeometry';

/**
 * The raw shell: floor, walls, columns, downstand beams, slab.
 *
 * Materials stay deliberately plain. This is a massing model whose job is to be
 * measured against, so the concrete reads as concrete and nothing is dressed
 * up to look like a finished venue — that is what the photoreal renders are
 * for, and confusing the two is how a study drawing gets mistaken for a design.
 */

const WALL_THICKNESS = 0.15;

const CONCRETE = '#b9b6ae';
const BLOCKWORK = '#d7d4cc';
const SLAB = '#a9a69f';
const GLASS = '#9fc4d8';

export default function Shell3D({
  structure,
  showCeiling,
  showBeams,
}: {
  structure: Structure;
  showCeiling: boolean;
  showBeams: boolean;
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
          color="#e8e6e1"
          side={THREE.DoubleSide}
          roughness={0.95}
        />
      </mesh>

      {/* Walls. Glazing runs the full storey height; solid walls stop at the
          beam soffit, which is what the site photographs actually show — the
          blockwork dies into the downstand rather than the slab. */}
      {panels.map((p) => {
        const glazed = p.kind !== 'solid';
        const height = glazed ? structure.slabSoffitM : structure.beamSoffitM;
        return (
          <mesh
            key={p.id}
            position={[p.mid.x, height / 2, p.mid.y]}
            rotation={[0, p.yaw, 0]}
          >
            <boxGeometry args={[p.length, height, WALL_THICKNESS]} />
            <meshStandardMaterial
              color={
                p.kind === 'solid'
                  ? BLOCKWORK
                  : p.kind === 'shopfront'
                    ? '#cfd8cf'
                    : GLASS
              }
              transparent={glazed}
              opacity={p.kind === 'glazing' ? 0.22 : p.kind === 'shopfront' ? 0.3 : 1}
              roughness={glazed ? 0.1 : 0.9}
              metalness={glazed ? 0.1 : 0}
            />
          </mesh>
        );
      })}

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
          <meshStandardMaterial color={CONCRETE} roughness={0.9} />
        </mesh>
      ))}

      {/* Riser / shaft enclosures — fixed, and objects may not overlap them. */}
      {FIXED_OBSTACLES.map((o) => (
        <mesh
          key={o.id}
          position={[o.x + o.w / 2, structure.beamSoffitM / 2, o.y + o.d / 2]}
        >
          <boxGeometry args={[o.w, structure.beamSoffitM, o.d]} />
          <meshStandardMaterial color="#c3bfb6" roughness={0.9} />
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
                <meshStandardMaterial color={SLAB} roughness={0.95} />
              </mesh>
            );
          })
        : null}

      {/* Slab soffit. Off by default in orbit, where it would simply be a lid
          over the whole model. */}
      {showCeiling ? (
        <mesh geometry={floor} position={[0, structure.slabSoffitM, 0]}>
          <meshStandardMaterial
            color={SLAB}
            side={THREE.DoubleSide}
            roughness={1}
          />
        </mesh>
      ) : null}
    </group>
  );
}
