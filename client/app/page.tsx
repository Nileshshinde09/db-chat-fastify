import { Button } from "@/components/ui/button"
import { CloudShader } from "@/components/ui/cloud-shader"
import Nav from "@/components/nav"
export default function Page() {
  return (
    <div className="relative min-h-[50rem] w-full overflow-hidden">
      <CloudShader className="absolute inset-0" />
      {/* navbar */}
      <Nav />
      {/* hero */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 pt-12 text-center md:pt-20">
        <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md md:text-6xl lg:text-7xl">
          Your databases, <br className="hidden md:block" /> now conversational.
        </h1>
        <p className="mt-6 max-w-2xl text-base text-white/90 drop-shadow-sm md:text-lg">
          Query anything without knowing SQL. Our secure AI agent connects to
          your data sources, remembers your context, and builds the exact
          reports you need—instantly.
        </p>
      </div>

      {/* dashboard image */}
      <div className="relative z-10 mx-auto mt-12 w-full max-w-6xl px-4 pb-4 md:mt-16 md:px-8">
        <div className="rounded-2xl border border-white/30 bg-white/20 p-2 shadow-2xl backdrop-blur-md md:rounded-[2rem] md:p-3">
          <img
            src={"./image.png"}
            alt="DB_Chat fintech dashboard"
            className="w-full rounded-xl border border-black/5 shadow-lg md:rounded-3xl"
          />
        </div>
      </div>
    </div>
  )
}
