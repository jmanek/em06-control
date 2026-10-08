# EM06 Control

Profile and key remapping software for the ProtoArc EM06 trackball mouse.

Use it here: [EM06 Control](https://jmanek.github.io/em06-control/web/)

## What it can do

- Read all four mouse profiles.
- Write changes to any profile without changing which profile the mouse is using.
- Switch directly to Profile 1, 2, 3, or 4.
- Notice when the mouse changes profile and update the app automatically.
- Remap the mouse buttons using the same functions as the ProtoArc Hub.
- Set common shortcuts such as Copy, Paste, Cut, and Screenshot.
- Record custom key combinations.
- Set a key to cycle through profiles: 1 → 2 → 3 → 4 → 1.
- Read and assign existing macro slots.
- Read the connected mouse firmware version and link to ProtoArc Hub for updates.

The profile-cycle helper can use any mouse button.

## Status

This project is under active development. It works with the EM06, but the interface and macro support are still being improved.

## Run it locally

Open `web/index.html` through a local web server, then connect the mouse in Chrome or Edge.

For example:

```sh
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/web/
```

Run the tests with:

```sh
npm test
```

## Safety

Reading does not write anything to the mouse. Profile reads and writes restore the profile that was active before the operation. Writing requires an explicit action in the app.
