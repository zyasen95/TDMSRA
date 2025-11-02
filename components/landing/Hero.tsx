// components/landing/Hero.tsx
import { useRouter } from 'next/router';

export function Hero() {
  const router = useRouter();

  const handleEnterGuru = () => {
    router.push('/auth');
  };

  return (
    <section className="flex items-center justify-center px-6 py-20 pb-12">
      <div className="max-w-5xl mx-auto text-center space-y-8 animate-fadeIn">
        {/* Main Headline */}
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            The Future of MSRA Preparation
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-xl md:text-2xl font-medium text-gray-300 max-w-3xl mx-auto leading-relaxed">
          Experience GURU - Your AI-powered MSRA companion powered by advanced 
          language models and comprehensive medical knowledge
        </p>

        {/* CTA Button */}
        <div className="pt-8">
          <button
            onClick={handleEnterGuru}
            className="group relative px-8 py-4 text-lg font-semibold text-white rounded-lg
                     bg-gradient-to-r from-blue-600 to-purple-600 
                     hover:from-blue-500 hover:to-purple-500
                     transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50
                     transition-all duration-300 ease-out"
          >
            <span className="relative z-10">Enter GURU</span>
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-400 to-purple-400 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300" />
          </button>
        </div>
      </div>
    </section>
  );
}