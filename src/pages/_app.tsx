import { useEffect } from 'react';
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import ErrorBoundary from '../components/ErrorBoundary';
import AppLayout from '../components/AppLayout';
import { applyStoredTheme } from '../lib/themeStorage';

export default function App({ Component, pageProps }: AppProps) {
    useEffect(() => {
        applyStoredTheme();
    }, []);

    return (
        <ErrorBoundary>
            <AppLayout>
                <Component {...pageProps} />
            </AppLayout>
        </ErrorBoundary>
    );
}
