import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Analytics } from '@vercel/analytics/react'
import { createRoot } from 'react-dom/client'
import { AppUpdateNotice } from '@simon-lumikello/meanwhile-ui/react'
import App from './App'
import './style.css'
import '@simon-lumikello/meanwhile-weather/style.css'
import '@simon-lumikello/meanwhile-radar/style.css'
import '@simon-lumikello/meanwhile-ambient/style.css'
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } })
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><App /><AppUpdateNotice /><Analytics /></QueryClientProvider>)
