import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
      <h1 className="ttl text-[34px]">We couldn’t find that</h1>
      <p className="mut mt-3">The lot may have been removed, or the link is wrong.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Browse live lots
      </Link>
    </div>
  );
}
