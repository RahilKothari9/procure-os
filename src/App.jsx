import { useState, useEffect } from 'react';

// --- CONFIGURATION ---
// 1. Log into ElevenLabs > Agents to get your ID
const AGENT_ID = "YOUR_AGENT_ID_GOES_HERE"; 
// 2. Your n8n Webhook URL (Keep this variable even if using mock data for now)
const N8N_QUEUE_URL = "https://your-n8n-instance.com/webhook/get-next-lead"; 

function App() {
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("SYSTEM_IDLE");
  const [activeLeadId, setActiveLeadId] = useState(null);

  // --- 1. Load ElevenLabs Script Dynamically ---
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://elevenlabs.io/convai-widget/index.js";
    script.async = true;
    script.type = "text/javascript";
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // --- 2. Data Fetching Logic ---
  const fetchQueue = async () => {
    setStatus("SYNCING_DB...");
    
    // START MOCK DATA BLOCK (Use this for the Demo)
    const mockData = [
      { id: '101', supplier: 'Tyrell Corp', item: 'Bio-Mech Eyes', status: 'PENDING', risk: 'LOW' },
      { id: '102', supplier: 'Wallace Ind', item: 'Nexus-9 CPUs', status: 'QUEUED', risk: 'LOW' },
      { id: '103', supplier: 'Cyberdyne', item: 'Neural Nets', status: 'ESCALATED', risk: 'CRITICAL' },
    ];

    setTimeout(() => {
      setLeads(mockData);
      const firstPending = mockData.find(l => l.status === 'PENDING');
      if (firstPending) setActiveLeadId(firstPending.id);
      setStatus("ONLINE // READY");
    }, 800);
    // END MOCK DATA BLOCK

    // --- REAL N8N CONNECTION (Uncomment when ready) ---
    /*
    try {
      const res = await fetch(N8N_QUEUE_URL);
      const data = await res.json();
      setLeads(data);
      setStatus("ONLINE // READY");
    } catch (err) {
      console.error("n8n Connection Failed:", err);
      setStatus("CONNECTION_ERR");
    }
    */
  };

  // Initial Load
  useEffect(() => {
    fetchQueue();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative bg-oil-black">
      
      {/* Background Layers */}
      <div className="bg-grid" />
      <div className="crt-scanline" />

      {/* Main Chassis */}
      <div className="w-full max-w-6xl h-[700px] bg-panel-bg border border-[#333] border-t-4 border-t-safety-orange shadow-2xl grid grid-cols-12 grid-rows-[60px_1fr_40px] relative z-10">
        
        {/* HEADER */}
        <header className="col-span-12 bg-[#1a1a1e] border-b border-[#333] flex items-center justify-between px-6 select-none">
          <div className="text-xl font-bold tracking-tighter">
            PROCURE<span className="text-safety-orange">-OS</span>
          </div>
          <div className="flex gap-4 text-xs text-gray-500 font-mono">
            <span>SYS.VER: 4.0.2</span>
            <span className={`font-bold ${status === 'CONNECTION_ERR' ? 'text-red-500' : 'text-safety-orange animate-pulse'}`}>
              [{status}]
            </span>
          </div>
        </header>

        {/* SIDEBAR (QUEUE) */}
        <aside className="col-span-4 border-r border-[#333] bg-[#0c0c0e] flex flex-col">
          <div className="p-4 border-b border-[#333]">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4 font-mono">Incoming Sequence</h2>
            <button 
              onClick={fetchQueue}
              className="w-full border border-[#333] text-gray-400 hover:border-safety-orange hover:text-safety-orange text-xs py-2 px-4 transition-all duration-300 font-mono uppercase"
            >
              Running Diagnostics...
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
            {leads.map((lead) => (
              <div 
                key={lead.id}
                onClick={() => setActiveLeadId(lead.id)}
                className={`p-3 border-l-2 transition-all cursor-pointer group ${
                  lead.id === activeLeadId 
                    ? 'border-safety-orange bg-safety-orange/10' 
                    : 'border-[#333] bg-[#1a1a1e] opacity-60 hover:opacity-100 hover:border-gray-500'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm text-gray-200 group-hover:text-white">{lead.supplier}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    lead.risk === 'CRITICAL' 
                      ? 'bg-red-900/50 text-red-200 border border-red-900' 
                      : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}>
                    {lead.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 font-light font-mono">ID: {lead.id} // {lead.item}</div>
                
                {lead.id === activeLeadId && (
                   <div className="mt-2 text-[10px] text-safety-orange font-bold animate-pulse tracking-wide font-mono">
                     &gt;&gt; TARGET LOCKED
                   </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN VIEWPORT */}
        <main className="col-span-8 bg-oil-black relative flex flex-col items-center justify-center p-10 overflow-hidden">
          {/* Decorative Crosshairs */}
          <div className="absolute top-4 left-4 w-3 h-3 border-l border-t border-gray-700" />
          <div className="absolute top-4 right-4 w-3 h-3 border-r border-t border-gray-700" />
          <div className="absolute bottom-4 left-4 w-3 h-3 border-l border-b border-gray-700" />
          <div className="absolute bottom-4 right-4 w-3 h-3 border-r border-b border-gray-700" />

          {/* Radial Glow Center */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,69,0,0.05),transparent_70%)] pointer-events-none" />

          {/* Center Content */}
          <div className="relative z-10 text-center">
            <div className="text-xs text-gray-600 mb-2 tracking-[0.3em] font-mono">VOICE CHANNEL: SECURE</div>
            
            {/* ELEVENLABS WIDGET CONTAINER */}
            <elevenlabs-convai agent-id={AGENT_ID}></elevenlabs-convai>
            
            <p className="mt-8 text-xs text-gray-500/80 max-w-xs mx-auto leading-relaxed font-mono">
              Initialize connection to begin automated supplier negotiation protocol.
            </p>
          </div>
        </main>

        {/* FOOTER */}
        <footer className="col-span-12 bg-oil-black border-t border-[#333] flex items-center justify-between px-6 text-[10px] text-gray-600 font-mono uppercase">
          <div className="flex gap-6">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-900 animate-pulse"></span>
              TLS 1.3 ENCRYPTED
            </span>
            <span>LATENCY: 14ms</span>
          </div>
          <div>AUTH_TOKEN: ******************</div>
        </footer>

      </div>
    </div>
  );
}

export default App;