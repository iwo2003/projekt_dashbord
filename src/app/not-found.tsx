import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-semibold">404</p>
      <Link className="btn btn-primary" href="/">
        Helios
      </Link>
    </div>
  );
}
