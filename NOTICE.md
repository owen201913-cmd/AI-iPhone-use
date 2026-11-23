# Notices

The standalone phone host, its tests and setup scripts were extracted and adapted from the local Iphone use / Jev Assistant implementation. Project source is distributed under GPL-3.0-only. The upstream projects below retain their own terms.

- The optional iOS patch targets [ish-app/ish at ce96e698](https://github.com/ish-app/ish/tree/ce96e698f1820b9d8db47e87c501ecb89119d7ce). See [the upstream license](ios/ISH-LICENSE.md), [the iOS additional terms](ios/LICENSE.IOS), and [GPLv3](LICENSE). iSH and its submodules are fetched at build time.
- The Python USB backend uses [pymobiledevice3](https://github.com/doronz88/pymobiledevice3) (GPL-3.0-or-later) and [Pillow](https://github.com/python-pillow/Pillow). Install them with their license files through pip.
- Node dependencies and exact package versions are recorded in package-lock.json. npm installs their own license files alongside the packages.
- [Pinky](https://github.com/DIYgod/pinky) is an optional, separately installed Apache-2.0 application. This repository contains the MCP client integration.
