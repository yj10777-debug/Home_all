import '../styles/globals.css';
import type { AppProps } from 'next/app';
import ErrorBoundary from '../components/ErrorBoundary';
import AppLayout from '../components/AppLayout';

export default function App({ Component, pageProps }: AppProps) {
    return (
        <ErrorBoundary>
            <AppLayout>
                <Component {...pageProps} />
            </AppLayout>
        </ErrorBoundary>
    );
}
