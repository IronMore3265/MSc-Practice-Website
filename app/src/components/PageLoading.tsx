// Shown in place of a page while the server builds it.
export function PageLoading() {
  return (
    <section className="stack page-loading" aria-busy="true" aria-live="polite">
      <p className="label">Loading</p>
      <div className="card skeleton" />
      <div className="card skeleton skeleton-short" />
    </section>
  );
}
