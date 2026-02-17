import { Icon } from "@iconify/react";

export function Home() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground font-sans">
      <header className="px-5 py-4 flex items-center justify-between border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2">
            <Icon icon="solar:command-bold" className="text-primary text-xl" />
          </div>
          <h1 className="text-xl font-bold font-heading tracking-tight">Terminal</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-secondary p-2 hover:bg-muted transition-colors">
            <Icon icon="solar:bell-bold" className="text-muted-foreground text-xl" />
          </button>
          <img
            src="https://lh3.googleusercontent.com/a/ACg8ocLPhkQJAlQmISkL-WbXL3XLfv0I4j_kou4Jctguho_zbqussg=s96-c"
            alt="Profile"
            className="w-9 h-9 border border-border object-cover"
          />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="px-5 py-6">
          <div className="relative group">
            <Icon
              icon="solar:magnifer-linear"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search commands, charts, or messages..."
              className="w-full bg-input border border-border pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/70"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
              <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 border border-border font-mono">
                CMD
              </span>
              <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 border border-border font-mono">
                K
              </span>
            </div>
          </div>
        </div>
        <section className="mb-8">
          <div className="px-5 flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold font-heading uppercase tracking-wider text-muted-foreground">
              Recent Outputs
            </h2>
            <button className="text-primary text-xs font-medium hover:underline flex items-center gap-1">
              View All <Icon icon="solar:arrow-right-linear" />
            </button>
          </div>
          <div className="flex overflow-x-auto px-5 pb-4 gap-4 scrollbar-hide">
            <div className="flex-shrink-0 w-64 border border-border bg-card group cursor-pointer hover:border-primary transition-colors">
              <div className="aspect-video w-full bg-muted overflow-hidden relative">
                <img
                  src="https://ggrhecslgdflloszjkwl.supabase.co/storage/v1/object/public/user-assets/bWUIeFLnndX/components/I7qTiJzWQlV.png"
                  className="w-full h-full object-cover mix-blend-multiply opacity-90"
                  alt="Chart"
                />
                <div className="absolute top-2 right-2 bg-background/90 backdrop-blur px-2 py-1 border border-border">
                  <span className="text-[10px] font-mono font-bold text-primary">CHART</span>
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-bold text-sm truncate">Q3 Revenue Projection</h3>
                <p className="text-xs text-muted-foreground mt-1 font-mono">Generated 2m ago</p>
              </div>
            </div>
            <div className="flex-shrink-0 w-64 border border-border bg-card group cursor-pointer hover:border-primary transition-colors">
              <div className="aspect-video w-full bg-muted overflow-hidden relative">
                <img
                  src="https://ggrhecslgdflloszjkwl.supabase.co/storage/v1/object/public/user-assets/bWUIeFLnndX/components/evnISvaNBcP.png"
                  className="w-full h-full object-cover mix-blend-multiply opacity-90"
                  alt="PDF"
                />
                <div className="absolute top-2 right-2 bg-background/90 backdrop-blur px-2 py-1 border border-border">
                  <span className="text-[10px] font-mono font-bold text-destructive">PDF</span>
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-bold text-sm truncate">Marketing Strategy 2025</h3>
                <p className="text-xs text-muted-foreground mt-1 font-mono">Generated 1h ago</p>
              </div>
            </div>
            <div className="flex-shrink-0 w-64 border border-border bg-card group cursor-pointer hover:border-primary transition-colors">
              <div className="aspect-video w-full bg-muted overflow-hidden relative">
                <img
                  src="https://ggrhecslgdflloszjkwl.supabase.co/storage/v1/object/public/user-assets/bWUIeFLnndX/components/1ZEO59yjaP8.png"
                  className="w-full h-full object-cover mix-blend-multiply opacity-90"
                  alt="Presentation"
                />
                <div className="absolute top-2 right-2 bg-background/90 backdrop-blur px-2 py-1 border border-border">
                  <span className="text-[10px] font-mono font-bold text-orange-500">DECK</span>
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-bold text-sm truncate">Investor Update Deck</h3>
                <p className="text-xs text-muted-foreground mt-1 font-mono">Generated 4h ago</p>
              </div>
            </div>
          </div>
        </section>
        <section className="px-5">
          <h2 className="text-sm font-bold font-heading uppercase tracking-wider text-muted-foreground mb-4">
            Active Threads
          </h2>
          <div className="flex flex-col border border-border divide-y divide-border">
            <div className="p-4 hover:bg-muted/30 transition-colors cursor-pointer flex gap-4 items-start group">
              <div className="relative">
                <img
                  src="https://randomuser.me/api/portraits/women/44.jpg"
                  className="w-10 h-10 object-cover border border-border"
                />
                <div className="absolute -bottom-1 -right-1 bg-green-500 w-3 h-3 border-2 border-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-0.5">
                  <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                    Sarah Chen
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground">10:42 AM</span>
                </div>
                <p className="text-sm text-muted-foreground truncate font-normal">
                  Can you run the analysis on the new dataset?
                </p>
              </div>
            </div>
            <div className="p-4 hover:bg-muted/30 transition-colors cursor-pointer flex gap-4 items-start group">
              <div className="relative flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground border border-primary">
                <Icon icon="solar:chart-square-bold" className="text-xl" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-0.5">
                  <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                    Data Bot
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground">09:15 AM</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon icon="solar:check-circle-bold" className="text-green-500 text-xs" />
                  <p className="text-sm text-foreground truncate font-medium">
                    Chart generated successfully.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 hover:bg-muted/30 transition-colors cursor-pointer flex gap-4 items-start group">
              <div className="relative">
                <img
                  src="https://randomuser.me/api/portraits/men/32.jpg"
                  className="w-10 h-10 object-cover border border-border"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-0.5">
                  <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                    Marcus Johnson
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground">Yesterday</span>
                </div>
                <p className="text-sm text-muted-foreground truncate font-normal">
                  I've attached the Q2 report for review.
                </p>
              </div>
            </div>
            <div className="p-4 hover:bg-muted/30 transition-colors cursor-pointer flex gap-4 items-start group">
              <div className="relative">
                <img
                  src="https://randomuser.me/api/portraits/women/68.jpg"
                  className="w-10 h-10 object-cover border border-border"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-0.5">
                  <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                    Elena Rodriguez
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground">Yesterday</span>
                </div>
                <p className="text-sm text-muted-foreground truncate font-normal">
                  Thanks for the update!
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <button className="fixed right-5 bottom-24 rounded-full bg-primary text-primary-foreground w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 z-20">
        <Icon icon="hugeicons:add-01" className="text-2xl" />
      </button>
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border flex items-center justify-around py-3 pb-6 z-30">
        <a href="#" className="flex flex-col items-center gap-1 flex-1 text-primary">
          <Icon icon="solar:chat-round-line-bold" className="text-xl" />
          <span className="text-[10px] font-medium tracking-wide">Chats</span>
        </a>
        <a
          href="#"
          className="flex flex-col items-center gap-1 flex-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon icon="solar:terminal-linear" className="text-xl" />
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
