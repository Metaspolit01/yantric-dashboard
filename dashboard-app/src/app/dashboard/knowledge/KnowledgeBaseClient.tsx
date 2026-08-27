"use client";

import { useState } from "react";
import { BookOpen, Upload, Globe, FileText, Plus, Trash2, Search, Sparkles, Bot, CheckCircle2 } from "lucide-react";
import AuthModal from "@/components/dashboard/AuthModal";

interface Props {
  isGuest: boolean;
  initialAgents: any[];
}

export default function KnowledgeBaseClient({ isGuest, initialAgents }: Props) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgents[0]?.id || "demo-agent");
  const [activeTab, setActiveTab] = useState<"files" | "text" | "website">("files");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [featureName, setFeatureName] = useState<string | null>(null);

  // Demo documents for guests to see what the feature looks like
  const documents = [
    { id: "1", name: "Services_and_Pricing_2026.pdf", type: "PDF Document", size: "1.2 MB", date: "Aug 02, 2026", status: "Indexed" },
    { id: "2", name: "Frequently_Asked_Questions.docx", type: "Word Doc", size: "450 KB", date: "Aug 05, 2026", status: "Indexed" },
    { id: "3", name: "https://sharmadental.com/treatments", type: "Scraped Web Page", size: "12 Pages", date: "Aug 07, 2026", status: "Active" },
  ];

  const handleAction = (actionTitle: string) => {
    if (isGuest) {
      setFeatureName(actionTitle);
      setAuthModalOpen(true);
    } else {
      alert(`${actionTitle} action triggered.`);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-xs font-semibold text-[#9d61ff] mb-2">
            <BookOpen className="w-3.5 h-3.5" /> AI Knowledge Base & RAG Engine
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-white">Knowledge Base</h1>
          <p className="text-white/50 text-sm mt-1">
            Train your voice agents with custom business documents, FAQs, price lists, and website content.
          </p>
        </div>

        <button
          onClick={() => handleAction("Upload Knowledge Document")}
          className="btn-primary flex items-center gap-2 shrink-0 shadow-lg shadow-[#7C3AED]/25"
        >
          <Plus className="w-4 h-4" /> Add Knowledge Source
        </button>
      </div>

      {/* Select Agent Dropdown */}
      <div className="glass-card rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#3B82F6]/20 border border-[#7C3AED]/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-[#9d61ff]" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase">Selected Voice Agent</div>
            <div className="text-sm font-bold text-white">
              {initialAgents.find(a => a.id === selectedAgentId)?.name || "Dental Receptionist Agent"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="yantric-input text-xs py-2 px-4 bg-white/[0.05] border-white/10 text-white rounded-xl cursor-pointer"
          >
            {initialAgents.length > 0 ? (
              initialAgents.map(a => (
                <option key={a.id} value={a.id} className="bg-[#0f101a] text-white">
                  {a.name} ({a.business_name || "General"})
                </option>
              ))
            ) : (
              <option value="demo-agent" className="bg-[#0f101a] text-white">
                Demo Voice Agent (Dental Clinic)
              </option>
            )}
          </select>
        </div>
      </div>

      {/* Add Knowledge Source Methods */}
      <div className="glass-card rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <h2 className="font-display font-semibold text-white text-base">Add New Knowledge Source</h2>
          <div className="flex rounded-xl bg-white/[0.05] p-1 border border-white/10">
            <button
              onClick={() => setActiveTab("files")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === "files" ? "bg-[#7C3AED] text-white shadow" : "text-white/50 hover:text-white"
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Upload File
            </button>
            <button
              onClick={() => setActiveTab("website")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === "website" ? "bg-[#7C3AED] text-white shadow" : "text-white/50 hover:text-white"
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Web Scraper
            </button>
            <button
              onClick={() => setActiveTab("text")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === "text" ? "bg-[#7C3AED] text-white shadow" : "text-white/50 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Q&A Text
            </button>
          </div>
        </div>

        {activeTab === "files" && (
          <div
            onClick={() => handleAction("Upload Knowledge File")}
            className="border-2 border-dashed border-white/15 hover:border-[#7C3AED]/50 rounded-2xl p-8 text-center cursor-pointer bg-white/[0.01] hover:bg-white/[0.03] transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6 text-[#9d61ff]" />
            </div>
            <h3 className="font-bold text-white text-sm">Drop PDF, Word, or TXT documents here</h3>
            <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
              Upload price lists, appointment policies, FAQs, or clinic guidelines up to 25MB.
            </p>
            <button className="btn-primary text-xs px-4 py-2 mt-4 inline-flex items-center gap-2">
              Browse Files
            </button>
          </div>
        )}

        {activeTab === "website" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  placeholder="https://yourcompany.com/services"
                  className="yantric-input pl-10 bg-white/[0.04] border-white/10"
                />
              </div>
              <button
                onClick={() => handleAction("Scrape Website URL")}
                className="btn-primary text-xs px-5 py-3 flex items-center gap-2 shrink-0"
              >
                <Sparkles className="w-4 h-4" /> Crawl & Extract
              </button>
            </div>
            <p className="text-xs text-white/40">
              Yantric AI automatically crawls pages, strips navigation headers, and indexes relevant text for your voice agent.
            </p>
          </div>
        )}

        {activeTab === "text" && (
          <div className="space-y-4">
            <textarea
              rows={4}
              placeholder="Q: What are your clinic opening hours?&#10;A: We are open Monday to Saturday from 9 AM to 8 PM."
              className="yantric-input bg-white/[0.04] border-white/10 text-xs"
            />
            <div className="flex justify-end">
              <button
                onClick={() => handleAction("Save Q&A Knowledge Text")}
                className="btn-primary text-xs px-5 py-2.5 flex items-center gap-2"
              >
                Save Knowledge Text
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing Knowledge Documents List Table */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-display font-semibold text-white text-base">Indexed Knowledge Sources</h2>
            <p className="text-xs text-white/40">Active knowledge base sources accessible to this voice agent during calls</p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search sources…"
              className="yantric-input pl-9 text-xs py-2 bg-white/[0.04] border-white/10 w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-white/40 uppercase tracking-wider">
                <th className="py-3 px-4">Document Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Size / Coverage</th>
                <th className="py-3 px-4">Added Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2.5">
                    {doc.type.includes("PDF") ? (
                      <FileText className="w-4 h-4 text-[#9d61ff]" />
                    ) : doc.type.includes("Web") ? (
                      <Globe className="w-4 h-4 text-[#00E5FF]" />
                    ) : (
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="truncate max-w-xs">{doc.name}</span>
                  </td>
                  <td className="py-3.5 px-4 text-white/60">{doc.type}</td>
                  <td className="py-3.5 px-4 text-white/60">{doc.size}</td>
                  <td className="py-3.5 px-4 text-white/40">{doc.date}</td>
                  <td className="py-3.5 px-4">
                    <span className="badge-active flex items-center gap-1.5 w-fit text-[10px]">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {doc.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleAction(`Delete ${doc.name}`)}
                      className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete Source"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auth Modal Trigger */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="login"
        featureName={featureName || "Knowledge Base Management"}
      />
    </div>
  );
}
