import { QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import { queryClient } from './lib/queryClient.js';
import { router } from './router.js';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/*
        Pages are code-split, so every route is a lazy component and needs a
        Suspense boundary above it. The layouts wrap their own <Outlet/>, but
        /partner, /k and /login sit outside any layout — without this they would
        render a blank screen instead of their chunk. One boundary here covers
        every route, whatever the nesting.
      */}
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-brand-red" />
          </div>
        }
      >
        <RouterProvider router={router} />
      </Suspense>
      <Toaster position="top-center" richColors closeButton dir="rtl" />
    </QueryClientProvider>
  );
}
