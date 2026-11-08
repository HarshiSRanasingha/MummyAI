import { useEffect, useRef, useState } from "react";
import {
  Baby, HeartPulse, CalendarDays, MessageCircle, ShieldCheck,
  Sprout, Send, Languages, BookOpen, Activity, Sparkles, Plus, Trash2,
  CheckCircle2, Ruler
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");

const suggestions = [
  "What should I prepare for my next clinic visit?",
  "What information belongs in a child health record?",
  "How can I support my child's development?"
];

export default function App() {
  const [currentPage, setCurrentPage] = useState("home");
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hello! I'm the MummyAI companion. I can help with general questions, prepare questions for a clinic visit, and demonstrate how fictional sample records work when MongoDB is configured. I don't access real health records or reviewed medical sources."
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("demo");
  const [databaseStatus, setDatabaseStatus] = useState(null);
  const [sampleChildren, setSampleChildren] = useState([]);
  const [recordsError, setRecordsError] = useState("");
  const messagesEndRef = useRef(null);
  const [workspace, setWorkspace] = useState({ profiles: [], growthEntries: [], reminders: [] });
  const [workspaceError, setWorkspaceError] = useState("");
  const [profileForm, setProfileForm] = useState({ name: "", dateOfBirth: "", relationship: "" });
  const [growthForm, setGrowthForm] = useState({ profileId: "", date: "", weightKg: "", heightCm: "" });
  const [reminderForm, setReminderForm] = useState({ profileId: "", title: "", date: "" });

  function navigateTo(page) {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch(`${API_BASE}/api/health`);
        if (!response.ok) throw new Error("Health check failed");
        const data = await response.json();
        if (cancelled) return;
        setMode(data.mode === "agent" ? "agent" : "demo");
        setDatabaseStatus(data.database?.status || "unknown");

        if (data.database?.status !== "connected") {
          setRecordsError(data.database?.error || "Connect MongoDB Atlas to load the fictional sample profiles.");
          return;
        }

        const recordsResponse = await fetch(`${API_BASE}/api/demo/children`);
        const recordsData = await recordsResponse.json();
        if (!recordsResponse.ok) {
          throw new Error(recordsData.error || "Could not load the sample profiles.");
        }
        if (!cancelled) setSampleChildren(recordsData.children);
      } catch (loadError) {
        if (cancelled) return;
        const text = loadError instanceof Error ? loadError.message : "Could not load database status.";
        setRecordsError(text);
        setError("Could not reach the backend. Make sure the API is running on port 4000.");
      }
    }
    loadStatus();
    return () => { cancelled = true; };
  }, []);

  async function refreshWorkspace() {
    try {
      const response = await fetch(`${API_BASE}/api/demo/workspace`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the demo workspace.");
      setWorkspace(data);
      setWorkspaceError("");
      return data;
    } catch (loadError) {
      setWorkspaceError(loadError instanceof Error ? loadError.message : "Could not load the demo workspace.");
      return null;
    }
  }

  useEffect(() => {
    refreshWorkspace();
  }, []);

  async function createDemoProfile(event) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/demo/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm)
    });
    const data = await response.json();
    if (!response.ok) {
      setWorkspaceError(data.error || "Could not create the profile.");
      return;
    }
    setProfileForm({ name: "", dateOfBirth: "", relationship: "" });
    await refreshWorkspace();
  }

  async function addGrowthEntry(event) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/demo/growth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(growthForm)
    });
    const data = await response.json();
    if (!response.ok) {
      setWorkspaceError(data.error || "Could not save the measurement.");
      return;
    }
    setGrowthForm({ profileId: "", date: "", weightKg: "", heightCm: "" });
    await refreshWorkspace();
  }

  async function addReminder(event) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/demo/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reminderForm)
    });
    const data = await response.json();
    if (!response.ok) {
      setWorkspaceError(data.error || "Could not save the reminder.");
      return;
    }
    setReminderForm({ profileId: "", title: "", date: "" });
    await refreshWorkspace();
  }

  async function updateReminder(id, completed) {
    await fetch(`${API_BASE}/api/demo/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed })
    });
    await refreshWorkspace();
  }

  async function deleteReminder(id) {
    await fetch(`${API_BASE}/api/demo/reminders/${id}`, { method: "DELETE" });
    await refreshWorkspace();
  }

  async function deleteProfile(id) {
    await fetch(`${API_BASE}/api/demo/profiles/${id}`, { method: "DELETE" });
    await refreshWorkspace();
  }

  useEffect(() => {
    document.documentElement.lang = language;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, language]);

  async function sendMessage(text = message) {
    const clean = text.trim();
    if (!clean || loading) return;

    setMessages((current) => [...current, { role: "user", text: clean }]);
    setMessage("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          language,
          history: messages.slice(-8).map(({ role, text }) => ({ role, text }))
        })
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The backend returned an invalid response.");
      }
      if (!response.ok) throw new Error(data.error || "Request failed");
      setMode(data.mode);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: data.answer, demo: data.mode !== "agent", ai: data.mode === "agent" }
      ]);
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : "Could not reach the backend. Make sure the API is running on port 4000.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand brand-button" onClick={() => navigateTo("home")} aria-label="MummyAI home">
          <span className="brand-mark"><Sprout size={23} /></span>
          <span><strong>MummyAI</strong><small>Growing together</small></span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={currentPage === "home" ? "active" : ""} onClick={() => navigateTo("home")}>Home</button>
          <button className={currentPage === "care" ? "active" : ""} onClick={() => navigateTo("care")}>Care workspace</button>
          <button className={currentPage === "assistant" ? "active" : ""} onClick={() => navigateTo("assistant")}>AI companion</button>
          <button className={currentPage === "safety" ? "active" : ""} onClick={() => navigateTo("safety")}>Safety</button>
        </nav>
        <div className="header-tools">
          <div className="language-picker">
            <Languages size={16} />
            <label className="sr-only" htmlFor="language">Chat language</label>
            <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="si">සිංහල</option>
              <option value="ta">தமிழ்</option>
            </select>
          </div>
        </div>
      </header>

      <main id="home">
        {currentPage === "home" && <>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={15} /> A companion for every stage</div>
            <h1>Care, guidance and <span>peace of mind.</span></h1>
            <p>Keep maternal and child health information organized, understand trusted guidance, and prepare for each next step — together.</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => navigateTo("assistant")}><MessageCircle size={17} /> Try the AI companion</button>
              <span className="privacy-note"><ShieldCheck size={16} /> Fictional records only</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun"></div>
            <div className="art-circle"><Baby size={104} strokeWidth={1.25} /></div>
            <div className="float-card card-one"><HeartPulse size={18} /><span>Care through every stage</span></div>
            <div className="float-card card-two"><Sprout size={18} /><span>Little steps, big growth</span></div>
          </div>
        </section>

        <section className="feature-grid" aria-label="Product modules">
          <article className="feature-card">
            <span className="feature-icon rose"><HeartPulse /></span>
            <h2>Pregnancy care</h2>
            <p>Visit notes, pregnancy education and birth preparation.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon blue"><Baby /></span>
            <h2>Child health record</h2>
            <p>Organize health history, immunizations and measurements.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon gold"><Activity /></span>
            <h2>Growth & development</h2>
            <p>Follow observations and prepare questions for clinic visits.</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon green"><CalendarDays /></span>
            <h2>Care reminders</h2>
            <p>Plan appointments and follow-up tasks. Scheduling is planned.</p>
          </article>
        </section>

        <section className="sample-records" aria-labelledby="sample-records-title">
          <div className="sample-records-heading">
            <div>
              <div className="eyebrow"><ShieldCheck size={15} /> Fictional examples only</div>
              <h2 id="sample-records-title">Sample child records</h2>
              <p>These profiles are synthetic examples, not real people or medical records.</p>
            </div>
            <span className={`database-status ${databaseStatus === "connected" ? "connected" : ""}`}>
              {databaseStatus === "connected" ? "Atlas connected" : "Atlas not connected"}
            </span>
          </div>
          {recordsError && <p className="records-message" role="status">{recordsError}</p>}
          {sampleChildren.length > 0 && (
            <div className="sample-record-grid">
              {sampleChildren.map((child) => (
                <article className="sample-record-card" key={child.childId}>
                  <div className="sample-record-icon"><Baby size={20} /></div>
                  <div>
                    <h3>{child.displayName}</h3>
                    <p>Demo ID: {child.childId}</p>
                    <small>
                      {child.visits.length} fictional {child.visits.length === 1 ? "visit" : "visits"}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        </>}

        {currentPage === "care" && <>
        <section className="care-workspace" aria-labelledby="workspace-title">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow"><ShieldCheck size={15} /> Private local prototype</div>
              <h2 id="workspace-title">Your demo care workspace</h2>
              <p>Create fictional profiles only. Never enter real names or private health information.</p>
            </div>
            <span className="workspace-count">{workspace.profiles.length} synthetic {workspace.profiles.length === 1 ? "profile" : "profiles"}</span>
          </div>

          {workspaceError && <p className="error-message" role="alert">{workspaceError}</p>}
          <div className="workspace-grid">
            <form className="workspace-card" onSubmit={createDemoProfile}>
              <div className="workspace-card-title"><span className="feature-icon rose"><Baby /></span><div><h3>Demo profile</h3><p>Add a fictional child profile.</p></div></div>
              <label>Name<input required maxLength={80} value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} placeholder="Example Child A" /></label>
              <label>Fictional birth date<input required type="date" value={profileForm.dateOfBirth} onChange={(event) => setProfileForm({ ...profileForm, dateOfBirth: event.target.value })} /></label>
              <label>Relationship<input required maxLength={40} value={profileForm.relationship} onChange={(event) => setProfileForm({ ...profileForm, relationship: event.target.value })} placeholder="Fictional caregiver" /></label>
              <button className="workspace-button" type="submit"><Plus size={16} /> Add profile</button>
            </form>

            <form className="workspace-card" onSubmit={addGrowthEntry}>
              <div className="workspace-card-title"><span className="feature-icon blue"><Ruler /></span><div><h3>Growth record</h3><p>Store example measurements locally.</p></div></div>
              <label>Profile<select required value={growthForm.profileId} onChange={(event) => setGrowthForm({ ...growthForm, profileId: event.target.value })}><option value="">Select a demo profile</option>{workspace.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
              <label>Date<input required type="date" value={growthForm.date} onChange={(event) => setGrowthForm({ ...growthForm, date: event.target.value })} /></label>
              <div className="field-row"><label>Weight (kg)<input required type="number" min="0.1" max="300" step="0.1" value={growthForm.weightKg} onChange={(event) => setGrowthForm({ ...growthForm, weightKg: event.target.value })} /></label><label>Height (cm)<input required type="number" min="0.1" max="250" step="0.1" value={growthForm.heightCm} onChange={(event) => setGrowthForm({ ...growthForm, heightCm: event.target.value })} /></label></div>
              <button className="workspace-button" type="submit" disabled={!workspace.profiles.length}><Plus size={16} /> Add measurement</button>
            </form>

            <form className="workspace-card" onSubmit={addReminder}>
              <div className="workspace-card-title"><span className="feature-icon gold"><CalendarDays /></span><div><h3>Care reminder</h3><p>Plan a fictional follow-up task.</p></div></div>
              <label>Profile<select required value={reminderForm.profileId} onChange={(event) => setReminderForm({ ...reminderForm, profileId: event.target.value })}><option value="">Select a demo profile</option>{workspace.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
              <label>Reminder<input required maxLength={120} value={reminderForm.title} onChange={(event) => setReminderForm({ ...reminderForm, title: event.target.value })} placeholder="Example clinic preparation" /></label>
              <label>Date<input required type="date" value={reminderForm.date} onChange={(event) => setReminderForm({ ...reminderForm, date: event.target.value })} /></label>
              <button className="workspace-button" type="submit" disabled={!workspace.profiles.length}><Plus size={16} /> Add reminder</button>
            </form>
          </div>

          <div className="workspace-lists">
            <div>
              <h3>Demo profiles</h3>
              {workspace.profiles.length === 0
                ? <p className="empty-state">No fictional profiles yet.</p>
                : <div className="entry-list">{workspace.profiles.map((profile) => (
                    <article className="entry-row reminder-row" key={profile.id}>
                      <span className="mini-avatar"><Baby size={15} /></span>
                      <div><strong>{profile.name}</strong><span>{profile.relationship} · Born {profile.dateOfBirth}</span></div>
                      <button className="icon-button danger" aria-label={`Delete ${profile.name}`} onClick={() => deleteProfile(profile.id)}><Trash2 size={16} /></button>
                    </article>
                  ))}</div>}
            </div>
            <div>
              <h3>Growth entries</h3>
              {workspace.growthEntries.length === 0
                ? <p className="empty-state">No example measurements yet.</p>
                : <div className="entry-list">{workspace.growthEntries.slice().reverse().map((entry) => {
                    const profile = workspace.profiles.find((item) => item.id === entry.profileId);
                    return <article className="entry-row" key={entry.id}><Activity size={18} /><div><strong>{profile?.name || "Demo profile"}</strong><span>{entry.date}</span></div><b>{entry.weightKg} kg · {entry.heightCm} cm</b></article>;
                  })}</div>}
            </div>
            <div>
              <h3>Reminders</h3>
              {workspace.reminders.length === 0
                ? <p className="empty-state">No example reminders yet.</p>
                : <div className="entry-list">{workspace.reminders.slice().sort((a, b) => a.date.localeCompare(b.date)).map((reminder) => {
                    const profile = workspace.profiles.find((item) => item.id === reminder.profileId);
                    return <article className="entry-row reminder-row" key={reminder.id}><button className="icon-button" aria-label="Mark reminder complete" onClick={() => updateReminder(reminder.id, !reminder.completed)}>{reminder.completed && <CheckCircle2 size={18} />}</button><div className={reminder.completed ? "completed" : ""}><strong>{reminder.title}</strong><span>{profile?.name || "Demo profile"} · {reminder.date}</span></div><button className="icon-button danger" aria-label="Delete reminder" onClick={() => deleteReminder(reminder.id)}><Trash2 size={16} /></button></article>;
                  })}</div>}
            </div>
          </div>
        </section>
        </>}

        {currentPage === "assistant" && <>
        <section className="assistant-layout" id="assistant">
          <div className="assistant-intro">
            <div className="eyebrow"><MessageCircle size={15} /> Your conversation space</div>
            <h2>Ask MummyAI</h2>
            <p>The server uses a local Ollama model and can retrieve fictional sample records from MongoDB Atlas. It has no access to real health records or reviewed medical sources.</p>
            <div className="trust-note">
              <ShieldCheck size={19} />
              <div><strong>Safety comes first</strong><span>For medical concerns, contact a qualified healthcare professional. For emergencies, seek urgent care.</span></div>
            </div>
            <div className="suggestion-list">
              <p className="suggestion-label">TRY ASKING</p>
              {suggestions.map((item) => (
                <button key={item} className="suggestion" onClick={() => sendMessage(item)} disabled={loading}>
                  {item}<span>↗</span>
                </button>
              ))}
            </div>
          </div>

          <div className="chat-panel">
            <div className="chat-header">
              <div className="assistant-avatar"><Sprout size={21} /></div>
              <div><strong>MummyAI Companion</strong><span><i className="status-dot"></i> {mode === "agent" ? "Local Ollama" : "Demo mode"}</span></div>
              <span className="demo-badge">{mode === "agent" ? "AI AGENT" : "DEMO"}</span>
            </div>
            <div className="messages" aria-live="polite">
              {messages.map((item, index) => (
                <div key={`${item.role}-${index}`} className={`message-row ${item.role}`}>
                  {item.role === "assistant" && <div className="mini-avatar"><Sprout size={15} /></div>}
                  <div className="bubble">
                    <p>{item.text}</p>
                    {item.demo && <small>Demo response · Not medical advice</small>}
                    {item.ai && <small>AI-generated · Not medical advice</small>}
                  </div>
                </div>
              ))}
              {loading && <div className="typing">MummyAI is preparing a response…</div>}
              <div ref={messagesEndRef} />
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            <form className="composer" onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
              <label className="sr-only" htmlFor="message">Your question</label>
              <input
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={language === "si"
                  ? "සාමාන්‍ය ප්‍රශ්නයක් විමසන්න…"
                  : language === "ta"
                    ? "ஒரு பொதுவான கேள்வியைக் கேளுங்கள்…"
                    : "Ask a general question…"}
                maxLength={4000}
              />
              <button type="submit" aria-label="Send message" disabled={!message.trim() || loading}><Send size={18} /></button>
            </form>
            <p className="chat-footnote">Only fictional sample records are supported. Do not enter real names, identity numbers or private health information. Messages are sent to the configured local Ollama server.</p>
          </div>
        </section>
        </>}

        {currentPage === "safety" && <>
        <section className="safety-page">
          <div className="safety-heading">
            <div className="eyebrow"><ShieldCheck size={15} /> Safety and privacy</div>
            <h1>Designed to support care,<br /><span>not replace it.</span></h1>
            <p>MummyAI is a learning prototype with intentional limits. It is not a medical device and must not be used for diagnosis, treatment decisions, or real patient records.</p>
          </div>
          <div className="safety-grid">
            <article><span className="feature-icon rose"><ShieldCheck /></span><h2>Fictional data only</h2><p>Profiles and measurements in this prototype are synthetic examples. Do not enter real identities, medical history, prescriptions, or identity numbers.</p></article>
            <article><span className="feature-icon blue"><HeartPulse /></span><h2>Professional care matters</h2><p>Consult a qualified healthcare professional for health concerns. AI answers may be incomplete, outdated, or incorrect.</p></article>
            <article><span className="feature-icon gold"><CalendarDays /></span><h2>Urgent care comes first</h2><p>For severe breathing difficulty, unconsciousness, seizure, heavy bleeding, or another emergency, stop using the chat and seek urgent care now.</p></article>
            <article><span className="feature-icon green"><BookOpen /></span><h2>No clinical knowledge claim</h2><p>Demo responses are fixed educational examples. Agent answers require a local model and are not based on an approved or clinically reviewed knowledge source.</p></article>
          </div>
        </section>
        </>}
      </main>

      <footer>
        <a className="brand footer-brand" href="#home"><span className="brand-mark"><Sprout size={19} /></span><strong>MummyAI</strong></a>
        <p>Prototype for learning and evaluation · Not a medical service</p>
      </footer>
    </div>
  );
}
