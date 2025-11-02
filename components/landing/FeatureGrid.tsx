import { Brain, BookOpen, Sparkles, FileCheck } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'Personalised',
    description: 'Adapts to your knowledge level',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: BookOpen,
    title: 'Comprehensive',
    description: 'Built on extensive MSRA question banks',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: Sparkles,
    title: 'Intelligent',
    description: 'RAG-powered responses, not generic AI',
    gradient: 'from-cyan-500 to-blue-500',
  },
  {
    icon: FileCheck,
    title: 'Evidence-Based',
    description: 'Grounded in UK medical guidelines',
    gradient: 'from-pink-500 to-purple-500',
  },
];

export function FeatureGrid() {
  return (
    <section className="py-20 px-6 pb-32">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative rounded-xl border border-gray-800 bg-black/40 backdrop-blur-sm p-6 
                         hover:border-gray-700 transition-all duration-300 hover:scale-105"
                style={{
                  animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both`,
                }}
              >
                {/* Gradient glow on hover */}
                <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                
                <div className="relative z-10 space-y-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.gradient} p-2.5 flex items-center justify-center`}>
                    <Icon className="w-full h-full text-white" strokeWidth={2} />
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-semibold text-white">
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}