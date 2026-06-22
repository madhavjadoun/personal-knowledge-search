export default function OrbitLoader({ size = 32 }: { size?: number }) {
  return (
    <div
      className="orbit-loader"
      style={{ "--ol-size": `${size}px` } as React.CSSProperties}
      aria-label="Loading"
      role="status"
    >
      <div className="ring ring-1" />
      <div className="ring ring-2" />
      <div className="ring ring-3" />
    </div>
  );
}
