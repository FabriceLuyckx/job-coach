# Changelog

## [0.5.1](https://github.com/FabriceLuyckx/job-coach/compare/v0.5.0...v0.5.1) (2026-07-27)


### Bug Fixes

* **ci:** bump artifact actions to Node 24 majors (upload v6, download v7) ([3ae9e52](https://github.com/FabriceLuyckx/job-coach/commit/3ae9e52323dba8acaf507c26e8b8f9e08c4768dc))


### Performance Improvements

* **frontend:** cache Jobs/Applications/CreditChip data across page visits ([571b8b6](https://github.com/FabriceLuyckx/job-coach/commit/571b8b6d251299e75ab5c5261d1fc0b36ff76db3))


### Documentation

* **release:** update macOS first-launch instructions for macOS 15+ Gatekeeper ([a09e9c0](https://github.com/FabriceLuyckx/job-coach/commit/a09e9c0e8cb6babb06bcfe2f70bbb1b9670e2765))

## [0.5.0](https://github.com/FabriceLuyckx/job-coach/compare/v0.4.1...v0.5.0) (2026-07-27)


### Features

* **desktop:** host the SPA in a native window instead of the browser ([7d3c963](https://github.com/FabriceLuyckx/job-coach/commit/7d3c9632b394bfa66d92a39ff9de82c54f76da16))
* **packaging:** add background image and layout to macOS dmg ([ed36a1f](https://github.com/FabriceLuyckx/job-coach/commit/ed36a1ff76999adec7ed5e8d8ea89bf6d69e74ec))
* **updater:** add Intel macOS release build and asset selection ([0918878](https://github.com/FabriceLuyckx/job-coach/commit/0918878a796834282b3afebe55404e9360d78057))

## [0.4.1](https://github.com/FabriceLuyckx/job-coach/compare/v0.4.0...v0.4.1) (2026-07-27)


### Bug Fixes

* **ci:** dispatch the tagging pass after auto-merging the release PR ([ffdd508](https://github.com/FabriceLuyckx/job-coach/commit/ffdd508eae92fc9a5675786b1b6143860aa8ad7e))
* **ci:** dispatch the tagging pass after auto-merging the release PR ([02c45f9](https://github.com/FabriceLuyckx/job-coach/commit/02c45f9169ddaffc64e4155257ba038b83a20d83))
* **ci:** run the release chain on a PAT instead of GITHUB_TOKEN ([6e12250](https://github.com/FabriceLuyckx/job-coach/commit/6e12250011500128873566c79cbe969b38a851de))
* **ci:** run the release chain on a PAT instead of GITHUB_TOKEN ([410a0c1](https://github.com/FabriceLuyckx/job-coach/commit/410a0c1cfd7a951aff9c8a1683131b03fc296442))

## [0.4.0](https://github.com/FabriceLuyckx/job-coach/compare/v0.3.1...v0.4.0) (2026-07-26)


### Features

* **release:** auto-merge the release-please version-bump PR ([4cba174](https://github.com/FabriceLuyckx/job-coach/commit/4cba174c176a60d125befbe22a5347b567e97306))


### Bug Fixes

* **ci:** dispatch the binaries build and back-merge the version bump ([0222d6b](https://github.com/FabriceLuyckx/job-coach/commit/0222d6bd1db266e32e73e900a1cce7440d0b77c3))
* **ci:** dispatch the binaries build and back-merge the version bump ([5a6a0c2](https://github.com/FabriceLuyckx/job-coach/commit/5a6a0c2a98c0397d4629d42c4998c845994b87d0))
* **update:** serve real dist files before the SPA fallback, tweak update copy ([d17e596](https://github.com/FabriceLuyckx/job-coach/commit/d17e5962a0652a0dbc6ef451213e9fd2d2ac6d2d))

## [0.3.1](https://github.com/FabriceLuyckx/job-coach/compare/v0.3.0...v0.3.1) (2026-07-26)


### Performance Improvements

* **ci:** build frontend once and use uv for Python deps in release builds ([513aa1c](https://github.com/FabriceLuyckx/job-coach/commit/513aa1c2b8a01cce987eb71a4ad482d0fef55181))

## [0.3.0](https://github.com/FabriceLuyckx/job-coach/compare/v0.2.0...v0.3.0) (2026-07-26)


### Features

* add About modal and automated release versioning ([e60a2b2](https://github.com/FabriceLuyckx/job-coach/commit/e60a2b28c8d606d5c568ef91e80b95a00808fe95))
* add app icon (favicon, macOS .icns, Windows .ico) and refine nav logo styling ([fa9be0f](https://github.com/FabriceLuyckx/job-coach/commit/fa9be0fe4b586b57a23f986fd9cb68eb9c4095c1))
* **update:** add guarded in-app self-updater ([6e121f4](https://github.com/FabriceLuyckx/job-coach/commit/6e121f4da68d6f6cb0319756596f46caaec092f4))


### Bug Fixes

* **ci:** pin release-please target branch to stable ([61db502](https://github.com/FabriceLuyckx/job-coach/commit/61db502bc87d6996a661324c485d7d94830755e7))
* **packaging:** bundle app version metadata and local AI engine in desktop build ([058f25e](https://github.com/FabriceLuyckx/job-coach/commit/058f25e378512e85025c282e36f5bbcf3556d974))
* surface the user's own reject reason in Job Suggestions History, separate verdict reason from summary ([41f2217](https://github.com/FabriceLuyckx/job-coach/commit/41f2217a9203911d28a81bdeb7acde08e0a8075a))


### Documentation

* add contribution workflow, PR template, and bug report issue template ([994345e](https://github.com/FabriceLuyckx/job-coach/commit/994345e94292e13ed877575aa7cca7dfade13b3e))

## [0.2.0](https://github.com/FabriceLuyckx/job-coach/compare/v0.1.0...v0.2.0) (2026-07-26)


### Features

* **update:** add guarded in-app self-updater ([6e121f4](https://github.com/FabriceLuyckx/job-coach/commit/6e121f4da68d6f6cb0319756596f46caaec092f4))
