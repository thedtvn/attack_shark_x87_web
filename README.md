# attack_shark_x87_web

Web configurator for the **ATTACK SHARK X87** keyboard. It runs in the browser
and talks to the keyboard directly over [WebHID](https://developer.mozilla.org/docs/Web/API/WebHID_API),
with nothing to install. It works with the USB cable and with the 2.4G receiver.

The protocol was reverse engineered from the vendor tool `OemDrv.exe`; the Rust
library and full protocol notes are in
[attack_shark_x87_rs](https://github.com/thedtvn/attack_shark_x87_rs).

## Features

- **Lighting**: 19 effects, brightness, speed, colour, and editing each effect's 7-colour palette. Changes apply instantly.
- **Per-key RGB**: paint keys on a picture of the keyboard (click, drag, select, eyedropper), quick selections (WASD, arrows, F-row…), then apply and switch to custom mode.
- **Key remap**: 4 layers; keyboard keys with modifiers, media keys, mouse buttons, Fn, or disable. Changed keys are labelled, with save/discard.
- **Settings**: Tap on/off and sensitivity, wireless sleep timeout, debounce (with an extended range beyond the vendor app's 5 stages), factory reset.
- Light and dark theme.

## Requirements

- A Chromium-based desktop browser: Chrome, Edge or Opera. Firefox and Safari don't support WebHID.
- Served from `localhost` or HTTPS.
- Close the vendor app (`OemDrv.exe`) first; it holds the same HID interface.
- Bluetooth mode can't be configured; use the cable or the 2.4G receiver.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, host anywhere with HTTPS
```

Click **Connect device** and pick the keyboard (`2.4G Wireless Receiver` for
the dongle). After the first time, the page reconnects automatically.

### Hardware self-test (Node)

`npm run selftest` runs the same driver code from Node against the real
keyboard via `node-hid`. It reads the config and key map; writes are disabled
unless you explicitly pass `--write-back`. Close all other keyboard apps first.
Run `npm test` for hardware-free regression tests (USB report framing, Neon
stream settings, two-minute sleep encoding, and transaction serialization).

USB has several vendor collections. The browser must grant the collection
with feature report 6 (519 data bytes), not the smaller vendor interfaces.
If only the receiver was previously granted, reconnect using **Connect device**
and grant the USB keyboard too; a page cannot grant USB access silently.

## Project layout

```
src/hid/transport.ts   USB (feature reports) and 2.4G (20-byte reports) transports
src/hid/protocol.ts    config block, RGB palette, per-key colours, key matrix
src/hid/keyboard.ts    high-level X87 API
src/hid/layout.ts      key rectangles + LED indices (from the vendor KB.ini)
src/hid/usages.ts      HID keyboard / consumer usage names
src/components/        React UI
scripts/               Node self-tests against real hardware
```

## Disclaimer

Not affiliated with ATTACK SHARK. The keyboard image in `public/keyimg.png`
comes from the vendor software. Use at your own risk; the Settings page has a
factory reset if anything goes wrong.

## License

[MIT](LICENSE) © 2026 The DT
