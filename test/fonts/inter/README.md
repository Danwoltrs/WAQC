# Inter (test fixture)

The three Inter TTFs the certificate registers in production
(`src/components/pdf/certificate/certificate-styles.ts`, Google Fonts, Inter v20,
weights 400 / 600 / 700), vendored so render tests can measure page fit with
the real metrics. `vitest.setup.ts` serves Noto Sans for every Inter request
by default; `quality-certificate.page-fit.test.tsx` serves these instead.

Inter is licensed under the SIL Open Font License 1.1 (https://rsms.me/inter/).
Files downloaded 2026-09-17 from the exact URLs in certificate-styles.ts.
