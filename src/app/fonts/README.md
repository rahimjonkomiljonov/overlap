# Fonts

`PretendardLatin.woff2` is `PretendardVariable.subset.91.woff2` from `pretendard@1.3.9`
(`dist/web/variable/woff2-dynamic-subset/`), used for Latin letters and digits only
(`unicode-range: U+0020-007E`, see `src/app/[locale]/layout.tsx`).

Korean text uses the operating system's Korean font (Apple SD Gothic Neo, Malgun Gothic,
Noto Sans KR). Self-hosting the Hangul slices cost ~230 KiB and 9 requests per page and
pushed Lighthouse mobile performance to 79, so they are intentionally not shipped.

Pretendard is licensed under the SIL Open Font License 1.1
(Copyright (c) 2021 Kil Hyung-jin, with Reserved Font Name Pretendard.
https://github.com/orioncactus/pretendard, https://scripts.sil.org/OFL).
