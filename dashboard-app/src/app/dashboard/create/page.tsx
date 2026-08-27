"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, ChevronRight, ChevronLeft, Check, Loader2, Building2, Users, HelpCircle, Wand2, Smile } from "lucide-react";
import AuthModal from "@/components/dashboard/AuthModal";
import { AGENT_LANGUAGES } from "@/lib/languages";

const steps = [
  {
    id: 1,
    icon: Building2,
    title: "Tell us about your business",
    description: "Describe what your business does in a few sentences.",
    placeholder: "We are a dental clinic in Visakhapatnam providing dental cleaning, root canal treatment and braces. We are open Monday to Saturday, 9 AM to 7 PM.",
    field: "business_description",
    label: "Business Description",
  },
  {
    id: 2,
    icon: Users,
    title: "Who will talk to your agent?",
    description: "Who are your typical customers or callers?",
    placeholder: "Existing patients and people looking for dental treatment in the city. Many callers ask about treatment options and booking appointments.",
    field: "target_users",
    label: "Your Customers",
  },
  {
    id: 3,
    icon: HelpCircle,
    title: "What do customers usually ask?",
    description: "List the most common questions your customers have.",
    placeholder: "They ask about treatments available, prices for different procedures, doctor availability, clinic timings, and how to book an appointment.",
    field: "common_questions",
    label: "Common Questions",
  },
  {
    id: 4,
    icon: Wand2,
    title: "What should your agent help with?",
    description: "What tasks or goals should your AI agent accomplish?",
    placeholder: "Answer questions about our services and prices, tell customers about our doctors and timings, and help them schedule an appointment.",
    field: "responsibilities",
    label: "Agent Responsibilities",
  },
  {
    id: 5,
    icon: Smile,
    title: "How should your agent speak?",
    description: "Describe the tone and personality you want for your agent.",
    placeholder: "Friendly, warm, and professional. Speak simply and clearly. Sound like a helpful human receptionist, not a robot. Use simple words.",
    field: "personality",
    label: "Agent Personality",
  },
];

const voiceOptions = [
  { value: "priya", label: "Priya", desc: "Female · Warm & Professional" },
  { value: "shubh", label: "Shubh", desc: "Male · Confident & Clear" },
  { value: "kavya", label: "Kavya", desc: "Female · Expressive & Friendly" },
  { value: "rahul", label: "Rahul", desc: "Male · Professional & Clear" },
  { value: "simran", label: "Simran", desc: "Female · Clear & Engaging" },
  { value: "aditya", label: "Aditya", desc: "Male · Natural & Friendly" },
  { value: "pooja", label: "Pooja", desc: "Female · Soft & Professional" },
  { value: "rohan", label: "Rohan", desc: "Male · Smooth & Conversational" },
  { value: "shreya", label: "Shreya", desc: "Female · Energetic & Bright" },
  { value: "kabir", label: "Kabir", desc: "Male · Deep & Authoritative" },
  { value: "ritu", label: "Ritu", desc: "Female · Calm & Formal" },
  { value: "amit", label: "Amit", desc: "Male · Clear & Energetic" },
  { value: "sophia", label: "Sophia", desc: "Female · Smooth & Natural" },
  { value: "dev", label: "Dev", desc: "Male · Crisp & Young" },
  { value: "tanya", label: "Tanya", desc: "Female · Crisp & Modern" },
  { value: "varun", label: "Varun", desc: "Male · Dynamic & Engaging" },
];

interface FormData {
  name: string;
  business_name: string;
  business_description: string;
  target_users: string;
  common_questions: string;
  responsibilities: string;
  personality: string;
  language: string;
  languages: string[];
  voice: string;
}

export default function CreateAgentPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0); // 0 = name step
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<FormData>({
    name: "",
    business_name: "",
    business_description: "",
    target_users: "",
    common_questions: "",
    responsibilities: "",
    personality: "",
    language: "en-IN",
    languages: ["en-IN"],
    voice: "priya",
  });

  const totalSteps = steps.length + 2; // name + 5 questions + settings
  const progress = ((currentStep + 1) / (totalSteps)) * 100;

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    if (currentStep === 0) return form.name.trim().length > 2 && form.business_name.trim().length > 2;
    if (currentStep >= 1 && currentStep <= 5) {
      const step = steps[currentStep - 1];
      return form[step.field as keyof FormData].trim().length > 10;
    }
    return true; // settings step
  };

  const [authModalOpen, setAuthModalOpen] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.status === 401 || data.error?.includes("Unauthorized")) {
        setCreating(false);
        setAuthModalOpen(true);
        return;
      }
      if (!res.ok) { setError(data.error || "Failed to create agent."); setCreating(false); return; }
      router.push(`/dashboard/agents/${data.agent.id}`);
    } catch {
      setError("Connection error. Please try again.");
      setCreating(false);
    }
  };

  const stepContent = () => {
    // Step 0: Name your agent
    if (currentStep === 0) {
      return (
        <div className="space-y-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Agent Name</label>
            <input
              className="yantric-input text-lg"
              placeholder="e.g. Dental Receptionist, Restaurant Helper"
              value={form.name}
              onChange={e => updateField("name", e.target.value)}
              autoFocus
            />
            <p className="text-xs text-white/30">This is the internal name you&apos;ll see in your dashboard.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Business Name</label>
            <input
              className="yantric-input text-lg"
              placeholder="e.g. Sharma Dental Clinic, Taste of India Restaurant"
              value={form.business_name}
              onChange={e => updateField("business_name", e.target.value)}
            />
            <p className="text-xs text-white/30">This is the business your agent will represent.</p>
          </div>
        </div>
      );
    }

    // Steps 1-5: Business questions
    if (currentStep >= 1 && currentStep <= 5) {
      const step = steps[currentStep - 1];
      const Icon = step.icon;
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/20 flex items-center justify-center">
              <Icon className="w-4.5 h-4.5 text-[#9d61ff]" />
            </div>
            <div>
              <div className="text-xs text-white/40 font-medium">Question {currentStep} of 5</div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">{step.label}</label>
            <textarea
              className="yantric-input resize-none"
              rows={5}
              placeholder={step.placeholder}
              value={form[step.field as keyof FormData]}
              onChange={e => updateField(step.field as keyof FormData, e.target.value)}
              autoFocus
            />
          </div>
        </div>
      );
    }

    // Step 6: Voice & Language settings
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Agent Voice</label>
          <div className="grid grid-cols-2 gap-2">
            {voiceOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateField("voice", opt.value)}
                className={`flex flex-col items-start p-3.5 rounded-xl border transition-all text-left ${
                  form.voice === opt.value
                    ? "border-[#7C3AED]/50 bg-[#7C3AED]/10 text-white"
                    : "border-white/[0.07] bg-white/[0.02] text-white/50 hover:border-white/15 hover:text-white/70"
                }`}
              >
                <span className="font-semibold text-sm">{opt.label}</span>
                <span className="text-[11px] opacity-70 mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Languages (select all your customers speak — the agent mirrors each caller)</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {AGENT_LANGUAGES.map(opt => {
              const selected = form.languages.includes(opt.code);
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => {
                    setForm(prev => {
                      const has = prev.languages.includes(opt.code);
                      let next = has
                        ? prev.languages.filter(c => c !== opt.code)
                        : [...prev.languages, opt.code];
                      if (next.length === 0) next = ["en-IN"]; // never allow zero
                      return { ...prev, languages: next, language: next[0] };
                    });
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    selected
                      ? "border-[#7C3AED]/50 bg-[#7C3AED]/10 text-white"
                      : "border-white/[0.07] bg-white/[0.02] text-white/50 hover:border-white/15"
                  }`}
                >
                  <span className="text-sm font-medium">{opt.native}<span className="block text-[10px] opacity-60">{opt.label}</span></span>
                  {selected && <Check className="w-4 h-4 text-[#9d61ff]" />}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/30">
            The agent detects each caller's language and replies in it.
            {form.languages.length > 1 && " Choose which one is PRIMARY below — greetings and the default voice use it."}
          </p>
          {form.languages.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Primary Language</label>
              <select
                value={form.language}
                onChange={e => setForm(prev => {
                  const primary = e.target.value;
                  return { ...prev, language: primary, languages: [primary, ...prev.languages.filter(c => c !== primary)] };
                })}
                className="yantric-input bg-[#0f101a] text-white max-w-xs"
              >
                {form.languages.map(code => (
                  <option key={code} value={code} className="bg-[#12121a]">
                    {AGENT_LANGUAGES.find(l => l.code === code)?.label ?? code}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  };

  const getStepTitle = () => {
    if (currentStep === 0) return "Name your agent";
    if (currentStep >= 1 && currentStep <= 5) return steps[currentStep - 1].title;
    return "Voice & Language";
  };

  const getStepDesc = () => {
    if (currentStep === 0) return "Give your AI agent a name and tell us what business it represents.";
    if (currentStep >= 1 && currentStep <= 5) return steps[currentStep - 1].description;
    return "Choose how your agent sounds. You can change this later.";
  };

  if (creating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/20 border border-[#7C3AED]/20 flex items-center justify-center">
            <Bot className="w-8 h-8 text-[#9d61ff]" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
        </div>
        <div className="text-center">
          <h2 className="font-display font-bold text-xl text-white mb-2">Creating your agent…</h2>
          <p className="text-white/40 text-sm">Yantric is generating your agent&apos;s configuration and personality.</p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-white/30 text-center">
          <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing business information</div>
          <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating system prompt</div>
          <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Configuring voice settings</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-[10px] font-bold uppercase tracking-wider text-[#9d61ff]">
            <Bot className="w-3 h-3" /> Create Agent
          </div>
        </div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-white">
          {getStepTitle()}
        </h1>
        <p className="text-white/45 text-sm mt-1">{getStepDesc()}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-white/30 mb-2">
          <span>Step {currentStep + 1} of {totalSteps}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Step dots */}
        <div className="flex items-center gap-1.5 mt-3">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= currentStep ? "bg-[#7C3AED]" : "bg-white/[0.08]"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          className="glass-card rounded-2xl p-6 mb-6"
        >
          {stepContent()}
        </motion.div>
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          className="btn-ghost flex items-center gap-2 disabled:opacity-20"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {currentStep < totalSteps - 1 ? (
          <button
            onClick={() => setCurrentStep(s => s + 1)}
            disabled={!canProceed()}
            className="btn-primary flex items-center gap-2"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={!canProceed()}
            className="btn-primary flex items-center gap-2 px-6 py-3"
          >
            <Bot className="w-4 h-4" />
            Create My Agent
          </button>
        )}
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="login"
        featureName="Create Voice Agent"
      />
    </div>
  );
}
