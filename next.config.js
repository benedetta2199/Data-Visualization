/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Allow loading scripts from CDN for OpenCV.js and TensorFlow
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net;",
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
