import { motion } from "motion/react";

import { ApiStatus } from "./components/ApiStatus";

export default function App() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090a0d] px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.2),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(250,204,21,0.14),transparent_34%)]" />

      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-3xl rounded-[2rem] border border-white/10 bg-zinc-950/75 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-12"
        initial={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <div className="mb-10 flex items-center justify-between gap-4">
          <p className="text-xs font-semibold tracking-[0.3em] text-red-400 uppercase">
            Project scaffold
          </p>
          <ApiStatus />
        </div>

        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h1 className="max-w-xl text-5xl font-black tracking-[-0.06em] text-balance sm:text-7xl">
              UNO No Mercy
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400 sm:text-lg">
              React is ready. Hono is listening. The table is set for the
              game engine.
            </p>
          </div>

          <div
            aria-hidden="true"
            className="grid size-28 rotate-6 place-items-center rounded-2xl border-4 border-white bg-red-600 text-4xl font-black italic shadow-xl shadow-red-950/50"
          >
            UNO
          </div>
        </div>

        <div className="mt-10 grid gap-3 border-t border-white/10 pt-6 text-sm text-zinc-500 sm:grid-cols-2">
          <span>Frontend · Vite + React</span>
          <span className="sm:text-right">Backend · Bun + Hono</span>
        </div>
      </motion.section>
    </main>
  );
}
