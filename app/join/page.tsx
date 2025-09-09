// Ruta: app/join/page.tsx

'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Usando el alias robusto

export default function JoinPage() {
  const [step, setStep] = useState(1);
  const [sessionCode, setSessionCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [answer3, setAnswer3] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const { data, error } = await supabase.from('sessions').select('id').eq('session_code', sessionCode.toUpperCase().trim()).single();
    if (error || !data) {
      setError('Código de sesión no válido. ¡Pide ayuda a tu profesor!');
    } else {
      setSessionId(data.id);
      setStep(2);
    }
    setIsLoading(false);
  };

  const handleSubmitResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !answer1.trim() || !answer2.trim() || !answer3.trim()) {
      setError('¡No te olvides de rellenar todos los campos!');
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data: studentData, error: studentError } = await supabase.from('students').insert({ full_name: fullName.trim() }).select('id').single();
    if (studentError || !studentData) {
      setError('Hubo un error al registrar tu nombre.');
      console.error("Student insertion error:", studentError);
      setIsLoading(false);
      return;
    }
    const studentId = studentData.id;
    const { error: responseError } = await supabase.from('responses').insert({ session_id: sessionId, student_id: studentId, answers: { q1: answer1, q2: answer2, q3: answer3 } });
    if (responseError) {
      setError('No se pudo enviar tu respuesta. Inténtalo de nuevo.');
      console.error("Response insertion error:", responseError);
    } else {
      setStep(3);
    }
    setIsLoading(false);
  };

  const renderContent = () => {
    if (step === 1) {
      return (
        <form onSubmit={handleVerifyCode} className="space-y-6">
          <h2 className="text-2xl font-bold text-center text-slate-800">¡Bienvenido/a a la Dinámica!</h2>
          <div>
            <label htmlFor="session-code" className="block text-sm font-bold text-slate-600 mb-1">Introduce el Código de la Sesión</label>
            <input id="session-code" type="text" value={sessionCode} onChange={(e) => setSessionCode(e.target.value.toUpperCase())} className="mt-1 block w-full p-3 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-2xl font-mono tracking-widest text-center" maxLength={6} placeholder="ABCDEF" required />
          </div>
          <button type="submit" disabled={isLoading} className="w-full bg-[#2563eb] text-white font-bold py-3 px-4 rounded-lg hover:bg-[#1d4ed8] disabled:bg-gray-400 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-1">
            {isLoading ? 'Verificando...' : 'Unirse'}
          </button>
        </form>
      );
    }

    if (step === 2) {
      return (
        <form onSubmit={handleSubmitResponse} className="space-y-6">
          <h2 className="text-2xl font-bold text-center text-slate-800">¡Hora de compartir!</h2>
          <div>
            <label htmlFor="full-name" className="block text-md font-bold text-slate-700">Tu Nombre y Apellidos</label>
            <input id="full-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 block w-full p-2 border border-slate-300 rounded-md" required />
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <label htmlFor="answer1" className="block text-md font-bold text-green-800">🏆 Mi Logro</label>
            <p className="text-sm text-green-700 mb-2">Describe un proyecto que organizaste o en el que participaste.</p>
            <textarea id="answer1" value={answer1} onChange={(e) => setAnswer1(e.target.value)} placeholder="Ej: Organicé un viaje con amigos, planifiqué una fiesta, encontré un trabajo de verano..." className="mt-1 block w-full p-2 border border-slate-300 rounded-md" rows={3} required />
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <label htmlFor="answer2" className="block text-md font-bold text-yellow-800">💡 Mi Habilidad</label>
            <p className="text-sm text-yellow-700 mb-2">Cuenta una habilidad nueva que aprendiste y cómo lo hiciste.</p>
            <textarea id="answer2" value={answer2} onChange={(e) => setAnswer2(e.target.value)} placeholder="Ej: Aprendí a usar Canva con tutoriales, mejoré mi inglés con una app..." className="mt-1 block w-full p-2 border border-slate-300 rounded-md" rows={3} required />
          </div>
          <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
            <label htmlFor="answer3" className="block text-md font-bold text-pink-800">🚀 Mi Lección</label>
            <p className="text-sm text-pink-700 mb-2">Narra un obstáculo o error que superaste y qué aprendiste de ello.</p>
            <textarea id="answer3" value={answer3} onChange={(e) => setAnswer3(e.target.value)} placeholder="Ej: Se canceló un vuelo y tuve que buscar alternativas, un proyecto no salió bien y aprendí a..." className="mt-1 block w-full p-2 border border-slate-300 rounded-md" rows={3} required />
          </div>
          <button type="submit" disabled={isLoading} className="w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-1">
            {isLoading ? 'Enviando...' : '¡Listo! Enviar Mis Respuestas'}
          </button>
        </form>
      );
    }

    if (step === 3) {
      return (
        <div className="text-center space-y-4 animate-fade-in">
          <svg className="mx-auto h-20 w-20 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-3xl font-bold text-slate-800">¡Genial!</h2>
          <p className="text-slate-600 text-lg">Tu respuesta se ha enviado. ¡Gracias por participar!</p>
        </div>
      );
    }
    
    // Si por alguna razón 'step' no es 1, 2 o 3, mostramos un mensaje por defecto
    return <div>Cargando...</div>;
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F0F4F8] bg-[radial-gradient(#d4e0eb_1px,transparent_1px)] [background-size:16px_1px]">
      <div className="w-full max-w-lg bg-white/80 backdrop-blur-sm p-8 rounded-xl shadow-2xl">
        {renderContent()}
        {error && <p className="text-red-600 mt-4 text-center font-semibold">{error}</p>}
      </div>
    </main>
  );
}