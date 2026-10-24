export default function WorkspacePage({ title, description }) {
  return (
    <section>
      <h1 className="text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-3 text-slate-600">{description}</p>
      <div className="mt-8 border-t border-slate-200 py-8 text-sm text-slate-500">
        No data is available yet.
      </div>
    </section>
  );
}