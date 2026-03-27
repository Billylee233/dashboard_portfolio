/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@google-cloud/bigquery'],
  },

  // 프로덕션 빌드에서 소스맵 비활성화 (원본 코드 노출 방지)
  productionBrowserSourceMaps: false,

  // 보안 HTTP 헤더
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // iframe 임베드 차단
          { key: 'X-Frame-Options', value: 'DENY' },
          // MIME 스니핑 차단
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Referrer 최소화
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // 검색엔진·AI 크롤러 noindex
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          // 권한 정책 (불필요한 브라우저 기능 차단)
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // XSS 방어 (구형 브라우저용)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
