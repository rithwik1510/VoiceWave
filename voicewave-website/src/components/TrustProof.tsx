const stats = [
  { label: 'Faster release-to-text', value: '5x' },
  { label: 'Words processed (test runs)', value: '234K+' },
  { label: 'Cloud transcription in v1', value: '0' }
]

export default function TrustProof() {
  return (
    <section id="privacy" className="px-0 pb-8 pt-12 sm:pb-10 sm:pt-16">
      <div className="site-shell-tight">
        <div className="panel-card overflow-hidden p-6 sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#64748b]">Trust Proof</p>
          <h2 className="mt-3 max-w-3xl text-[clamp(1.9rem,4vw,3.2rem)] leading-[1.03] text-[#0a1020]">
            Teams that use VoiceWave diagnose issues earlier and spend less time resolving insertion failures.
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {stats.map((item) => (
              <article key={item.label} className="rounded-2xl border border-[#dbe5f2] bg-[#f8fbff] p-4 sm:p-5">
                <p className="text-3xl text-[#0a1020] sm:text-4xl">{item.value}</p>
                <p className="mt-2 text-sm text-[#475569]">{item.label}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
