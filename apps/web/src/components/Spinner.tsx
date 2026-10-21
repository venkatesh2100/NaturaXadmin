export default function Spinner({ size = 14 }: { size?: number }) {
  return (
    <img
      src="/logo-spin.png"
      alt=""
      role="status"
      aria-label="Loading"
      width={size}
      height={size}
      draggable={false}
      className="spinner-logo"
    />
  );
}

export function Loading({ size = 56, screen = false }: { size?: number; screen?: boolean }) {
  return (
    <div className={screen ? "grid min-h-screen place-items-center" : "flex min-h-64 w-full items-center justify-center py-10"}>
      <Spinner size={size} />
    </div>
  );
}
