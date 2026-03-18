import type { Metadata } from "next";
import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
    title: "PicDemo",
    description: "Applicazione per elaborazione immagini con segmentazione e gradienti",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="it">
            <head>
                <link
                    rel="stylesheet"
                    href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
                />
            </head>
            <body className="bg-light">
                <Navbar />
                <main>
                    {children}
                </main>
            </body>
        </html>
    );
}
