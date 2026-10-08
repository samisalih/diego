const GROUND_RADIUS = 400;
const GROUND_SEGMENTS = 64;
const GROUND_COLOR = "#7d8478";
// Just below the floors at y = 0 so the two never fight over depth.
const GROUND_Y = -0.02;

/** A large neutral plane around the apartment so the view through the windows is never empty. */
export function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
      <circleGeometry args={[GROUND_RADIUS, GROUND_SEGMENTS]} />
      <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
    </mesh>
  );
}
