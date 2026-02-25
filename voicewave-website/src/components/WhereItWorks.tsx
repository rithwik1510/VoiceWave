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
    <section id="where-it-works" className="relative scroll-mt-28 overflow-hidden bg-transparent px-0 pb-12 pt-6 md:pb-16 md:pt-9">
      <div className="site-shell relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#61758f] sm:text-xs">
            Works Where You Write
          </p>
        </div>
      </div>

      <div className="where-marquee-bleed where-marquee-plane mt-6 md:mt-8">
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
    </section>
  )
}
