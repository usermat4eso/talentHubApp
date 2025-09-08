// Ruta del archivo: app/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal from 'react-modal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- DEFINICIONES DE TIPOS DE DATOS (TYPESCRIPT) ---

type Session = {
  id: number;
  created_at: string;
  session_code: string;
  status: string;
  title: string | null;
  ai_report: { markdown: string } | null;
  cycles: { name: string, id: number }; // Añadimos ID para el análisis
};

type StudentResponse = {
  id: number;
  student: { full_name: string };
  answers: { q1: string; q2: string; q3: string; };
};

type Cycle = {
  id: number;
  name: string;
};

// --- CONFIGURACIÓN DEL MODAL (PARA ACCESIBILIDAD) ---
if (typeof window !== 'undefined') {
  Modal.setAppElement('body');
}

// --- COMPONENTE REUTILIZABLE PARA LA TARJETA DE RESPUESTA ---
const ResponseCard = ({ title, content, color, author }: { title: string; content: string; color: string; author: string }) => (
    <div className={`p-4 rounded-lg shadow-md ${color} animate-fade-in`}>
      <h4 className="font-bold text-lg border-b border-black border-opacity-10 pb-2 mb-2">{title}</h4>
      <p className="text-gray-800 text-base mb-3 min-h-[60px]">{content}</p>
      <p className="text-right text-sm font-semibold text-gray-700 opacity-80">- {author}</p>
    </div>
);

// --- COMPONENTE PRINCIPAL DEL PANEL DEL PROFESOR ---
export default function ProfessorDashboard() {
  // --- ESTADOS PRINCIPALES ---
  const [view, setView] = useState<'list' | 'session'>('list'); // Controla qué vista se muestra
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para el modal de creación de sesión
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');

  // Estados para el modal de análisis de IA
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // --- CARGA INICIAL DE DATOS ---
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select(`id, created_at, session_code, status, title, ai_report, cycles (id, name)`)
        .order('created_at', { ascending: false });
      
      const { data: cyclesData, error: cyclesError } = await supabase.from('cycles').select('id, name');

      if (sessionsError) setError("Error al cargar las sesiones: " + sessionsError.message);
      else setSessions(sessionsData as Session[]);

      if (cyclesError) setError("Error al cargar los ciclos: " + cyclesError.message);
      else setCycles(cyclesData);
      
      setIsLoading(false);
    };
    fetchData();
  }, []);
  
  // --- SUSCRIPCIÓN A TIEMPO REAL (SE ACTIVA SOLO EN LA VISTA DE SESIÓN) ---
  useEffect(() => {
    if (view !== 'session' || !currentSession?.id) return;

    const subscription = supabase
      .channel(`session-responses-${currentSession.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'responses', filter: `session_id=eq.${currentSession.id}` },
        async (payload) => {
          const { data: studentData } = await supabase.from('students').select('full_name').eq('id', payload.new.student_id).single();
          const newResponse = { ...(payload.new as any), student: { full_name: studentData?.full_name || 'Anónimo' }};
          setResponses(prev => [...prev, newResponse]);
        }
      )
      .subscribe();
      
    return () => { supabase.removeChannel(subscription); };
  }, [view, currentSession]);

  // --- MANEJADORES DE EVENTOS (HANDLERS) ---
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCycleId || !newSessionTitle) {
        alert("Por favor, completa el título y selecciona un ciclo.");
        return;
    }
    
    setIsLoading(true);
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const { data, error } = await supabase.from('sessions').insert({ 
        activity_template_id: 1, 
        cycle_id: parseInt(selectedCycleId), 
        course_year: 1, 
        session_code: newCode, 
        status: 'active',
        title: newSessionTitle
    }).select(`id, created_at, session_code, status, title, ai_report, cycles (id, name)`).single();

    if (error) {
      setError(error.message);
    } else if (data) {
      setSessions([data as Session, ...sessions]);
      handleSelectSession(data as Session); // Abrir la sesión recién creada
      setIsCreateModalOpen(false); // Cerrar el modal
      setNewSessionTitle('');
      setSelectedCycleId('');
    }
    setIsLoading(false);
  };
  
  const handleSelectSession = async (session: Session) => {
    setIsLoading(true);
    setCurrentSession(session);
    const { data, error } = await supabase.from('responses').select(`id, answers, student:students (full_name)`).eq('session_id', session.id);
    
    if (error) {
        setError("Error al cargar las respuestas de la sesión.");
        setResponses([]);
    } else {
        setResponses(data as StudentResponse[]);
    }
    
    setView('session'); // Cambiar a la vista de la sesión individual
    setIsLoading(false);
  };

  const handleAnalyze = async () => {
    if (!currentSession || responses.length === 0) return;
    
    setIsAnalyzing(true);
    setAnalysisResult(null); // Limpiar resultado anterior
    setIsReportModalOpen(true); // Abrir modal para mostrar "cargando"

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responses, cycleId: currentSession.cycles.id, sessionId: currentSession.id }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error desconocido en el servidor');
        }
        const data = await response.json();
        setAnalysisResult(data.analysis);
        
        // Actualizamos el estado local para que el cambio se refleje sin recargar
        const updatedSession = { ...currentSession, ai_report: { markdown: data.analysis }, status: 'closed' };
        setCurrentSession(updatedSession);
        setSessions(sessions.map(s => s.id === updatedSession.id ? updatedSession : s));

    } catch (err: any) {
        setAnalysisResult(`Hubo un error al generar el informe:\n\n${err.message}`);
    } finally {
        setIsAnalyzing(false);
    }
  };
  
  const showReport = (session: Session) => {
    if (session.ai_report?.markdown) {
      setAnalysisResult(session.ai_report.markdown);
      setIsReportModalOpen(true);
    }
  };

  // --- RENDERIZADO VISUAL ---
  if (isLoading && sessions.length === 0) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-xl">Cargando Sesiones...</div>;
  }
  
  return (
    <main className="min-h-screen p-4 sm:p-8 bg-[#F0F4F8] bg-[radial-gradient(#d4e0eb_1px,transparent_1px)] [background-size:16px_16px]">
      <div className="w-full max-w-7xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#102A43]">TalentHub Dinámico</h1>
          <p className="text-lg text-[#486581] mt-2">Panel del Profesor</p>
        </header>

        {/* --- VISTA DE LISTA DE SESIONES --- */}
        {view === 'list' && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-[#243B53]">Mis Sesiones</h2>
              <button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-all shadow-md transform hover:scale-105">
                + Nueva Dinámica
              </button>
            </div>
            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-lg space-y-3">
              {sessions.length > 0 ? sessions.map(session => (
                <div key={session.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center p-3 rounded-md hover:bg-slate-100 transition-colors">
                  <div className="col-span-1 md:col-span-2">
                    <p className="font-bold text-slate-800">{session.title || `Sesión del ${new Date(session.created_at).toLocaleDateString()}`}</p>
                    <p className="text-sm text-slate-500">{session.cycles.name} - Código: {session.session_code}</p>
                  </div>
                  <div className="text-center">
                    {session.ai_report ? (
                      <button onClick={() => showReport(session)} className="text-sm bg-purple-100 text-purple-700 font-semibold py-1 px-3 rounded-full hover:bg-purple-200 transition-colors">
                        Ver Informe IA
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Sin informe</span>
                    )}
                  </div>
                  <div className="text-right">
                    <button onClick={() => handleSelectSession(session)} className="text-sm bg-slate-200 text-slate-800 font-semibold py-1 px-3 rounded-full hover:bg-slate-300 transition-colors">
                      Gestionar Sesión
                    </button>
                  </div>
                </div>
              )) : <p className="text-center text-slate-500 p-4">No has creado ninguna sesión todavía. ¡Crea una para empezar!</p>}
            </div>
          </div>
        )}

        {/* --- VISTA DE UNA SESIÓN INDIVIDUAL --- */}
        {view === 'session' && currentSession && (
          <div className="animate-fade-in">
            <button onClick={() => setView('list')} className="mb-4 text-blue-600 font-semibold hover:underline">← Volver a Mis Sesiones</button>
            <div className="text-center mb-6 bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-lg">
                <h2 className="text-3xl font-bold text-[#102A43]">{currentSession.title}</h2>
                <p className="text-lg text-slate-500">Pizarra de Talentos ({responses.length}) - Código: <span className="font-mono">{currentSession.session_code}</span></p>
                
                {currentSession.ai_report ? (
                    <button onClick={() => showReport(currentSession)} className="mt-4 bg-purple-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-1 transition-all">Ver Informe IA</button>
                ) : (
                    <button onClick={handleAnalyze} disabled={isAnalyzing || responses.length === 0} className="mt-4 bg-purple-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-1 transition-all disabled:bg-gray-400 disabled:transform-none">
                        {isAnalyzing ? 'Analizando...' : '🤖 Analizar con IA'}
                    </button>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-6"><h3 className="text-2xl font-bold text-center text-[#059669]">🏆 Logros</h3>{responses.map(res => ( <ResponseCard key={`q1-${res.id}`} title="Proyecto Organizado" content={res.answers.q1} color="bg-green-200/70 border border-green-300" author={res.student.full_name} /> ))}</div>
              <div className="space-y-6"><h3 className="text-2xl font-bold text-center text-[#d97706]">💡 Habilidades</h3>{responses.map(res => ( <ResponseCard key={`q2-${res.id}`} title="Nuevo Aprendizaje" content={res.answers.q2} color="bg-yellow-200/70 border border-yellow-300" author={res.student.full_name} /> ))}</div>
              <div className="space-y-6"><h3 className="text-2xl font-bold text-center text-[#db2777]">🚀 Lecciones</h3>{responses.map(res => ( <ResponseCard key={`q3-${res.id}`} title="Obstáculo Superado" content={res.answers.q3} color="bg-pink-200/70 border border-pink-300" author={res.student.full_name} /> ))}</div>
            </div>
          </div>
        )}

        {/* --- MODALES --- */}
        <Modal isOpen={isCreateModalOpen} onRequestClose={() => setIsCreateModalOpen(false)} 
            className="absolute top-1/2 left-1/2 right-auto bottom-auto mr-[-50%] transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-2xl p-6 w-11/12 max-w-md outline-none" 
            overlayClassName="fixed inset-0 bg-black bg-opacity-75">
            <form onSubmit={handleCreateSession} className="space-y-4">
                <h2 className="text-xl font-bold">Nueva Dinámica</h2>
                <input type="text" placeholder="Título de la sesión (ej: 1º GA Inicio)" value={newSessionTitle} onChange={e => setNewSessionTitle(e.target.value)} className="w-full p-2 border rounded" required />
                <select value={selectedCycleId} onChange={e => setSelectedCycleId(e.target.value)} className="w-full p-2 border rounded" required>
                    <option value="" disabled>-- Elige un ciclo --</option>
                    {cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
                </select>
                <div className="flex justify-end gap-2 pt-4">
                    <button type="button" onClick={() => setIsCreateModalOpen(false)} className="bg-gray-200 py-2 px-4 rounded font-semibold">Cancelar</button>
                    <button type="submit" disabled={isLoading} className="bg-blue-600 text-white py-2 px-4 rounded font-semibold disabled:bg-gray-400">{isLoading ? 'Creando...' : 'Crear Sesión'}</button>
                </div>
            </form>
        </Modal>

        <Modal isOpen={isReportModalOpen} onRequestClose={() => setIsReportModalOpen(false)} 
            className="absolute top-1/2 left-1/2 right-auto bottom-auto mr-[-50%] transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-2xl w-11/12 max-w-2xl outline-none" 
            overlayClassName="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="max-h-[80vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">Informe del Grupo por IA</h2>
            {isAnalyzing ? 
                <p className="text-center p-8">🤖 La inteligencia artificial está analizando las respuestas... Por favor, espera un momento.</p> 
                : 
                <article className="prose prose-slate max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult || "No se ha podido generar el informe."}</ReactMarkdown>
                </article>
            }
            <button onClick={() => setIsReportModalOpen(false)} className="mt-6 bg-slate-600 text-white font-bold py-2 px-4 rounded-lg w-full hover:bg-slate-700 transition-colors">Cerrar</button>
          </div>
        </Modal>
      </div>
    </main>
  );
}