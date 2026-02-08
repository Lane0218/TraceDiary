function App() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-8">
      <section
        className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 px-7 py-10 text-center shadow-soft backdrop-blur-sm sm:px-10"
        aria-label="TraceDiary 首页"
      >
        <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-brand-100/70 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-14 h-52 w-52 rounded-full bg-cyan-100/70 blur-2xl" />

        <h1 className="relative m-0 text-4xl font-semibold tracking-[0.04em] text-ink-900 sm:text-5xl">
          TraceDiary
        </h1>
        <p className="relative mt-4 text-base text-slate-600 sm:text-lg">
          你的私密、可同步、加密日记。
        </p>
        <p className="relative mt-5 text-sm text-slate-500">Tailwind CSS 已接入，基础样式生效。</p>
      </section>
    </main>
  )
}

export default App
