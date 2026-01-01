import { useState, useEffect, useRef, useCallback } from 'react';
import { Conversation } from '@11labs/client';

// --- CONFIGURATION ---
// 1. Log into ElevenLabs > Agents to get your ID
const ELEVENLABS_AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || import.meta.env.VITE_AGENT_ID; 
// 2. Your n8n Webhook URL (Keep this variable even if using mock data for now)
const N8N_QUEUE_URL = import.meta.env.VITE_N8N_QUEUE_URL; 
// 3. Deepgram Agent configuration
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || '';
const DEEPGRAM_LISTEN_MODEL = import.meta.env.VITE_DEEPGRAM_LISTEN_MODEL || 'nova-3';
const DEEPGRAM_SPEAK_MODEL = import.meta.env.VITE_DEEPGRAM_SPEAK_MODEL || 'aura-asteria-en';
const DEEPGRAM_THINK_PROVIDER = import.meta.env.VITE_DEEPGRAM_THINK_PROVIDER || 'open_ai';
const DEEPGRAM_THINK_MODEL = import.meta.env.VITE_DEEPGRAM_THINK_MODEL || 'gpt-4o';
const DEFAULT_PROVIDER = (import.meta.env.VITE_DEFAULT_PROVIDER || 'elevenlabs').toLowerCase();

const PROVIDER_LABELS = {
  elevenlabs: 'ElevenLabs',
  deepgram: 'Deepgram'
};

const LOG_OUTCOME_FUNCTION = {
  name: 'log_outcome',
  description: 'Saves the result of the negotiation.',
  parameters: {
    type: 'object',
    required: ['lead_id', 'delivery_date', 'notes', 'risk_level'],
    properties: {
      lead_id: {
        type: 'string',
        description: 'Lead ID passed via the system prompt/input.'
      },
      delivery_date: {
        type: 'string',
        description: 'Confirmed delivery date from the supplier.'
      },
      notes: {
        type: 'string',
        description: "Reason for delay or 'None' when on time."
      },
      risk_level: {
        type: 'string',
        description: 'CRITICAL if delay > 7 days or severe incident (breakdown, strike, fire).'
      }
    }
  },
  endpoint: {
    url: 'https://kotharirahil9.app.n8n.cloud/webhook/save-lead',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }
};

const sanitizeValue = (value, fallback = 'null') => {
  if (value === 0) return '0';
  return value && String(value).trim() ? String(value).trim() : fallback;
};

const manifestLine = (index, name, qty) => {
  const safeName = sanitizeValue(name);
  const safeQty = sanitizeValue(qty);
  return `${index}. ${safeName} (${safeQty})`;
};

const buildDeepgramPrompt = (lead) => {
  const supplierName = sanitizeValue(lead.supplier_name, 'Unknown Supplier');
  const leadId = sanitizeValue(lead.lead_id, 'Unassigned');
  const pocName = sanitizeValue(lead.poc_name, 'the supplier');
  const dueDate = sanitizeValue(lead.original_due_date, 'the committed date');
  const item1Sentence = `${sanitizeValue(lead.item_1_qty, '0')} of ${sanitizeValue(lead.item_1_name, 'Item 1')}`;
  const hasItem2 = Boolean(lead.item_2_name && lead.item_2_qty);
  const hasItem3 = Boolean(lead.item_3_name && lead.item_3_qty);
  const item2Sentence = hasItem2 ? `${sanitizeValue(lead.item_2_qty)} of ${sanitizeValue(lead.item_2_name)}` : null;
  const item3Sentence = hasItem3 ? `${sanitizeValue(lead.item_3_qty)} of ${sanitizeValue(lead.item_3_name)}` : null;

  const lines = [
    'You are Procure-OS, an automated procurement agent for your company.',
    'You are professional, efficient, and firm.',
    '',
    'YOUR DATA:',
    `- Supplier: ${supplierName}`,
    `- Lead ID: ${leadId}`,
    `- Expected Due Date: ${dueDate}`,
    'THE ORDER MANIFEST:',
    manifestLine(1, lead.item_1_name, lead.item_1_qty),
    manifestLine(2, lead.item_2_name, lead.item_2_qty),
    manifestLine(3, lead.item_3_name, lead.item_3_qty),
    '',
    'PROTOCOL:',
    'PHASE 1: THE HOOK',
    `- You have already sent the greeting. Wait for them to confirm they are ${pocName}.`,
    '- Once confirmed, state: "I\'m calling to verify the delivery schedule for the following order manifest:"',
    '',
    'PHASE 2: THE MANIFEST READ',
    '- You MUST read the items explicitly:',
    `  1. Read: "${item1Sentence}"`,
    hasItem2
      ? `  2. Read: "...and ${item2Sentence}"`
      : '  2. Item 2 is "null" so do not reference it.',
    hasItem3
      ? `  3. Read: "...and ${item3Sentence}"`
      : '  3. Item 3 is "null" so do not reference it.',
    `- After listing them, ask: "Are we still on track for delivery by ${dueDate}?"`,
    '',
    'PHASE 3: THE NEGOTIATION (SMART LOGIC)',
    '- If "Yes" (On Track):',
    '  - Do NOT ask for the date. Simply say "Great." and move immediately to Phase 4.',
    '- If "No" (Delayed):',
    '  - LISTEN CAREFULLY: Did the user already give the new date/duration?',
    '  - If YES (New Date is known): ONLY ask for the Reason.',
    '  - If NO (New Date is unknown): Ask for BOTH the reason and the new estimated date.',
    '- Assess the RISK: If delay > 7 days or involves "breakdown", "strike", or "fire", mark as CRITICAL.',
    '',
    'PHASE 4: THE VERBAL CONFIRMATION',
    `- If On Track: "Just to confirm, I am logging that the order is ON TIME for delivery on ${dueDate}. Is that correct?"`,
    '- If Delayed: "Just to confirm, I am logging a NEW delivery date of [New Date] with the reason: [Reason]. Is that correct?"',
    '',
    'PHASE 5: THE SAVE & EXIT',
    '- If they say "Yes":',
    '- Say: "Logging update now. Goodbye."',
    '- IMMEDIATELY execute tool `log_outcome`.',
    '- IMMEDIATELY end the call.',
    '- If they say "No": Re-ask for the correct details.'
  ];

  return lines.join('\n');
};

const buildDeepgramSettings = (lead) => ({
  type: 'Settings',
  audio: {
    input: {
      encoding: 'linear16',
      sample_rate: 16000
    },
    output: {
      encoding: 'linear16',
      sample_rate: 24000,
      container: 'none'
    }
  },
  agent: {
    listen: { provider: { type: 'deepgram', model: DEEPGRAM_LISTEN_MODEL } },
    speak: { provider: { type: 'deepgram', model: DEEPGRAM_SPEAK_MODEL } },
    think: {
      provider: { type: DEEPGRAM_THINK_PROVIDER, model: DEEPGRAM_THINK_MODEL },
      prompt: buildDeepgramPrompt(lead),
      functions: [LOG_OUTCOME_FUNCTION]
    },
    greeting: `Hello, this is Procure-OS calling for ${sanitizeValue(lead.poc_name, 'your team')}. Am I speaking with the right person?`
  },
  experimental: true
});

const downsampleBuffer = (buffer, fromSampleRate, toSampleRate) => {
  if (!buffer || !buffer.length) {
    return new Float32Array(0);
  }
  if (fromSampleRate === toSampleRate) {
    return buffer;
  }
  const sampleRateRatio = fromSampleRate / toSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = accum / (count || 1);
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
};

const floatTo16BitPCM = (buffer) => {
  const len = buffer.length;
  const result = new Int16Array(len);
  for (let i = 0; i < len; i += 1) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return result.buffer;
};

const createAudioBufferFromPcm = (audioContext, pcmData, sampleRate = 24000) => {
  if (!audioContext || !pcmData) return null;
  const buffer = audioContext.createBuffer(1, pcmData.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < pcmData.length; i += 1) {
    channelData[i] = pcmData[i] / 32768;
  }
  return buffer;
};

function App() {
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("SYSTEM_IDLE");
  const [activeLeadId, setActiveLeadId] = useState(null);
  const [callStatus, setCallStatus] = useState('idle'); // idle, connecting, connected, ended
  const isDeepgramConfigured = Boolean(DEEPGRAM_API_KEY);
  const initialProvider = DEFAULT_PROVIDER === 'deepgram' && isDeepgramConfigured ? 'deepgram' : 'elevenlabs';
  const [voiceProvider, setVoiceProvider] = useState(initialProvider);
  const [activeCallProvider, setActiveCallProvider] = useState(null);
  const conversationRef = useRef(null);
  const deepgramSessionRef = useRef(null);
  const activeSessionProviderRef = useRef(null);

  const cleanupDeepgramSession = useCallback((options = {}) => {
    const session = deepgramSessionRef.current;
    if (!session) return;

    if (session.keepAliveTimer) {
      clearInterval(session.keepAliveTimer);
    }
    if (session.processor) {
      try {
        session.processor.disconnect();
      } catch (err) {
        console.warn('Unable to disconnect processor', err);
      }
      session.processor.onaudioprocess = null;
    }
    if (session.silentGain) {
      try {
        session.silentGain.disconnect();
      } catch (err) {
        console.warn('Unable to disconnect gain node', err);
      }
    }
    if (session.micSourceNode) {
      try {
        session.micSourceNode.disconnect();
      } catch (err) {
        console.warn('Unable to disconnect microphone source', err);
      }
    }
    if (session.micContext && session.micContext.state !== 'closed') {
      session.micContext.close().catch(() => {});
    }
    if (session.mediaStream) {
      session.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (session.playbackSources) {
      session.playbackSources.forEach((source) => {
        try {
          source.stop(0);
        } catch (err) {
          console.warn('Unable to stop playback source', err);
        }
      });
    }
    if (session.playbackContext && session.playbackContext.state !== 'closed') {
      session.playbackContext.close().catch(() => {});
    }
    if (session.socket) {
      session.socket.onopen = null;
      session.socket.onmessage = null;
      session.socket.onerror = null;
      session.socket.onclose = null;
      if (!options.skipSocketClose && session.socket.readyState <= 1) {
        try {
          session.socket.close();
        } catch (err) {
          console.warn('Unable to close Deepgram socket', err);
        }
      }
    }

    deepgramSessionRef.current = null;

    if (activeSessionProviderRef.current === 'deepgram') {
      activeSessionProviderRef.current = null;
      setActiveCallProvider((prev) => (prev === 'deepgram' ? null : prev));
    }
  }, [setActiveCallProvider]);

  useEffect(() => {
    return () => {
      cleanupDeepgramSession();
    };
  }, [cleanupDeepgramSession]);

  const startElevenLabsCall = async (targetLead) => {
    if (!ELEVENLABS_AGENT_ID) {
      console.error('ElevenLabs agent ID missing.');
      setCallStatus('idle');
      setActiveCallProvider(null);
      activeSessionProviderRef.current = null;
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const conversation = await Conversation.startSession({
        agentId: ELEVENLABS_AGENT_ID,
        dynamicVariables: {
          lead_id: targetLead.lead_id,
          supplier_name: targetLead.supplier_name,
          poc_name: targetLead.poc_name,
          original_due_date: targetLead.original_due_date,
          item_1: targetLead.item_1_name,
          qty_1: targetLead.item_1_qty,
          item_2: targetLead.item_2_name || 'null',
          qty_2: targetLead.item_2_qty || 'null',
          item_3: targetLead.item_3_name || 'null',
          qty_3: targetLead.item_3_qty || 'null'
        },
        onConnect: () => {
          console.log('Connected to ElevenLabs');
          setCallStatus('connected');
        },
        onDisconnect: () => {
          console.log('Disconnected from ElevenLabs');
          setCallStatus('ended');
          setTimeout(() => setCallStatus('idle'), 2000);
          conversationRef.current = null;
          activeSessionProviderRef.current = null;
          setActiveCallProvider(null);
        },
        onError: (error) => {
          console.error('ElevenLabs Error:', error);
          setCallStatus('idle');
          conversationRef.current = null;
          activeSessionProviderRef.current = null;
          setActiveCallProvider(null);
        }
      });

      conversationRef.current = conversation;
    } catch (error) {
      console.error('Failed to start call:', error);
      setCallStatus('idle');
      setActiveCallProvider(null);
      activeSessionProviderRef.current = null;
    }
  };

  const startDeepgramCall = async (targetLead) => {
    if (!DEEPGRAM_API_KEY) {
      console.error('Deepgram API key missing.');
      setCallStatus('idle');
      setActiveCallProvider(null);
      activeSessionProviderRef.current = null;
      return;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      console.error('Web Audio API is not supported in this browser.');
      setCallStatus('idle');
      setActiveCallProvider(null);
      activeSessionProviderRef.current = null;
      return;
    }

    try {
      cleanupDeepgramSession();
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      const micContext = new AudioContextCtor();
      const microphoneSource = micContext.createMediaStreamSource(mediaStream);
      const processor = micContext.createScriptProcessor(4096, 1, 1);
      const silentGain = micContext.createGain();
      silentGain.gain.value = 0;
      microphoneSource.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(micContext.destination);

      let playbackContext;
      try {
        playbackContext = new AudioContextCtor({ sampleRate: 24000 });
      } catch (err) {
        console.warn('Falling back to default playback sample rate', err);
        playbackContext = new AudioContextCtor();
      }

      const socket = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', ['token', DEEPGRAM_API_KEY]);
      socket.binaryType = 'arraybuffer';

      const session = {
        socket,
        mediaStream,
        micContext,
        micSourceNode: microphoneSource,
        processor,
        silentGain,
        playbackContext,
        playbackSources: [],
        playbackStartTime: playbackContext.currentTime || 0,
        keepAliveTimer: null
      };
      deepgramSessionRef.current = session;

      socket.onopen = () => {
        try {
          socket.send(JSON.stringify(buildDeepgramSettings(targetLead)));
          session.keepAliveTimer = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'KeepAlive' }));
            }
          }, 10000);
          setCallStatus('connected');
        } catch (err) {
          console.error('Failed to configure Deepgram agent:', err);
          cleanupDeepgramSession({ skipSocketClose: true });
          setCallStatus('idle');
          setActiveCallProvider(null);
          activeSessionProviderRef.current = null;
        }
      };

      socket.onerror = (event) => {
        console.error('Deepgram socket error:', event);
        cleanupDeepgramSession({ skipSocketClose: true });
        setCallStatus('idle');
        setActiveCallProvider(null);
        activeSessionProviderRef.current = null;
      };

      socket.onclose = () => {
        cleanupDeepgramSession({ skipSocketClose: true });
        setCallStatus((prev) => {
          if (prev === 'idle') return prev;
          setTimeout(() => setCallStatus('idle'), 2000);
          return 'ended';
        });
        setActiveCallProvider(null);
        activeSessionProviderRef.current = null;
      };

      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const pcm = new Int16Array(event.data);
          const audioBuffer = createAudioBufferFromPcm(session.playbackContext, pcm, 24000);
          if (!audioBuffer) return;
          const source = session.playbackContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(session.playbackContext.destination);
          const startAt = Math.max(session.playbackStartTime || session.playbackContext.currentTime, session.playbackContext.currentTime);
          source.start(startAt);
          session.playbackStartTime = startAt + audioBuffer.duration;
          session.playbackSources.push(source);
          source.onended = () => {
            session.playbackSources = session.playbackSources.filter((node) => node !== source);
          };
        } else if (typeof event.data === 'string') {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'error') {
              console.error('Deepgram agent error:', payload);
            }
          } catch (err) {
            console.warn('Unable to parse Deepgram message', err);
          }
        }
      };

      processor.onaudioprocess = (audioEvent) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        const inputData = audioEvent.inputBuffer.getChannelData(0);
        const downsampled = downsampleBuffer(inputData, micContext.sampleRate, 16000);
        const pcmBuffer = floatTo16BitPCM(downsampled);
        try {
          socket.send(pcmBuffer);
        } catch (err) {
          console.error('Unable to stream audio to Deepgram:', err);
        }
      };
    } catch (error) {
      console.error('Failed to start Deepgram call:', error);
      cleanupDeepgramSession();
      setCallStatus('idle');
      setActiveCallProvider(null);
      activeSessionProviderRef.current = null;
    }
  };

  const startCall = async () => {
    const targetLead = leads.find(l => l.lead_id === activeLeadId);
    if (!targetLead) {
      console.error("No lead selected");
      return;
    }

    const providerReady = voiceProvider === 'deepgram' ? isDeepgramConfigured : Boolean(ELEVENLABS_AGENT_ID);
    if (!providerReady) {
      console.error('Selected voice provider is not configured.');
      return;
    }

    setCallStatus('connecting');
    setActiveCallProvider(voiceProvider);
    activeSessionProviderRef.current = voiceProvider;

    if (voiceProvider === 'deepgram') {
      await startDeepgramCall(targetLead);
    } else {
      await startElevenLabsCall(targetLead);
    }
  };

  // --- 2. End Call ---
  const endCall = async () => {
    if (activeSessionProviderRef.current === 'deepgram') {
      cleanupDeepgramSession();
    } else if (conversationRef.current) {
      await conversationRef.current.endSession();
      conversationRef.current = null;
    }
    activeSessionProviderRef.current = null;
    setActiveCallProvider(null);
    setCallStatus('idle');
    // Refetch data after call ends, but keep the same supplier selected
    fetchQueue(true);
  };

  // --- 3. Data Fetching Logic ---
  const fetchQueue = async (preserveSelection = false) => {
    const currentLeadId = activeLeadId;
    setStatus("SYNCING_DB...");
    
    // START MOCK DATA BLOCK (Use this for the Demo)
    const mockData = [
      { 
        lead_id: '101', 
        supplier_name: 'Sharma Building Materials', 
        poc_name: 'Rajesh Sharma',
        status: 'Pending', 
        risk_level: 'LOW',
        item_1_name: 'AAC Blocks', item_1_qty: '1000 Pcs',
        item_2_name: 'Cement (ACC)', item_2_qty: '150 Bags',
        item_3_name: 'Binding Wire', item_3_qty: '25 Kg',
        original_due_date: '2025-12-18',
        delivery_date: '', delay_reason: '', call_summary: ''
      },
      { 
        lead_id: '102', 
        supplier_name: 'Gupta Hardware Store', 
        poc_name: 'Anita Gupta',
        status: 'Pending', 
        risk_level: 'LOW',
        item_1_name: 'PVC Pipes (4 inch)', item_1_qty: '200 Pcs',
        item_2_name: 'Gate Valves', item_2_qty: '50 Pcs',
        item_3_name: 'Pipe Fittings', item_3_qty: '100 Pcs',
        original_due_date: '2025-12-22',
        delivery_date: '', delay_reason: '', call_summary: ''
      },
      { 
        lead_id: '103', 
        supplier_name: 'Krishna Tiles & Sanitary', 
        poc_name: 'Mohan Patel',
        status: 'Pending', 
        risk_level: 'CRITICAL',
        item_1_name: 'Vitrified Tiles (2x2)', item_1_qty: '800 Sq ft',
        item_2_name: 'Bathroom Fittings', item_2_qty: '10 Sets',
        item_3_name: '', item_3_qty: '',
        original_due_date: '2025-12-14',
        delivery_date: '', delay_reason: '', call_summary: ''
      },
    ];

    // setTimeout(() => {
    //   setLeads(mockData);
    //   const firstPending = mockData.find(l => l.status === 'Pending');
    //   if (firstPending) setActiveLeadId(firstPending.lead_id);
    //   setStatus("ONLINE // READY");
    // }, 800);
    // END MOCK DATA BLOCK

    // --- REAL N8N CONNECTION ---
    
    try {
      const res = await fetch(N8N_QUEUE_URL);
      const data = await res.json();
      setLeads(data);
      // Only auto-select first pending if not preserving selection
      if (!preserveSelection || !currentLeadId) {
        const firstPending = data.find(l => l.status === 'Pending');
        if (firstPending) setActiveLeadId(firstPending.lead_id);
      }
      setStatus("ONLINE // READY");
    } catch (err) {
      console.error("n8n Connection Failed:", err);
      setStatus("CONNECTION_ERR");
    }
    
  };

  // Initial Load
  useEffect(() => {
    fetchQueue();
  }, []);

  const providerOptions = [
    { id: 'elevenlabs', label: PROVIDER_LABELS.elevenlabs, ready: Boolean(ELEVENLABS_AGENT_ID) },
    { id: 'deepgram', label: PROVIDER_LABELS.deepgram, ready: isDeepgramConfigured }
  ];
  const isCallLocked = callStatus === 'connecting' || callStatus === 'connected';
  const activeProviderLabel = PROVIDER_LABELS[activeCallProvider || voiceProvider] || 'Voice Agent';
  const canStartCall = Boolean(
    activeLeadId && (
      (voiceProvider === 'deepgram' && isDeepgramConfigured) ||
      (voiceProvider === 'elevenlabs' && ELEVENLABS_AGENT_ID)
    )
  );
  const startButtonLabel = (() => {
    if (!activeLeadId) return 'Select a Supplier';
    if (!canStartCall) {
      return voiceProvider === 'deepgram' ? 'Configure Deepgram' : 'Set Agent ID';
    }
    return `Start Call | ${activeProviderLabel}`;
  })();

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
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4 font-mono">Supplier Queue</h2>
            <button 
              onClick={fetchQueue}
              className="w-full border border-[#333] text-gray-400 hover:border-safety-orange hover:text-safety-orange text-xs py-2 px-4 transition-all duration-300 font-mono uppercase"
            >
              Refresh Orders...
            </button>
          </div>
          
          <div className="flex-1 p-4 space-y-3 supplier-scroll scrollbar-hide">
            {leads.map((lead) => (
              <div 
                key={lead.lead_id}
                onClick={() => setActiveLeadId(lead.lead_id)}
                className={`p-3 border-l-2 transition-all cursor-pointer group ${
                  lead.lead_id === activeLeadId 
                    ? 'border-safety-orange bg-safety-orange/10' 
                    : 'border-[#333] bg-[#1a1a1e] opacity-60 hover:opacity-100 hover:border-gray-500'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm text-gray-200 group-hover:text-white">{lead.supplier_name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    lead.risk_level === 'CRITICAL' 
                      ? 'bg-red-900/50 text-red-200 border border-red-900' 
                      : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}>
                    {lead.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 font-light font-mono">
                  ID: {lead.lead_id} // POC: {lead.poc_name}
                </div>
                <div className="text-[10px] text-gray-600 mt-1 font-mono">
                  Due: {lead.original_due_date}
                </div>
                
                {lead.lead_id === activeLeadId && (
                   <div className="mt-2 text-[10px] text-safety-orange font-bold animate-pulse tracking-wide font-mono">
                     &gt;&gt; SELECTED FOR NEGOTIATION
                   </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN VIEWPORT */}
        <main className="col-span-8 bg-oil-black relative flex flex-col items-start justify-start p-6 overflow-hidden">
          {/* Decorative Crosshairs */}
          <div className="absolute top-4 left-4 w-3 h-3 border-l border-t border-gray-700" />
          <div className="absolute top-4 right-4 w-3 h-3 border-r border-t border-gray-700" />
          <div className="absolute bottom-4 left-4 w-3 h-3 border-l border-b border-gray-700" />
          <div className="absolute bottom-4 right-4 w-3 h-3 border-r border-b border-gray-700" />

          {/* Radial Glow Center */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,69,0,0.05),transparent_70%)] pointer-events-none" />

          {/* Selected Lead Details */}
          {activeLeadId && leads.find(l => l.lead_id === activeLeadId) && (
            <div className="relative z-10 w-full mb-4">
              {(() => {
                const activeLead = leads.find(l => l.lead_id === activeLeadId);
                return (
                  <div className="space-y-4">
                    {/* Supplier Header */}
                    <div className="border-b border-[#333] pb-3">
                      <h3 className="text-lg font-bold text-white">{activeLead.supplier_name}</h3>
                      <p className="text-xs text-gray-500 font-mono">Contact: {activeLead.poc_name} | Due: {activeLead.original_due_date}</p>
                    </div>
                    
                    {/* Items List */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono">Order Items</h4>
                      <div className="grid gap-2 text-xs font-mono">
                        {activeLead.item_1_name && (
                          <div className="flex justify-between bg-[#1a1a1e] p-2 border-l-2 border-safety-orange">
                            <span className="text-gray-300">{activeLead.item_1_name}</span>
                            <span className="text-safety-orange">{activeLead.item_1_qty}</span>
                          </div>
                        )}
                        {activeLead.item_2_name && (
                          <div className="flex justify-between bg-[#1a1a1e] p-2 border-l-2 border-gray-600">
                            <span className="text-gray-300">{activeLead.item_2_name}</span>
                            <span className="text-gray-400">{activeLead.item_2_qty}</span>
                          </div>
                        )}
                        {activeLead.item_3_name && (
                          <div className="flex justify-between bg-[#1a1a1e] p-2 border-l-2 border-gray-600">
                            <span className="text-gray-300">{activeLead.item_3_name}</span>
                            <span className="text-gray-400">{activeLead.item_3_qty}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Agent Updated Fields */}
                    <div className="space-y-2 border-t border-[#333] pt-3">
                      <h4 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-mono">Agent Updates</h4>
                      <div className="grid gap-2 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Delivery Date:</span>
                          <span className={activeLead.delivery_date ? 'text-green-400' : 'text-gray-600'}>
                            {activeLead.delivery_date || '-- Pending --'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Delay Reason:</span>
                          <span className={activeLead.delay_reason ? 'text-yellow-400' : 'text-gray-600'}>
                            {activeLead.delay_reason || '-- None --'}
                          </span>
                        </div>
                        {activeLead.call_summary && (
                          <div className="mt-2 p-2 bg-[#1a1a1e] border border-[#333] text-gray-400 text-[11px] leading-relaxed">
                            <span className="text-gray-500 block mb-1">Call Summary:</span>
                            {activeLead.call_summary}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Voice Widget Section */}
          <div className="relative z-10 text-center w-full mt-auto border-t border-[#333] pt-4">
            <div className="text-xs text-gray-600 mb-2 tracking-[0.3em] font-mono">AI PROCUREMENT ASSISTANT</div>
            <div className="flex justify-center gap-2 mb-3 text-[10px] uppercase font-mono">
              {providerOptions.map((option) => {
                const disabled = !option.ready || isCallLocked;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVoiceProvider(option.id)}
                    disabled={disabled}
                    className={`px-3 py-1 border transition-colors ${
                      voiceProvider === option.id
                        ? 'border-safety-orange text-safety-orange bg-safety-orange/10'
                        : 'border-[#333] text-gray-500'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-safety-orange hover:text-safety-orange'}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            
            {/* Call Button */}
            {callStatus === 'idle' && (
              <button
                onClick={startCall}
                type="button"
                disabled={!canStartCall}
                className={`px-8 py-4 rounded-full font-mono text-sm uppercase tracking-wider transition-all duration-300 ${
                  canStartCall 
                    ? 'bg-safety-orange text-black hover:bg-orange-400 cursor-pointer' 
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }`}
              >
                {startButtonLabel}
              </button>
            )}
            {callStatus === 'connecting' && (
              <div className="px-8 py-4 bg-yellow-900/50 border border-yellow-600 rounded-full inline-block">
                <span className="text-yellow-400 font-mono text-sm animate-pulse">
                  CONNECTING TO {activeProviderLabel.toUpperCase()}
                </span>
              </div>
            )}
            {callStatus === 'connected' && (
              <div className="space-y-3">
                <div className="px-8 py-4 bg-green-900/50 border border-green-600 rounded-full inline-block">
                  <span className="text-green-400 font-mono text-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    CALL IN PROGRESS | {activeProviderLabel.toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={endCall}
                  type="button"
                  className="block mx-auto px-6 py-2 bg-red-900/50 border border-red-600 text-red-400 rounded font-mono text-xs hover:bg-red-900 transition-all"
                >
                  End Call
                </button>
              </div>
            )}
            {callStatus === 'ended' && (
              <div className="px-8 py-4 bg-gray-800 border border-gray-600 rounded-full inline-block">
                <span className="text-gray-400 font-mono text-sm">CALL ENDED | {activeProviderLabel.toUpperCase()}</span>
              </div>
            )}
            
            <p className="mt-4 text-xs text-gray-500/80 max-w-xs mx-auto leading-relaxed font-mono">
              {activeLeadId 
                ? `Ready to call ${leads.find(l => l.lead_id === activeLeadId)?.poc_name || 'supplier'} via ${activeProviderLabel}`
                : 'Select a supplier from the queue to begin'
              }
            </p>
          </div>
        </main>

        {/* FOOTER */}
        <footer className="col-span-12 bg-oil-black border-t border-[#333] flex items-center justify-between px-6 text-[10px] text-gray-600 font-mono uppercase">
          <div className="flex gap-6">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-900 animate-pulse"></span>
              SECURE CONNECTION
            </span>
            <span>REGION: INDIA</span>
          </div>
          <div>GST VERIFIED | MSME REGISTERED</div>
        </footer>

      </div>
    </div>
  );
}

export default App;
