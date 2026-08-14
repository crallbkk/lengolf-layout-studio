'use client';

import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

import { CATALOG, isBay } from '@/lib/catalog';
import type { PlacedObject } from '@/lib/types';
import {
  VOLUMES,
  bayZones,
  solidDividers,
  SCREEN_FRAME_M,
  COLUMN_PROJECTION_M,
  type ClearanceResult,
  type Structure,
} from '@/lib/volume';
import { planAngleToYaw } from './shellGeometry';
import type { Palette } from './palette';

/**
 * Placed objects, extruded.
 *
 * Colours come straight from the 2D catalog so that a bay is the same green in
 * both views. Resisting the urge to render brand materials here is deliberate:
 * the moment this looks like a visualisation, people stop reading it as a
 * study.
 */

const PANEL = 0.12;
const BENCH_H = 0.45;
const FIGURE_H = 1.7;
/** Share of the enclosure depth where the divider runs full height. */
const REAR_FRACTION = 0.62;
const DIVIDER_FRONT_H = 1.35;
const HEADER_H = 0.45;

function darken(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return `#${c.getHexString()}`;
}

interface Props {
  objects: PlacedObject[];
  selectedIds: string[];
  structure: Structure;
  clearances: Map<string, ClearanceResult>;
  showLabels: boolean;
  showFigures: boolean;
  palette: Palette;
  onSelect: (id: string, additive: boolean) => void;
}

export default function Objects3D({
  objects,
  selectedIds,
  structure,
  clearances,
  showLabels,
  showFigures,
  palette,
  onSelect,
}: Props) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <group>
      {objects.map((o) => (
        <ObjectMesh
          key={o.id}
          object={o}
          selected={selected.has(o.id)}
          structure={structure}
          clearance={clearances.get(o.id)}
          solidSides={solidDividers(o, objects)}
          palette={palette}
          showLabel={showLabels}
          showFigure={showFigures}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

/**
 * A zone that is a change of surface rather than a built thing.
 *
 * Extruding these by their real thickness — 40 mm of turf, 20 mm of tile — is
 * honest and useless: at eye level they vanish, which is exactly what happened
 * the first time and the reason the putting green could not be found in the
 * model. So the surface stays at its true height and the zone is made legible
 * by what stands ON it, which is also what makes it legible on site.
 */
function FloorFinish({
  object: o,
  spec,
  height,
  palette,
}: {
  object: PlacedObject;
  spec: (typeof CATALOG)[keyof typeof CATALOG];
  height: number;
  palette: Palette;
}) {
  const green = o.type === 'putting-green';
  const lounge = o.type === 'lounge';

  // Furniture standing on the zone, which is what makes a floor finish legible
  // at eye level: a bare slab reads as empty floor from the plaza.
  const spots: Array<[number, number]> = [];
  if (!green) {
    const step = lounge ? 3 : 2.4;
    const cols = Math.max(1, Math.floor((o.w - 1) / step));
    const rows = Math.max(1, Math.floor((o.d - 1) / step));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        spots.push([
          -o.w / 2 + (o.w / cols) * (i + 0.5),
          -o.d / 2 + (o.d / rows) * (j + 0.5),
        ]);
      }
    }
  }

  return (
    <>
      <mesh position={[0, height / 2, 0]} receiveShadow>
        <boxGeometry args={[o.w, height, o.d]} />
        <meshStandardMaterial
          color={
            green
              ? palette.turf
              : palette.useCatalogColours
                ? spec.fill
                : palette.floor
          }
          roughness={1}
        />
      </mesh>

      {/* A rim, so the zone still reads as an edge from a standing eye. Drawn
          only in schematic: against brand materials a bright catalog-coloured
          outline on the floor reads as a stray line, not as a zone edge. */}
      {palette.useCatalogColours ? (
        <lineSegments position={[0, height + 0.005, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(o.w, 0.001, o.d)]} />
          <lineBasicMaterial color={spec.stroke} />
        </lineSegments>
      ) : null}

      {green ? (
        <group position={[o.w / 2 - 1.1, 0, 0]}>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.7, 6]} />
            <meshStandardMaterial color="#2c2c2c" />
          </mesh>
          <mesh position={[0.13, 0.62, 0]}>
            <boxGeometry args={[0.26, 0.16, 0.01]} />
            <meshStandardMaterial color={palette.brass} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ) : (
        spots.map(([x, z], i) =>
          lounge ? (
            // Low seating: an armchair pair and a table top, all well under
            // sitting-eye height so the glazing behind stays open.
            <group key={i} position={[x, 0, z]}>
              {[-0.62, 0.62].map((dx) => (
                <group key={dx} position={[dx, 0, 0]}>
                  <mesh position={[0, 0.2, 0]}>
                    <boxGeometry args={[0.78, 0.4, 0.78]} />
                    <meshStandardMaterial color={palette.upholstery} roughness={0.95} />
                  </mesh>
                  <mesh position={[0, 0.5, -0.3]}>
                    <boxGeometry args={[0.78, 0.4, 0.18]} />
                    <meshStandardMaterial color={palette.upholstery} roughness={0.95} />
                  </mesh>
                </group>
              ))}
              <mesh position={[0, 0.42, 0]}>
                <cylinderGeometry args={[0.28, 0.28, 0.05, 16]} />
                <meshStandardMaterial color={palette.timber} roughness={0.7} />
              </mesh>
            </group>
          ) : (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 0.53, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 1.05, 8]} />
                <meshStandardMaterial color="#3f3f46" />
              </mesh>
              <mesh position={[0, 1.06, 0]}>
                <cylinderGeometry args={[0.32, 0.32, 0.04, 16]} />
                <meshStandardMaterial color={palette.timber} roughness={0.7} />
              </mesh>
            </group>
          ),
        )
      )}
    </>
  );
}

/**
 * An operable partition.
 *
 * Drawn as discrete panels with visible joints and a head track rather than as
 * one slab, because the whole point of the thing is that it stacks away. A
 * solid box here would read as a permanent wall and quietly turn a flexible
 * east end into a walled-off one.
 */
function MovableWall({
  object: o,
  height,
  spec,
  palette,
}: {
  object: PlacedObject;
  height: number;
  spec: (typeof CATALOG)[keyof typeof CATALOG];
  palette: Palette;
}) {
  // Panels run along the wall's long axis, whichever that is.
  const alongX = o.w >= o.d;
  const run = alongX ? o.w : o.d;
  const thickness = alongX ? o.d : o.w;
  const count = Math.max(1, Math.round(run / 1.05));
  const panel = run / count;
  const JOINT = 0.02;

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const offset = -run / 2 + panel * (i + 0.5);
        return (
          <mesh
            key={i}
            position={[
              alongX ? offset : 0,
              height / 2,
              alongX ? 0 : offset,
            ]}
          >
            <boxGeometry
              args={
                alongX
                  ? [panel - JOINT, height, thickness]
                  : [thickness, height, panel - JOINT]
              }
            />
            <meshStandardMaterial
              color={palette.useCatalogColours ? spec.fill : palette.bayPanel}
              roughness={0.75}
              transparent
              opacity={0.88}
            />
          </mesh>
        );
      })}

      {/* Head track: the giveaway that it moves. */}
      <mesh position={[0, height + 0.05, 0]}>
        <boxGeometry
          args={
            alongX
              ? [o.w, 0.1, thickness * 1.4]
              : [thickness * 1.4, 0.1, o.d]
          }
        />
        <meshStandardMaterial
          color={palette.useCatalogColours ? spec.stroke : palette.brass}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>
    </>
  );
}

/**
 * The cart emerging from the pillar.
 *
 * Modelled at floor level with its front wheels on the green, per David's
 * direction — not mounted up the column, which is the version everyone
 * pictures first and which reads as a crash rather than a piece.
 */
function CartFeature({ object: o }: { object: PlacedObject }) {
  const bodyH = 0.62;
  const wheel = 0.28;
  const roofH = 1.78;
  const bodyW = Math.min(o.d, 1.25);

  return (
    <group>
      {/* Body, nose pointing away from the column (local +x). */}
      <mesh position={[0.1, wheel + bodyH / 2, 0]} castShadow>
        <boxGeometry args={[o.w * 0.82, bodyH, bodyW]} />
        <meshStandardMaterial color="#f2f2ef" roughness={0.6} />
      </mesh>
      {/* Seat back. */}
      <mesh position={[-o.w * 0.28, wheel + bodyH + 0.28, 0]}>
        <boxGeometry args={[0.12, 0.56, bodyW * 0.92]} />
        <meshStandardMaterial color="#e6e6e2" roughness={0.7} />
      </mesh>
      {/* Canopy on posts. */}
      <mesh position={[0.05, roofH, 0]}>
        <boxGeometry args={[o.w * 0.78, 0.07, bodyW * 1.02]} />
        <meshStandardMaterial color="#f2f2ef" roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[-o.w * 0.3, (wheel + bodyH + roofH) / 2, s * bodyW * 0.44]}
        >
          <cylinderGeometry args={[0.035, 0.035, roofH - wheel - bodyH, 6]} />
          <meshStandardMaterial color="#d8d8d4" />
        </mesh>
      ))}
      {/* Wheels: front pair clear of the column, rear pair still inside it. */}
      {[
        [o.w * 0.3, -1],
        [o.w * 0.3, 1],
        [-o.w * 0.3, -1],
        [-o.w * 0.3, 1],
      ].map(([x, s], i) => (
        <mesh
          key={i}
          position={[x, wheel, s * bodyW * 0.5]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[wheel, wheel, 0.12, 14]} />
          <meshStandardMaterial color="#2f2f2f" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function ObjectMesh({
  object: o,
  selected,
  structure,
  clearance,
  solidSides: worldSides,
  palette,
  showLabel,
  showFigure,
  onSelect,
}: {
  object: PlacedObject;
  selected: boolean;
  structure: Structure;
  clearance: ClearanceResult | undefined;
  solidSides: { left: boolean; right: boolean };
  palette: Palette;
  showLabel: boolean;
  showFigure: boolean;
  onSelect: (id: string, additive: boolean) => void;
}) {
  // solidDividers reports world-space faces; a bay turned through 180 degrees
  // has its local -x on the world right.
  const flipped = ((o.rotation % 360) + 360) % 360 === 180;
  const solidSides = flipped
    ? { left: worldSides.right, right: worldSides.left }
    : worldSides;
  const spec = CATALOG[o.type];
  const vol = VOLUMES[o.type];
  const bay = isBay(o.type);

  const platform = bay ? structure.bayPlatformM : 0;
  // A bay enclosure cannot be taller than the lowest soffit anywhere over its
  // footprint. Capping it here rather than warning about it keeps the model
  // physically possible; whether the PLAYER fits is the separate question the
  // clearance panel answers.
  const height = bay
    ? Math.min(
        vol.heightM,
        (clearance?.enclosureCeilingM ?? structure.slabSoffitM) - platform,
      )
    : vol.heightM;

  const zones = bayZones(o);
  const seating = zones.seating;
  const breach = clearance ? !clearance.ok : false;

  const wallColor = breach
    ? '#c2410c'
    : palette.useCatalogColours
      ? darken(spec.stroke, 0.15)
      : palette.bayPanel;

  const handleClick = (e: {
    stopPropagation: () => void;
    shiftKey?: boolean;
    delta?: number;
  }) => {
    /**
     * A mesh onClick fires on pointerup whenever the release ray still hits the
     * object, however far the pointer travelled — r3f only drag-guards
     * onPointerMissed. So orbiting (and in walk mode, every look-around, which
     * starts on geometry) was mutating the selection. `delta` is the pointer
     * travel in pixels, exposed for exactly this.
     */
    if ((e.delta ?? 0) > 2) return;
    e.stopPropagation();
    onSelect(o.id, e.shiftKey === true);
  };

  return (
    <group
      position={[o.cx, 0, o.cy]}
      rotation={[0, planAngleToYaw(o.rotation), 0]}
      onClick={handleClick}
    >
      {bay ? (
        <>
          {/* Raised platform under the enclosure only. In the reference render
              the bench sits down on the tile floor and you step UP into the
              bay, which is also what makes the step read as a threshold. */}
          <mesh position={[0, platform / 2, zones.enclosureCz]} receiveShadow>
            <boxGeometry args={[o.w, platform, zones.enclosureDepth]} />
            <meshStandardMaterial
              color={palette.useCatalogColours ? darken(spec.fill, 0.12) : palette.bayPlatform}
              roughness={0.9}
            />
          </mesh>

          {/* Turf across the whole enclosure floor, not a small mat: both
              reference bays are turfed wall to wall behind the step. */}
          <mesh position={[0, platform + 0.02, zones.enclosureCz]}>
            <boxGeometry
              args={[o.w - 2 * PANEL, 0.04, zones.enclosureDepth - 0.04]}
            />
            <meshStandardMaterial color={palette.turf} roughness={1} />
          </mesh>

          {/* Screen wall: steel frame and padding, filling the setback so the
              assembly stands clear of the columns rather than flush with the
              wall they sit in. Its front face is the screen line. */}
          <mesh
            position={[
              0,
              platform + height / 2,
              zones.screenFaceCz + SCREEN_FRAME_M / 2,
            ]}
          >
            <boxGeometry args={[o.w, height, SCREEN_FRAME_M]} />
            <meshStandardMaterial color={wallColor} roughness={0.9} />
          </mesh>

          {/* The strip behind the frame, where the column sits. Left as dark
              recess rather than solid wall: the frame stands off the column,
              it is not built into it. */}
          <mesh
            position={[
              0,
              platform + height / 2,
              zones.screenFaceCz + SCREEN_FRAME_M + COLUMN_PROJECTION_M / 2,
            ]}
          >
            <boxGeometry args={[o.w, height, COLUMN_PROJECTION_M]} />
            <meshStandardMaterial color={darken(wallColor, 0.4)} roughness={1} />
          </mesh>

          {/* Impact screen — the one thing that should glow. Sits just in
              front of the padding, so the whole assembly clears the pillar. */}
          <mesh
            position={[0, platform + height * 0.46, zones.screenFaceCz - 0.03]}
          >
            <boxGeometry args={[o.w - 0.5, height * 0.62, 0.05]} />
            <meshStandardMaterial
              color="#f4f7f5"
              emissive={palette.screenEmissive}
              emissiveIntensity={palette.screenIntensity}
              roughness={0.6}
            />
          </mesh>

          {/* Dividers: full height at the screen, dropping to shoulder height
              at the front. Straight from ref_bays.jpg — and the reason the bay
              run reads as one room rather than a row of sealed boxes, both on
              site and in this model. */}
          {([-1, 1] as const).map((side) => {
            // Local -x is the bay's left face in plan; see solidDividers.
            const solid = side === -1 ? solidSides.left : solidSides.right;
            return (
              <group key={side} position={[side * (o.w / 2 - PANEL / 2), 0, 0]}>
                <mesh
                  position={[
                    0,
                    platform + height / 2,
                    solid
                      ? zones.enclosureCz
                      : o.d / 2 - zones.enclosureDepth * REAR_FRACTION * 0.5,
                  ]}
                >
                  <boxGeometry
                    args={[
                      PANEL,
                      height,
                      solid
                        ? zones.enclosureDepth
                        : zones.enclosureDepth * REAR_FRACTION,
                    ]}
                  />
                  <meshStandardMaterial color={wallColor} roughness={0.9} />
                </mesh>
                {solid ? null : (
                  <mesh
                    position={[
                      0,
                      platform + DIVIDER_FRONT_H / 2,
                      zones.enclosureCz -
                        zones.enclosureDepth * (1 - REAR_FRACTION) * 0.5,
                    ]}
                  >
                    <boxGeometry
                      args={[
                        PANEL,
                        DIVIDER_FRONT_H,
                        zones.enclosureDepth * (1 - REAR_FRACTION),
                      ]}
                    />
                    <meshStandardMaterial color={wallColor} roughness={0.9} />
                  </mesh>
                )}
              </group>
            );
          })}

          {/* Warm linear cove under the header and a pooled light below it.
              The concept's bay separators are LED strips, and without an
              actual emitter the "warm pooled light" it asks for is just a
              darker room. */}
          {palette.coveIntensity > 0 ? (
            <>
              <mesh
                position={[
                  0,
                  platform + height - HEADER_H,
                  -o.d / 2 + seating + PANEL,
                ]}
              >
                <boxGeometry args={[o.w - 2 * PANEL, 0.06, 0.06]} />
                <meshStandardMaterial
                  color={palette.cove}
                  emissive={palette.cove}
                  emissiveIntensity={palette.coveIntensity}
                  toneMapped={false}
                />
              </mesh>
              <pointLight
                position={[0, platform + height - 0.6, zones.playCz + 0.4]}
                color={palette.cove}
                intensity={9}
                distance={7}
                decay={2}
              />
            </>
          ) : null}

          {/* Header over the opening: the lit frame in the reference render,
              and in practice where the projector and cove lighting hide. */}
          <mesh
            position={[
              0,
              platform + height - HEADER_H / 2,
              -o.d / 2 + seating + PANEL / 2,
            ]}
          >
            <boxGeometry args={[o.w, HEADER_H, PANEL]} />
            <meshStandardMaterial color={wallColor} roughness={0.9} />
          </mesh>

          {/* High table row at the front, turned back into the room. */}
          {seating > 0.4 ? (
            <group position={[0, 0, -o.d / 2 + seating / 2]}>
              {/* Seat. */}
              <mesh position={[0, BENCH_H / 2, 0]}>
                <boxGeometry args={[o.w * 0.78, BENCH_H, 0.55]} />
                <meshStandardMaterial
                  color={
                    palette.useCatalogColours
                      ? darken(spec.stroke, 0.35)
                      : palette.upholstery
                  }
                  roughness={0.85}
                />
              </mesh>
              {/* Back, turned into the room, per every Chidlom bay. */}
              <mesh position={[0, BENCH_H + 0.22, -0.22]}>
                <boxGeometry args={[o.w * 0.78, 0.44, 0.12]} />
                <meshStandardMaterial
                  color={
                    palette.useCatalogColours
                      ? darken(spec.stroke, 0.45)
                      : palette.upholstery
                  }
                  roughness={0.85}
                />
              </mesh>
              {/* Timber armrest table along the back — the detail that makes a
                  LENGOLF bay social rather than a practice booth. */}
              <mesh position={[0, BENCH_H + 0.46, -0.22]}>
                <boxGeometry args={[o.w * 0.82, 0.05, 0.3]} />
                <meshStandardMaterial color={palette.timber} roughness={0.7} />
              </mesh>
            </group>
          ) : null}

          {/* Scale figure at the tee: the fastest way to read clear height. */}
          {showFigure ? (
            <mesh position={[0, platform + FIGURE_H / 2, zones.playCz]}>
              <capsuleGeometry args={[0.2, FIGURE_H - 0.4, 6, 12]} />
              <meshStandardMaterial
                color="#4b5563"
                transparent
                opacity={0.55}
                roughness={0.9}
              />
            </mesh>
          ) : null}
        </>
      ) : o.type === 'movable-wall' ? (
        <MovableWall object={o} height={height} spec={spec} palette={palette} />
      ) : o.type === 'cart-pillar' ? (
        <CartFeature object={o} />
      ) : vol.mass === 'floor-finish' ? (
        <FloorFinish object={o} spec={spec} height={height} palette={palette} />
      ) : (
        <mesh position={[0, height / 2, 0]} receiveShadow castShadow>
          <boxGeometry args={[o.w, height, o.d]} />
          <meshStandardMaterial
            color={
              palette.useCatalogColours
                ? spec.fill
                : o.type === 'bar'
                  ? palette.barCounter
                  : palette.blockwork
            }
            roughness={0.85}
            transparent={vol.mass === 'room'}
            opacity={vol.mass === 'room' ? 0.82 : 1}
          />
        </mesh>
      )}

      {/* Selection cage. A wireframe rather than a tint, so it survives against
          every catalog colour. */}
      {selected ? (
        <lineSegments position={[0, (platform + height) / 2, 0]}>
          <edgesGeometry
            args={[new THREE.BoxGeometry(o.w + 0.06, platform + height + 0.06, o.d + 0.06)]}
          />
          <lineBasicMaterial color="#111827" />
        </lineSegments>
      ) : null}

      {showLabel ? (
        <Html
          // Fixed screen size, deliberately: `distanceFactor` scales a label
          // like geometry, which turns a zone you are standing next to into a
          // billboard across half the view.
          position={[0, Math.max(platform + height, 0.9) + 0.35, 0]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span
            style={{
              whiteSpace: 'nowrap',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'system-ui, sans-serif',
              color: breach ? '#7c2d12' : spec.text,
              background: breach ? 'rgba(255,237,213,0.95)' : 'rgba(255,255,255,0.88)',
              border: `1px solid ${breach ? '#ea580c' : 'rgba(0,0,0,0.12)'}`,
            }}
          >
            {o.label}
            {clearance ? ` · ${clearance.clearM.toFixed(2)} m` : ''}
          </span>
        </Html>
      ) : null}
    </group>
  );
}
