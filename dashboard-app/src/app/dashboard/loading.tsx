/**
 * Route-segment loading state for /dashboard/* — shown while
 * server components fetch data during navigation.
 */
export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex items-center gap-3 text-white/30 text-sm">
        <span className="w-4 h-4 rounded-full border-2 border-[#7C3AED]/30 border-t-[#9d61ff] animate-spin" />
        Loading…
      </div>
    </div>
  );
}
