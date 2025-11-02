// components/landing/BuiltDifferent.tsx
export function BuiltDifferent() {
    return (
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl border border-gray-800 bg-black/40 backdrop-blur-sm p-8 md:p-12 space-y-6">
            {/* Subtle glow effect */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
            
            <div className="relative z-10 space-y-6">
              {/* Section heading */}
              <h2 className="text-3xl md:text-4xl font-semibold text-white mb-8">
                Built Different
              </h2>
  
              {/* Key points */}
              <div className="space-y-4 text-lg text-gray-300 leading-relaxed">
                <p>
                  Unlike generic AI LLMs, GURU is trained specifically on MSRA content. 
                  RAG architecture ensures every response is backed by{' '}
                  <span className="text-blue-400 font-medium">UK medical guidelines</span>.
                </p>
  
                <p>
                  Question explanations are grounded in{' '}
                  <span className="text-purple-400 font-medium">evidence-based memory science</span>, 
                  helping you retain knowledge more effectively.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }