export const LoadingGrid = () => (
  <div className="grid-auto">
    {Array.from({ length: 6 }).map((_, index) => (
      <div key={index} className="glass animate-pulse rounded-[28px] p-6">
        <div className="h-64 rounded-3xl bg-white/10" />
        <div className="mt-4 h-4 w-24 rounded bg-white/10" />
        <div className="mt-3 h-8 w-2/3 rounded bg-white/10" />
        <div className="mt-6 h-10 rounded-full bg-white/10" />
      </div>
    ))}
  </div>
);
