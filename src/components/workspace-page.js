export default function WorkspacePage({ title, description, children }) {
  return (
    <section className="space-y-8">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d6533d]">Organization admin</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
        </div>
      </header>
      {children || (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <h2 className="text-base font-bold text-slate-800">No organization data connected</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            This admin section is not connected to live organization data yet. No sample metrics or records are shown.
          </p>
        </div>
      )}
    </section>
  );
}