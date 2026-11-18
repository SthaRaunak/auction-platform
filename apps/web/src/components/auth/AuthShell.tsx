export function AuthShell({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[420px] px-6 py-12">
      <h1 className="ttl text-[32px]">{title}</h1>
      {lead && <p className="mut mb-6 mt-2 text-[14px]">{lead}</p>}
      <div className={lead ? '' : 'mt-6'}>{children}</div>
    </div>
  );
}
