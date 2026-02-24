type CompatibleSurface = {
  label: string
}

const COMPATIBLE_SURFACES: CompatibleSurface[] = [
  { label: 'VS Code' },
  { label: 'Cursor' },
  { label: 'OpenCode' },
  { label: 'Claude Code' },
  { label: 'Antigravity' },
  { label: 'JetBrains IDEs' },
  { label: 'Neovim' },
  { label: 'Windsurf' },
  { label: 'Zed' },
  { label: 'Notion' },
  { label: 'Slack' },
  { label: 'Google Docs' },
  { label: 'Chrome' },
  { label: 'Edge' }
]

export default function WhereItWorks() {
  return (
    <section id="where-it-works" className="relative scroll-mt-28 overflow-hidden bg-transparent px-0 pb-10 pt-4 md:pb-14 md:pt-6">
      <div className="site-shell-tight relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#61758f]">
            Works Where You Write
          </p>
        </div>

        <div className="where-marquee-plane mt-5 md:mt-6">
          <div className="where-marquee-mask">
            <div className="where-marquee-track">
              <ul className="where-marquee-run" aria-label="Compatible editors and writing surfaces">
                {COMPATIBLE_SURFACES.map((surface) => (
                  <li key={`run-a-${surface.label}`} className="where-marquee-item">
                    <span className="where-marquee-wordmark">{surface.label}</span>
                  </li>
                ))}
              </ul>
              <ul className="where-marquee-run" aria-hidden="true">
                {COMPATIBLE_SURFACES.map((surface) => (
                  <li key={`run-b-${surface.label}`} className="where-marquee-item">
                    <span className="where-marquee-wordmark">{surface.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
