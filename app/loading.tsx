export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-slate-700">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-100 border-t-[#0F766E]" />
        <p className="text-sm font-medium">Memuat TrixSehat...</p>
      </div>
    </main>
  );
}
