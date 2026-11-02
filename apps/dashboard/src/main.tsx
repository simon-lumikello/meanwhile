import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@dashboard/services/queryClient'
import { ConfigProvider } from '@dashboard/context'
import '@dashboard/index.css'
import '@simon-lumikello/meanwhile-weather/style.css'
import '@simon-lumikello/meanwhile-radar/style.css'
import '@simon-lumikello/meanwhile-ambient/style.css'
import { AppUpdateNotice } from '@simon-lumikello/meanwhile-ui/react'
import App from '@dashboard/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <App />
        <AppUpdateNotice />
      </ConfigProvider>
    </QueryClientProvider>
  </StrictMode>,
)
