import { Html, Head, Main, NextScript } from "next/document";

/**
 * 全ページ共通: Google Fonts（Manrope, Noto Sans JP）と Material Symbols を読み込む。
 * 貼り付けた Iron Log 風デザインに合わせたフォント・アイコン用。
 */
export default function Document() {
    return (
        <Html lang="ja" className="dark" translate="no">
            <Head>
                <meta name="google" content="notranslate" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=Noto+Sans+JP:wght@400;500;700&display=swap"
                    rel="stylesheet"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <body className="font-sans antialiased min-h-screen bg-[#112211] text-slate-100" style={{ fontFamily: "'Noto Sans JP', 'Manrope', sans-serif" }}>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
