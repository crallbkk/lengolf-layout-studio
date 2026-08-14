/**
 * The touch thumbstick's current deflection, in the same units WASD produces:
 * -1..1 on each axis, positive forward and positive to the right.
 *
 * A plain mutable ref rather than store state, following `viewCenter`: the
 * stick writes this on every pointermove of a held drag, and WalkControls reads
 * it inside useFrame. Routing a per-frame analogue value through zustand would
 * re-run every selector in the app 60 times a second for a number that has
 * exactly one reader, which never subscribes — it samples.
 *
 * It is also the reason the stick can live in the DOM while the camera lives in
 * the r3f scene graph: there is no React tree between them to thread a prop
 * down, and turning the stick into a `<Html>` inside the canvas to get one
 * would put a live DOM overlay inside the render loop for no gain.
 */
export const walkInput: { forward: number; strafe: number } = {
  forward: 0,
  strafe: 0,
};

export function setWalkInput(forward: number, strafe: number): void {
  walkInput.forward = forward;
  walkInput.strafe = strafe;
}

export function resetWalkInput(): void {
  walkInput.forward = 0;
  walkInput.strafe = 0;
}
