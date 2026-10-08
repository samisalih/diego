const GROUND_RADIUS = 400;
// Just below the floors at y = 0 so the two never fight over depth.
const GROUND_Y = -0.02;

/** A large neutral plane around the apartment so the view through the windows is never empty. */
export function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
      <circleGeometry args={[GROUND_RADIUS, 64]} />
      <meshStandardMaterial color="#7d8478" roughness={1} />
    </mesh>
  );
}
