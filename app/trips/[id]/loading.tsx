export default function TripLoading() {
  return (
    <main className="mx-auto max-w-6xl animate-pulse px-4 py-8 sm:px-6">
      <div className="h-4 w-40 rounded bg-stone-200" />
      <div className="mt-4 h-64 rounded-3xl bg-stone-200" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 rounded-2xl bg-stone-200" />
        <div className="h-32 rounded-2xl bg-stone-200" />
        <div className="h-32 rounded-2xl bg-stone-200" />
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="h-24 rounded-2xl bg-stone-200" />
          <div className="h-24 rounded-2xl bg-stone-200" />
          <div className="h-24 rounded-2xl bg-stone-200" />
        </div>
        <div className="h-48 rounded-2xl bg-stone-200" />
      </div>
    </main>
  );
}
