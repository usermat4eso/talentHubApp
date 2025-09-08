// Ruta del archivo: app/session/[sessionId]/report/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient'; // Navegamos 4 niveles hacia arriba para llegar a /lib
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Definimos el tipo de datos que esta página espera recibir de la BD
type SessionReport = {
  title: string | null;
  created_at: string;
  ai_report: { markdown: string } | null;
  cycles: { name: string };
};

interface ReportPageProps {
  params: {
    sessionId: string;
  };
}

export default function ReportPage({ params }: ReportPageProps) {
  const { sessionId } = params;
  const [session, setSession] = useState<SessionReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // useEffect se ejecuta cuando la página carga para buscar los datos del informe
  useEffect(() => {
    if (!sessionId) return;

    const fetchReport = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('sessions')
        .select(`title, created_at, ai_report, cycles (name)`)
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('Error fetching report:', error);
        setError('No se pudo encontrar el informe para esta sesión.');
      } else if (data) {
        setSession(data as SessionReport);
      } else {
        setError('La sesión no fue encontrada.');
      }
      setIsLoading(false);
    };

    fetchReport();
  }, [sessionId]);

  // Función auxiliar para renderizar el contenido principal
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="text-center py-12">
          <p className="text-xl font-semibold text-slate-600 animate-pulse">✏️ Cargando informe...</p>
        </div>
      );
    }

    if (error) {
      return <div className="text-center py-12 text-xl font-semibold text-red-600">{error}</div>;
    }

    if (!session?.ai_report?.markdown) {
      return (
        <div className="text-center py-12">
            <p className="text-xl font-semibold text-amber-600">Esta sesión aún no tiene un informe de IA generado.</p>
            <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
                Volver al panel y generar el informe.
            </Link>
        </div>
      );
    }
    
    // Si todo está correcto, renderizamos el informe con un estilo cuidado
    return (
      <article className="prose prose-lg max-w-none prose-headings:text-[#102A43] prose-p:text-[#243B53] prose-strong:text-[#102A43] prose-blockquote:border-l-purple-400 prose-blockquote:bg-purple-50 prose-blockquote:text-purple-800">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {session.ai_report.markdown}
        </ReactMarkdown>
      </article>
    );
  };

  return (
    <main className="min-h-screen p-4 sm:p-8 bg-[#F0F4F8] bg-[radial-gradient(#d4e0eb_1px,transparent_1px)] [background-size:16px_16px]">
      <div className="w-full max-w-4xl mx-auto">
        <div className="mb-8">
            <Link href="/" className="text-blue-600 font-semibold hover:underline text-lg">
             ← Volver al Panel de Sesiones
            </Link>
        </div>
        
        <div className="bg-white/90 backdrop-blur-sm p-8 sm:p-12 rounded-2xl shadow-2xl">
          <div className="text-center border-b-2 border-slate-200 pb-4 mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-[#102A43]">{session?.title || 'Informe de Sesión'}</h1>
            <p className="text-md sm:text-lg text-[#486581] mt-2">
              {session ? `${session.cycles.name} - Creada el ${new Date(session.created_at).toLocaleDateString()}` : 'Cargando datos...'}
            </p>
          </div>
          
          {renderContent()}

        </div>
      </div>
    </main>
  );
}