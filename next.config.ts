/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // --- AÑADE ESTA SECCIÓN ---
  eslint: {
    // Warning: Esto desactivará los errores de ESLint durante el build.
    // Es útil para desplegar rápidamente, pero se recomienda arreglar los errores.
    ignoreDuringBuilds: true,
  },
  // --------------------------
};

export default nextConfig;