"use client";

export default function AdminBilling({ organizations = [] }) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Organization account</h1>
        <p className="mt-3 text-slate-600">All organizations use the same free KURO account features.</p>
      </div>
      <div className="grid gap-3">
        {organizations.map((organization) => (
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={organization.id}>
            <h2 className="font-bold text-slate-950">{organization.name}</h2>
            <p className="mt-1 text-sm font-semibold text-[#245c55]">Free account</p>
          </article>
        ))}
        {!organizations.length && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            No organization is linked to this admin account yet.
          </p>
        )}
      </div>
    </section>
  );
}
