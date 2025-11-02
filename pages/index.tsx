// pages/index.tsx
import { Hero } from '../components/landing/Hero';
import { BuiltDifferent } from '../components/landing/BuiltDifferent';
import { AnimatedBackground } from '../components/landing/AnimatedBackground';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      {/* Animated particle network background */}
      <AnimatedBackground />
      
      {/* Content (sits on top of particles) */}
      <div className="relative z-10">
        <Hero />
        <BuiltDifferent />
      </div>
    </main>
  );
}