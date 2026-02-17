import { Icon } from "@iconify/react";

export function CommandsOutput() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground font-sans">
      <header className="px-5 py-4 border-b border-border bg-background sticky top-0 z-10">
        <h1 className="text-xl font-bold font-heading tracking-tight mb-4">Command Center</h1>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Icon
              icon="solar:magnifer-linear"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search commands (e.g. /chart)..."
              className="w-full bg-input border border-border pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <button className="whitespace-nowrap bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold border border-primary">
              ALL COMMANDS
            </button>
            <button className="whitespace-nowrap bg-secondary text-secondary-foreground px-3 py-1.5 text-xs font-bold border border-border hover:bg-muted">
              VISUALIZATION
            </button>
            <button className="whitespace-nowrap bg-secondary text-secondary-foreground px-3 py-1.5 text-xs font-bold border border-border hover:bg-muted">
              DOCUMENTS
            </button>
            <button className="whitespace-nowrap bg-secondary text-secondary-foreground px-3 py-1.5 text-xs font-bold border border-border hover:bg-muted">
              ANALYSIS
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto pb-24">
        <section className="p-5">
          <h2 className="text-xs font-bold font-heading uppercase tracking-widest text-muted-foreground mb-4">
            System Library
          </h2>
          <div className="grid grid-cols-1 gap-3">
            <div className="border border-border p-4 bg-card group hover:border-primary transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary/10 text-primary flex items-center justify-center">
                    <Icon icon="solar:chart-square-linear" className="text-lg" />
                  </div>
                  <span className="font-mono font-bold text-sm">/generate-chart</span>
                </div>
                <Icon
                  icon="solar:info-circle-linear"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Transforms raw database queries into interactive visualizations (Line, Bar, Pie,
                Scatter).
              </p>
            </div>
            <div className="border border-border p-4 bg-card group hover:border-primary transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary/10 text-primary flex items-center justify-center">
                    <Icon icon="solar:document-text-linear" className="text-lg" />
                  </div>
                  <span className="font-mono font-bold text-sm">/summarize-pdf</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Extract key insights and data points from uploaded PDF documents into a concise
                brief.
              </p>
            </div>
            <div className="border border-border p-4 bg-card group hover:border-primary transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary/10 text-primary flex items-center justify-center">
                    <Icon icon="solar:presentation-graph-linear" className="text-lg" />
                  </div>
                  <span className="font-mono font-bold text-sm">/create-deck</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Generates a multi-slide presentation deck based on chat context or provided
                datasets.
              </p>
            </div>
          </div>
        </section>
        <section className="p-5 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold font-heading uppercase tracking-widest text-muted-foreground">
              Execution Log
            </h2>
            <button className="text-primary text-[10px] font-bold">CLEAR ALL</button>
          </div>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="pt-1 flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <div className="w-px flex-1 bg-border my-1" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono font-bold">14:02:45</span>
                  <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 font-mono uppercase">
                    Success
                  </span>
                </div>
                <div className="border border-border p-3 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold truncate">Q3_Revenue_Comparison.png</h3>
                    <div className="flex gap-2">
                      <button className="p-1 hover:text-primary transition-colors">
                        <Icon icon="solar:download-linear" />
                      </button>
                      <button className="p-1 hover:text-primary transition-colors">
                        <Icon icon="solar:link-linear" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">
                    2.4 MB · PNG · /generate-chart
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="pt-1 flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-border" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-mono font-bold">09:15:20</span>
                  <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 font-mono uppercase">
                    Success
                  </span>
                </div>
                <div className="border border-border p-3 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold truncate">Project_Alpha_Summary.pdf</h3>
                    <div className="flex gap-2">
                      <button className="p-1 hover:text-primary transition-colors">
                        <Icon icon="solar:download-linear" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">
                    15.8 MB · PDF · /summarize-pdf
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border flex items-center justify-around py-3 pb-6 z-30">
        <a
          href="#"
          className="flex flex-col items-center gap-1 flex-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon icon="solar:chat-round-line-linear" className="text-xl" />
          <span className="text-[10px] font-medium tracking-wide">Chats</span>
        </a>
        <a href="#" className="flex flex-col items-center gap-1 flex-1 text-primary">
          <Icon icon="solar:terminal-bold" className="text-xl" />
          <span className="text-[10px] font-medium tracking-wide">Commands</span>
        </a>
        <a
          href="#"
          className="flex flex-col items-center gap-1 flex-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon icon="solar:graph-up-linear" className="text-xl" />
          <span className="text-[10px] font-medium tracking-wide">Analytics</span>
        </a>
        <a
          href="#"
          className="flex flex-col items-center gap-1 flex-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon icon="solar:user-circle-linear" className="text-xl" />
          <span className="text-[10px] font-medium tracking-wide">Profile</span>
        </a>
      </nav>
    </div>
  );
}
