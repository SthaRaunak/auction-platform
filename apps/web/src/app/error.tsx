'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
      <h1 className="ttl text-[30px]">Something went wrong</h1>
      <p className="mut mt-3">We couldn’t load this page. If the API isn’t running, start it with <code>pnpm dev</code>.</p>
      <button type="button" className="btn btn-primary mt-6" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
