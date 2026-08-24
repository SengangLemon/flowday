import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for the iOS build.');
  }

  return {
    root: path.resolve(process.cwd(), 'mobile'),
    publicDir: path.resolve(process.cwd(), 'public'),
    plugins: [react()],
    resolve: {
      alias: {
        'next/image': path.resolve(process.cwd(), 'mobile/next-image.tsx'),
        [path.resolve(process.cwd(), 'app/lib/supabase/client.ts')]: path.resolve(process.cwd(), 'mobile/supabase-client.ts'),
      },
    },
    define: {
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseKey),
    },
    build: {
      outDir: path.resolve(process.cwd(), 'mobile-dist'),
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2022',
    },
  };
});
