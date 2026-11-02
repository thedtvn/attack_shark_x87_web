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
- **Macros (experimental)**: automatically read the bank over USB, edit sequences in memory, then Save or Discard. Repeat settings are assigned in Key remap. See the safety notes below; playback has not yet been verified on hardware.
- **Keyboard Appearance**: Choose between factory colorways or customize your own palette:
  - **Charcoal & Yellow** (Default black): Stealth dark chassis, medium slate alphas, deep modifiers, and vivid yellow accents.
  - **Retro Cream**: Warm vintage cream chassis, dark charcoal alphas, cream modifiers, and tan accents.
  - **Custom Palette**: Customize shell, alphas, modifiers, accents, and legends with real-time contrast auto-tuning.
  - Persisted automatically in `localStorage`; available disconnected via the topbar palette popover or connected in Settings. Pure visual styling (never writes to HID hardware).
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
scripts/               Hardware probes, regression tests, and SVG generator
public/keyboard.svg    Scalable vector illustration (default black / Charcoal & Yellow, matching the 87 hit targets)
public/keyboard-cream.svg  Retro Cream edition vector illustration
public/keyboard-charcoal.svg Charcoal & Yellow edition vector illustration
```

## Disclaimer

Not affiliated with ATTACK SHARK. The keyboard image in `public/keyimg.png`
comes from the vendor software. Use at your own risk; the Settings page has a
factory reset if anything goes wrong.

## License

[MIT](LICENSE) © 2026 The DT

## Controller actions and Fn layers

**Key remap → Controller** assigns the documented X87 connection, lighting,
battery, reset and media shortcuts, plus separate **FN** and **FN2** layer keys.
The key SVG labels follow the actual stored action, not just its factory key
position. Fn + 1/2/3 selects Bluetooth channels; Fn + 4 selects the 2.4 GHz
receiver. Holding these shortcuts pairs them. Physical mode-switch position
still applies. Unknown actions remain preserved, not guessed.

FN2 encodes as `0D 01 00 00`; FN encodes as `0D 00 00 00`, from the vendor
encoder in Ghidra. The supplied `KB.ini` defines FN1 factory shortcuts and
leaves FN2 and Tap defaults empty. Changing layers does not write settings.
Controller remapping and hold behavior are not yet hardware-validated. Save
requires extra confirmation for new connection/reset bindings. Selecting a
controller action only edits a draft; it never intentionally executes it.

## Experimental macros

Macros use a shared 4096-byte keyboard bank. Uploading it is explicit and can
change **every key referencing the same slots on any layer**. Opening Macros
reads the keyboard's bank automatically over USB or experimental 2.4G pages. Edits exist only in memory;
there is no local-draft persistence or fallback. Export a backup before saving.

The UI/API support keyboard press/release, mouse buttons/movement/wheel,
20-bit millisecond intervals, and counted or indefinite repeat bindings.
Names are limited to 30 UTF-16 code units; 32 slots is a conservative client
limit, not a measured firmware maximum. The two indefinite repeat modes are
experimental. The protocol comes from Ghidra analysis, not an on-device macro
playback test.

- USB can import/read the bank and compares uploads with a full read-back.
- 2.4G macro read/write uses eight tagged 512-byte pages (`43` read / `03`
  write), confirmed in Ghidra and verified on hardware (write, byte-identical
  read-back, restore). Playback is not yet validated. A save takes ~20 s over
  2.4G. Backup/read-back must complete or the operation fails.
- Existing references on all layers are checked before upload. References to
  slots missing in the replacement block the upload.
- The Macros page only edits/uploads the bank; it never writes key bindings.
  Upload first, then assign a slot exclusively in **Key remap → Macro**.
- In the web editor, every upload first reads and saves the previous decoded bank
  to browser storage. Read/storage failure aborts before writing. Use **Export
  bank backup** to keep an external JSON copy; it does not include key bindings.
- JSON imports replace the in-memory editor in file order after confirmation;
  they do not write to the keyboard until **Save**. Invalid data is rejected.
- Unsaved macro, keymap and per-key colour edits block app navigation and focus/
  shake the **Discard / Save** bar. Browser close/reload uses the native warning;
  leaving anyway loses edits. No unsaved changes are stored locally.
- **Discard** restores the last keyboard snapshot. The last macro can be deleted
  and the empty bank saved explicitly, but references on every layer must first
  be removed in Key remap. Removing earlier slots shifts later slot numbers.
- Uploads are not atomic; a disconnect may leave a partial bank. Keep backups.
- Browser recording, if used, captures only events in the explicit recording
  area; the page cannot monitor keys system-wide like the native vendor app.

`npm test` includes macro byte fixtures, directory bounds, repeat modes and
wireless 512-byte page numbering. These tests use mocks, not your keyboard.
